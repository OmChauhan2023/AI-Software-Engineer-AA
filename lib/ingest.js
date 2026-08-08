import { execFile } from "child_process";
import { promisify } from "util";
import fs from "fs/promises";
import path from "path";
import os from "os";
import { getDb } from "./mongodb";
import { embedMany } from "./embeddings";

const execFileP = promisify(execFile);

export const MAX_FILES = 400;
const MAX_FILE_BYTES = 1024 * 1024; // 1MB
const CLONE_TIMEOUT_MS = 120000;

const SKIP_DIRS = new Set([
  ".git", "node_modules", "dist", "build", "out", ".next", ".nuxt",
  ".venv", "venv", "env", "__pycache__", ".idea", ".vscode", "coverage",
  ".cache", ".turbo", "vendor", ".gradle", ".mvn", "Pods", "DerivedData",
  "bower_components", ".pytest_cache", ".mypy_cache", ".git",
]);

const SKIP_FILES = new Set([
  "package-lock.json", "yarn.lock", "pnpm-lock.yaml", "poetry.lock",
  "Cargo.lock", "composer.lock", "Gemfile.lock", "go.sum",
]);

const LANG_BY_EXT = {
  py: "python", js: "javascript", jsx: "javascript", mjs: "javascript", cjs: "javascript",
  ts: "typescript", tsx: "typescript", go: "go", java: "java", rb: "ruby",
  rs: "rust", c: "c", h: "c", cpp: "cpp", cc: "cpp", hpp: "cpp", cxx: "cpp",
  cs: "csharp", php: "php", swift: "swift", kt: "kotlin", scala: "scala",
  sh: "shell", bash: "shell", zsh: "shell", sql: "sql", md: "markdown",
  mdx: "markdown", txt: "plaintext", json: "json", yaml: "yaml", yml: "yaml",
  toml: "toml", ini: "ini", html: "html", htm: "html", css: "css",
  scss: "scss", less: "less", vue: "vue", svelte: "svelte", dart: "dart",
  ex: "elixir", exs: "elixir", clj: "clojure", r: "r", lua: "lua",
};

