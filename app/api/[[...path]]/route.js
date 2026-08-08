import { NextResponse } from "next/server";
import { getDb } from "@/lib/mongodb";
import { warmup } from "@/lib/embeddings";
import { retrieve } from "@/lib/retrieve";
import { parseGithubUrl, startIngestion, MAX_FILES } from "@/lib/ingest";
import { LlmChat, UserMessage } from "emergentintegrations";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

// Warm the embedding model on first import (non-blocking)
warmup();

function json(data, status = 200) {
  return NextResponse.json(data, { status });
}

function getSegments(request) {
  const url = new URL(request.url);
  const parts = url.pathname.split("/").filter(Boolean); // ['api', ...]
  return parts.slice(1); // drop 'api'
}

async function readBody(request) {
  try {
    return await request.json();
  } catch {
    return {};
  }
}

// ---------------- GET ----------------
export async function GET(request) {
  const seg = getSegments(request);
  const url = new URL(request.url);
  const db = await getDb();

  try {
    // GET /api/  (health)
    if (seg.length === 0) {
      return json({ ok: true, service: "RepoChat API" });
    }

    // GET /api/repos?userId=
    if (seg[0] === "repos" && seg.length === 1) {
      const userId = url.searchParams.get("userId");
      const query = userId ? { userId } : {};
      const repos = await db
        .collection("repositories")
        .find(query, { projection: { _id: 0 } })
        .sort({ createdAt: -1 })
        .toArray();
      return json({ repos });
    }

    if (seg[0] === "repos" && seg.length >= 2) {
      const repoId = seg[1];
      const repo = await db.collection("repositories").findOne({ id: repoId }, { projection: { _id: 0 } });
      if (!repo) return json({ error: "Repository not found" }, 404);

      // GET /api/repos/:id/status
      if (seg[2] === "status") {
        return json({
          id: repo.id,
          status: repo.status,
          error: repo.error || null,
          totalFiles: repo.totalFiles || 0,
          filesProcessed: repo.filesProcessed || 0,
          chunksTotal: repo.chunksTotal || 0,
          chunksEmbedded: repo.chunksEmbedded || 0,
          fileCount: repo.fileCount || 0,
          chunkCount: repo.chunkCount || 0,
        });
      }

      // GET /api/repos/:id/tree
      if (seg[2] === "tree") {
        const files = await db
          .collection("files")
          .find({ repoId }, { projection: { _id: 0, path: 1, language: 1, size: 1 } })
          .sort({ path: 1 })
          .toArray();
        return json({ files });
      }

      // GET /api/repos/:id/file?path=...
      if (seg[2] === "file") {
        const p = url.searchParams.get("path");
        if (!p) return json({ error: "Missing path" }, 400);
        const file = await db.collection("files").findOne({ repoId, path: p }, { projection: { _id: 0 } });
        if (!file) return json({ error: "File not found" }, 404);
        return json({ file });
      }

      // GET /api/repos/:id/sessions
      if (seg[2] === "sessions") {
        const sessions = await db
          .collection("chat_sessions")
          .find({ repoId }, { projection: { _id: 0 } })
          .sort({ createdAt: -1 })
          .toArray();
        return json({ sessions });
      }

      // GET /api/repos/:id/chat/:sessionId  (history)
      if (seg[2] === "chat" && seg[3]) {
        const messages = await db
          .collection("chat_messages")
          .find({ sessionId: seg[3] }, { projection: { _id: 0 } })
          .sort({ createdAt: 1 })
          .toArray();
        return json({ messages });
      }

      // GET /api/repos/:id
      if (seg.length === 2) {
        return json({ repo });
      }
    }

    return json({ error: "Not found" }, 404);
  } catch (err) {
    console.error("GET error", err);
    return json({ error: err.message || "Server error" }, 500);
  }
}