const SYMBOL_REGEXES = [
  /(?:export\s+)?(?:default\s+)?(?:async\s+)?function\s+([A-Za-z0-9_$]+)/,
  /(?:export\s+)?class\s+([A-Za-z0-9_$]+)/,
  /^\s*def\s+([A-Za-z0-9_]+)/,
  /^\s*(?:public|private|protected|static|\s)*\s*(?:func|fn)\s+([A-Za-z0-9_]+)/,
  /(?:export\s+)?(?:const|let|var)\s+([A-Za-z0-9_$]+)\s*=\s*(?:async\s*)?\(/,
  /type\s+([A-Za-z0-9_$]+)\s+struct/,
  /interface\s+([A-Za-z0-9_$]+)/,
];

export function parseGithubUrl(input) {
  if (!input || typeof input !== "string") return null;
  const cleaned = input.trim();
  const m = cleaned.match(/github\.com[/:]([\w.-]+)\/([\w.-]+?)(?:\.git)?(?:[/#?].*)?$/i);
  if (!m) return null;
  const owner = m[1];
  const repo = m[2];
  if (!owner || !repo) return null;
  return {
    owner,
    repo,
    name: `${owner}/${repo}`,
    cloneUrl: `https://github.com/${owner}/${repo}.git`,
    webUrl: `https://github.com/${owner}/${repo}`,
  };
}

function detectSymbol(lines) {
  for (const line of lines.slice(0, 8)) {
    for (const re of SYMBOL_REGEXES) {
      const m = line.match(re);
      if (m && m[1]) return m[1];
    }
  }
  return null;
}

function chunkFile(content, filePath, language) {
  const lines = content.split("\n");
  const chunks = [];
  const WINDOW = 55;
  const OVERLAP = 12;
  const step = WINDOW - OVERLAP;
  for (let start = 0; start < lines.length; start += step) {
    const end = Math.min(start + WINDOW, lines.length);
    const slice = lines.slice(start, end);
    const text = slice.join("\n");
    if (!text.trim()) {
      if (end >= lines.length) break;
      continue;
    }
    chunks.push({
      startLine: start + 1,
      endLine: end,
      symbolName: detectSymbol(slice),
      text,
    });
    if (end >= lines.length) break;
  }
  return chunks;
}

async function walk(dir, base, acc) {
  let entries;
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      await walk(full, base, acc);
    } else if (entry.isFile()) {
      if (SKIP_FILES.has(entry.name)) continue;
      const ext = entry.name.split(".").pop().toLowerCase();
      const language = LANG_BY_EXT[ext];
      if (!language) continue;
      acc.push({ full, rel: path.relative(base, full), language });
    }
  }
}

async function updateRepo(repoId, fields) {
  const db = await getDb();
  await db.collection("repositories").updateOne({ id: repoId }, { $set: { ...fields, updatedAt: new Date().toISOString() } });
}

export async function startIngestion(repoId, cloneUrl) {
  const tmpDir = path.join(os.tmpdir(), `repo-${repoId}`);
  const db = await getDb();
  try {
    // cleanup any previous data
    await db.collection("chunks").deleteMany({ repoId });
    await db.collection("files").deleteMany({ repoId });
    await fs.rm(tmpDir, { recursive: true, force: true });

    // 1. CLONE
    await updateRepo(repoId, { status: "cloning", error: null, filesProcessed: 0, totalFiles: 0, chunksEmbedded: 0, chunksTotal: 0 });
    try {
      await execFileP("git", ["clone", "--depth", "1", cloneUrl, tmpDir], {
        env: { ...process.env, GIT_TERMINAL_PROMPT: "0", GIT_ASKPASS: "echo" },
        timeout: CLONE_TIMEOUT_MS,
        maxBuffer: 1024 * 1024 * 64,
      });
    } catch (e) {
      throw new Error("Could not clone repository. Make sure it is a valid, public GitHub repo.");
    }

    // 2. PARSE / WALK
    await updateRepo(repoId, { status: "parsing" });
    const found = [];
    await walk(tmpDir, tmpDir, found);

    if (found.length === 0) {
      throw new Error("No supported source files found in this repository.");
    }
    if (found.length > MAX_FILES) {
      throw new Error(`Repository too large \u2014 ${found.length} source files found (V1 limit is ${MAX_FILES}). Try a smaller repo.`);
    }

    await updateRepo(repoId, { totalFiles: found.length });

    const fileDocs = [];
    const allChunks = [];
    let processed = 0;
    for (const f of found) {
      processed++;
      let buf;
      try {
        buf = await fs.readFile(f.full);
      } catch {
        continue;
      }
      if (buf.length > MAX_FILE_BYTES) {
        if (processed % 10 === 0) await updateRepo(repoId, { filesProcessed: processed });
        continue;
      }
      // binary check
      if (buf.includes(0)) {
        if (processed % 10 === 0) await updateRepo(repoId, { filesProcessed: processed });
        continue;
      }
      const content = buf.toString("utf8");
      const fileId = crypto.randomUUID();
      fileDocs.push({
        id: fileId,
        repoId,
        path: f.rel,
        language: f.language,
        size: buf.length,
        content,
      });
      const chunks = chunkFile(content, f.rel, f.language);
      for (const ch of chunks) {
        allChunks.push({
          id: crypto.randomUUID(),
          repoId,
          fileId,
          path: f.rel,
          language: f.language,
          startLine: ch.startLine,
          endLine: ch.endLine,
          symbolName: ch.symbolName,
          text: ch.text,
        });
      }
      if (processed % 5 === 0) await updateRepo(repoId, { filesProcessed: processed });
    }
    await updateRepo(repoId, { filesProcessed: processed, fileCount: fileDocs.length });

    if (fileDocs.length) {
      // insert files in batches
      for (let i = 0; i < fileDocs.length; i += 50) {
        await db.collection("files").insertMany(fileDocs.slice(i, i + 50));
      }
    }

    if (allChunks.length === 0) {
      throw new Error("No readable text content to index in this repository.");
    }

    // 3. EMBED
    await updateRepo(repoId, { status: "embedding", chunksTotal: allChunks.length, chunksEmbedded: 0 });
    const texts = allChunks.map((c) => `File: ${c.path}${c.symbolName ? ` (${c.symbolName})` : ""}\n${c.text}`);
    let lastUpdate = 0;
    const vectors = await embedMany(texts, 16, async (done) => {
      if (done - lastUpdate >= 48 || done === texts.length) {
        lastUpdate = done;
        await updateRepo(repoId, { chunksEmbedded: done });
      }
    });
    for (let i = 0; i < allChunks.length; i++) {
      allChunks[i].embedding = vectors[i];
    }
    for (let i = 0; i < allChunks.length; i += 100) {
      await db.collection("chunks").insertMany(allChunks.slice(i, i + 100));
    }

    // 4. READY
    await updateRepo(repoId, {
      status: "ready",
      chunksEmbedded: allChunks.length,
      chunkCount: allChunks.length,
      fileCount: fileDocs.length,
      readyAt: new Date().toISOString(),
    });
  } catch (err) {
    await updateRepo(repoId, { status: "failed", error: err.message || "Ingestion failed" });
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  }
}