// ---------------- POST ----------------
export async function POST(request) {
  const seg = getSegments(request);
  const db = await getDb();

  try {
    // POST /api/auth/login  { username }
    if (seg[0] === "auth" && seg[1] === "login") {
      const body = await readBody(request);
      const username = (body.username || "").trim();
      if (!username) return json({ error: "Username is required" }, 400);
      let user = await db.collection("users").findOne({ username: username.toLowerCase() }, { projection: { _id: 0 } });
      if (!user) {
        user = {
          id: crypto.randomUUID(),
          username: username.toLowerCase(),
          displayName: username,
          createdAt: new Date().toISOString(),
        };
        await db.collection("users").insertOne({ ...user });
      }
      return json({ user });
    }

    // POST /api/repos  { github_url, userId }
    if (seg[0] === "repos" && seg.length === 1) {
      const body = await readBody(request);
      const parsed = parseGithubUrl(body.github_url);
      if (!parsed) return json({ error: "Please enter a valid public GitHub repository URL." }, 400);

      const repo = {
        id: crypto.randomUUID(),
        userId: body.userId || null,
        name: parsed.name,
        owner: parsed.owner,
        repo: parsed.repo,
        githubUrl: parsed.webUrl,
        cloneUrl: parsed.cloneUrl,
        status: "cloning",
        error: null,
        totalFiles: 0,
        filesProcessed: 0,
        chunksTotal: 0,
        chunksEmbedded: 0,
        fileCount: 0,
        chunkCount: 0,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      await db.collection("repositories").insertOne({ ...repo });

      // fire-and-forget background ingestion
      startIngestion(repo.id, parsed.cloneUrl).catch((e) => console.error("ingest crash", e));

      return json({ repo });
    }

    if (seg[0] === "repos" && seg.length >= 2) {
      const repoId = seg[1];
      const repo = await db.collection("repositories").findOne({ id: repoId });
      if (!repo) return json({ error: "Repository not found" }, 404);

      // POST /api/repos/:id/reindex
      if (seg[2] === "reindex") {
        startIngestion(repo.id, repo.cloneUrl).catch((e) => console.error("ingest crash", e));
        return json({ ok: true });
      }

      // POST /api/repos/:id/chat  { message, sessionId? }  -> SSE stream
      if (seg[2] === "chat") {
        if (repo.status !== "ready") {
          return json({ error: "Repository is not ready yet." }, 400);
        }
        const body = await readBody(request);
        const message = (body.message || "").trim();
        if (!message) return json({ error: "Message is required" }, 400);

        // resolve or create session
        let sessionId = body.sessionId;
        if (!sessionId) {
          sessionId = crypto.randomUUID();
          await db.collection("chat_sessions").insertOne({
            id: sessionId,
            repoId,
            userId: repo.userId || null,
            title: message.slice(0, 60),
            createdAt: new Date().toISOString(),
          });
        }

        // save user message
        await db.collection("chat_messages").insertOne({
          id: crypto.randomUUID(),
          sessionId,
          repoId,
          role: "user",
          content: message,
          citedChunks: [],
          createdAt: new Date().toISOString(),
        });

        // prior history (for multi-turn context)
        const history = await db
          .collection("chat_messages")
          .find({ sessionId }, { projection: { _id: 0, role: 1, content: 1 } })
          .sort({ createdAt: 1 })
          .toArray();
        const priorTurns = history.slice(0, -1).slice(-6);

        // retrieval
        const hits = await retrieve(repoId, message, 6);
        const sources = hits.map((h, i) => ({
          id: i + 1,
          path: h.path,
          startLine: h.startLine,
          endLine: h.endLine,
          symbolName: h.symbolName,
          language: h.language,
          score: h.score,
        }));

        const contextBlock = hits
          .map(
            (h, i) =>
              `[${i + 1}] ${h.path}:${h.startLine}-${h.endLine}${h.symbolName ? ` (${h.symbolName})` : ""}\n\`\`\`${h.language || ""}\n${h.text}\n\`\`\``
          )
          .join("\n\n");

        const convo = priorTurns.length
          ? "CONVERSATION SO FAR:\n" +
            priorTurns.map((m) => `${m.role === "user" ? "User" : "Assistant"}: ${m.content}`).join("\n") +
            "\n\n"
          : "";

        const systemMessage =
          `You are RepoChat, an expert software engineer helping a developer understand the GitHub repository "${repo.name}". ` +
          `Answer questions using ONLY the numbered CODE CONTEXT sources provided. ` +
          `Cite every claim inline using bracketed numbers like [1] or [2], matching the source numbers. ` +
          `Prefer citing specific sources over vague statements. ` +
          `Wrap file paths and symbol names in backticks. Use concise markdown. ` +
          `If the provided context is insufficient to answer, say so honestly instead of guessing.`;

        const userText = `CODE CONTEXT (numbered sources):\n${contextBlock}\n\n${convo}QUESTION: ${message}`;

        const chat = new LlmChat(process.env.EMERGENT_LLM_KEY, `repo-${repoId}-${sessionId}`, systemMessage)
          .withModel("openai", "gpt-4o-mini")
          .withParams({ temperature: 0.2 });

        const encoder = new TextEncoder();
        const sse = (obj) => encoder.encode(`data: ${JSON.stringify(obj)}\n\n`);

        const stream = new ReadableStream({
          async start(controller) {
            let full = "";
            try {
              controller.enqueue(sse({ type: "session", sessionId }));
              for await (const event of chat.streamMessage(new UserMessage({ text: userText }))) {
                if (event.type === "text_delta" && event.content) {
                  full += event.content;
                  controller.enqueue(sse({ type: "text", content: event.content }));
                }
              }
              controller.enqueue(sse({ type: "citations", citations: sources }));
              controller.enqueue(sse({ type: "done" }));

              await db.collection("chat_messages").insertOne({
                id: crypto.randomUUID(),
                sessionId,
                repoId,
                role: "assistant",
                content: full,
                citedChunks: sources,
                createdAt: new Date().toISOString(),
              });
            } catch (err) {
              console.error("chat stream error", err);
              controller.enqueue(sse({ type: "error", error: err.message || "Chat failed" }));
            } finally {
              controller.close();
            }
          },
        });

        return new Response(stream, {
          headers: {
            "Content-Type": "text/event-stream; charset=utf-8",
            "Cache-Control": "no-cache, no-transform",
            Connection: "keep-alive",
            "X-Accel-Buffering": "no",
          },
        });
      }
    }

    return json({ error: "Not found" }, 404);
  } catch (err) {
    console.error("POST error", err);
    return json({ error: err.message || "Server error" }, 500);
  }
}

// ---------------- DELETE ----------------
export async function DELETE(request) {
  const seg = getSegments(request);
  const db = await getDb();
  try {
    if (seg[0] === "repos" && seg[1]) {
      const repoId = seg[1];
      await db.collection("repositories").deleteOne({ id: repoId });
      await db.collection("files").deleteMany({ repoId });
      await db.collection("chunks").deleteMany({ repoId });
      await db.collection("chat_sessions").deleteMany({ repoId });
      await db.collection("chat_messages").deleteMany({ repoId });
      return json({ ok: true });
    }
    return json({ error: "Not found" }, 404);
  } catch (err) {
    return json({ error: err.message || "Server error" }, 500);
  }
}
