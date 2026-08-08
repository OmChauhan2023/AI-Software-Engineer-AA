"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import dynamic from "next/dynamic";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  Plus, Loader2, CheckCircle2, XCircle, GitBranch, MessageSquare,
  Send, ArrowLeft, FileCode2, Folder, FolderOpen, PanelRightClose, PanelRightOpen,
  Trash2, Sparkles, LogOut, ChevronRight, Terminal, Braces, Search,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { ScrollArea } from "@/components/ui/scroll-area";

const MonacoEditor = dynamic(() => import("@monaco-editor/react"), { ssr: false });

// lucide-react removed brand icons; alias GitHub visual to GitBranch
const Github = GitBranch;

/* ----------------------------- helpers ----------------------------- */
const STARTERS = [
  "Explain this repository at a high level",
  "Where does the app entry point / main logic live?",
  "How is the project structured?",
  "What are the key modules and what do they do?",
];

const DEMO_REPOS = [
  { label: "slugify", lang: "JavaScript", url: "https://github.com/sindresorhus/slugify" },
  { label: "requests", lang: "Python", url: "https://github.com/psf/requests" },
  { label: "gorilla/mux", lang: "Go", url: "https://github.com/gorilla/mux" },
];

const STEPS = [
  { key: "cloning", label: "Cloning" },
  { key: "parsing", label: "Parsing" },
  { key: "embedding", label: "Embedding" },
  { key: "ready", label: "Ready" },
];

function stepIndex(status) {
  const i = STEPS.findIndex((s) => s.key === status);
  return i === -1 ? 0 : i;
}

function timeAgo(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  const s = Math.floor((Date.now() - d.getTime()) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

function langFromPath(p) {
  const ext = (p || "").split(".").pop().toLowerCase();
  const map = {
    js: "javascript", jsx: "javascript", mjs: "javascript", cjs: "javascript",
    ts: "typescript", tsx: "typescript", py: "python", go: "go", java: "java",
    rb: "ruby", rs: "rust", c: "c", h: "c", cpp: "cpp", cs: "csharp", php: "php",
    swift: "swift", kt: "kotlin", md: "markdown", json: "json", yaml: "yaml",
    yml: "yaml", html: "html", css: "css", scss: "scss", sh: "shell", sql: "sql",
    vue: "html", svelte: "html", toml: "ini",
  };
  return map[ext] || "plaintext";
}

/* --------------------------- Status badge --------------------------- */
function StatusBadge({ status }) {
  if (status === "ready")
    return (
      <Badge className="gap-1 bg-primary/15 text-primary border-primary/30 hover:bg-primary/15">
        <CheckCircle2 className="h-3 w-3" /> Ready
      </Badge>
    );
  if (status === "failed")
    return (
      <Badge variant="outline" className="gap-1 border-destructive/40 text-destructive">
        <XCircle className="h-3 w-3" /> Failed
      </Badge>
    );
  return (
    <Badge variant="outline" className="gap-1 border-amber-500/40 text-amber-400">
      <Loader2 className="h-3 w-3 animate-spin" /> Processing
    </Badge>
  );
}

/* ----------------------------- Logo ----------------------------- */
function Logo({ className }) {
  return (
    <div className={cn("flex items-center gap-2", className)}>
      <div className="grid h-8 w-8 place-items-center rounded-md bg-primary/15 ring-1 ring-primary/30">
        <Braces className="h-4 w-4 text-primary" />
      </div>
      <span className="font-mono text-sm font-semibold tracking-tight">
        repo<span className="text-primary">chat</span>
      </span>
    </div>
  );
}

/* ----------------------------- Login ----------------------------- */
function LoginScreen({ onLogin }) {
  const [username, setUsername] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    if (!username.trim()) return;
    setLoading(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Login failed");
      onLogin(data.user);
    } catch (e) {
      toast.error(e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative min-h-screen bg-grid">
      <div className="absolute inset-0 bg-gradient-to-b from-background/40 via-background/70 to-background" />
      <div className="relative flex min-h-screen items-center justify-center px-4">
        <Card className="w-full max-w-sm border-border/60 bg-card/80 p-8 shadow-2xl backdrop-blur">
          <div className="mb-8 flex flex-col items-center text-center">
            <div className="mb-4 grid h-12 w-12 place-items-center rounded-xl bg-primary/15 ring-1 ring-primary/30">
              <Braces className="h-6 w-6 text-primary" />
            </div>
            <h1 className="font-mono text-lg font-semibold">repochat</h1>
            <p className="mt-1.5 text-sm text-muted-foreground">
              Chat with any GitHub repository. Grounded answers with real file citations.
            </p>
          </div>

          <div className="space-y-3">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">GitHub handle</label>
              <div className="relative">
                <Github className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && submit()}
                  placeholder="your-username"
                  className="pl-9 font-mono"
                />
              </div>
            </div>
            <Button onClick={submit} disabled={loading} className="w-full gap-2">
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Github className="h-4 w-4" />}
              Continue with GitHub
            </Button>
          </div>
          <p className="mt-4 text-center text-[11px] text-muted-foreground/70">
            No password needed for this demo — just pick a handle.
          </p>
        </Card>
      </div>
    </div>
  );
}

/* ------------------------- Import progress ------------------------- */
function ImportProgress({ repo }) {
  const idx = repo.status === "failed" ? -1 : stepIndex(repo.status);
  return (
    <div className="space-y-5 py-2">
      {repo.status === "failed" ? (
        <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-4">
          <div className="flex items-center gap-2 text-destructive">
            <XCircle className="h-4 w-4" />
            <span className="text-sm font-medium">Import failed</span>
          </div>
          <p className="mt-1.5 text-sm text-muted-foreground">{repo.error || "Something went wrong."}</p>
        </div>
      ) : (
        <div className="flex items-center justify-between gap-2">
          {STEPS.map((s, i) => {
            const done = i < idx || repo.status === "ready";
            const active = i === idx && repo.status !== "ready";
            return (
              <div key={s.key} className="flex flex-1 flex-col items-center gap-2">
                <div
                  className={cn(
                    "grid h-8 w-8 place-items-center rounded-full border text-xs transition-colors",
                    done && "border-primary bg-primary/15 text-primary",
                    active && "border-amber-500 bg-amber-500/10 text-amber-400",
                    !done && !active && "border-border text-muted-foreground"
                  )}
                >
                  {done ? <CheckCircle2 className="h-4 w-4" /> : active ? <Loader2 className="h-4 w-4 animate-spin" /> : i + 1}
                </div>
                <span className={cn("text-[11px]", (done || active) ? "text-foreground" : "text-muted-foreground")}>
                  {s.label}
                </span>
              </div>
            );
          })}
        </div>
      )}

      {repo.status === "parsing" && (
        <p className="text-center font-mono text-xs text-muted-foreground">
          {repo.filesProcessed || 0} / {repo.totalFiles || "…"} files parsed
        </p>
      )}
      {repo.status === "embedding" && (
        <p className="text-center font-mono text-xs text-muted-foreground">
          {repo.chunksEmbedded || 0} / {repo.chunksTotal || "…"} chunks embedded
        </p>
      )}
      {repo.status === "cloning" && (
        <p className="text-center font-mono text-xs text-muted-foreground">Fetching repository…</p>
      )}
      {repo.status === "ready" && (
        <p className="text-center text-xs text-primary">
          Analyzed {repo.fileCount} files · {repo.chunkCount} chunks indexed
        </p>
      )}
    </div>
  );
}

/* ---------------------------- Repo list ---------------------------- */
function ReposScreen({ user, onOpenRepo, onLogout }) {
  const [repos, setRepos] = useState(null);
  const [importOpen, setImportOpen] = useState(false);
  const [url, setUrl] = useState("");
  const [q, setQ] = useState("");
  const [importing, setImporting] = useState(null);
  const pollRef = useRef(null);

  const load = useCallback(async () => {
    const res = await fetch(`/api/repos?userId=${user.id}`);
    const data = await res.json();
    setRepos(data.repos || []);
  }, [user.id]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    const anyProcessing = (repos || []).some((r) => !["ready", "failed"].includes(r.status));
    if (!anyProcessing) return;
    const t = setInterval(load, 2500);
    return () => clearInterval(t);
  }, [repos, load]);

  const startImport = async (overrideUrl) => {
    const target = ((overrideUrl ?? url) || "").trim();
    if (!target) return;
    setImportOpen(true);
    try {
      const res = await fetch("/api/repos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ github_url: target, userId: user.id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Import failed");
      setImporting(data.repo);
      setUrl("");
      pollImport(data.repo.id);
    } catch (e) {
      toast.error(e.message);
    }
  };

  const pollImport = (id) => {
    clearInterval(pollRef.current);
    pollRef.current = setInterval(async () => {
      const res = await fetch(`/api/repos/${id}/status`);
      const s = await res.json();
      setImporting((prev) => ({ ...prev, ...s }));
      if (s.status === "ready" || s.status === "failed") {
        clearInterval(pollRef.current);
        load();
      }
    }, 1400);
  };

  useEffect(() => () => clearInterval(pollRef.current), []);

  const deleteRepo = async (id) => {
    await fetch(`/api/repos/${id}`, { method: "DELETE" });
    toast.success("Repository deleted");
    load();
  };

  const closeImport = () => {
    setImportOpen(false);
    setImporting(null);
    clearInterval(pollRef.current);
  };

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-20 border-b border-border/60 bg-background/80 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-5">
          <Logo />
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm" className="gap-2">
                <Avatar className="h-6 w-6">
                  <AvatarFallback className="bg-primary/15 text-[10px] text-primary">
                    {user.displayName?.slice(0, 2).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <span className="font-mono text-xs">{user.displayName}</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={onLogout} className="gap-2 text-sm">
                <LogOut className="h-4 w-4" /> Sign out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-5 py-10">
        <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Repositories</h1>
            <p className="mt-1 text-sm text-muted-foreground">Import a repo and chat with its codebase.</p>
          </div>
          <div className="flex items-center gap-2">
            {repos && repos.length > 0 && (
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder="Filter repos…"
                  className="h-9 w-full pl-8 font-mono text-xs sm:w-56"
                />
              </div>
            )}
            <Button onClick={() => setImportOpen(true)} className="gap-2">
              <Plus className="h-4 w-4" /> Import Repository
            </Button>
          </div>
        </div>

        {repos && repos.length > 0 && (
          <div className="mb-6 flex flex-wrap items-center gap-2">
            <span className="text-[11px] uppercase tracking-wide text-muted-foreground/70">Quick demo:</span>
            {DEMO_REPOS.map((d) => (
              <button
                key={d.url}
                onClick={() => startImport(d.url)}
                className="inline-flex items-center gap-1.5 rounded-full border border-border/60 bg-card/50 px-2.5 py-1 font-mono text-[11px] transition-colors hover:border-primary/40 hover:text-primary"
              >
                <Sparkles className="h-3 w-3 text-primary" /> {d.label}
                <span className="text-muted-foreground/60">· {d.lang}</span>
              </button>
            ))}
          </div>
        )}

        {repos === null ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {[...Array(3)].map((_, i) => (
              <Card key={i} className="h-32 animate-pulse bg-card/50" />
            ))}
          </div>
        ) : repos.length === 0 ? (
          <Card className="flex flex-col items-center justify-center gap-4 border-dashed border-border/60 bg-card/40 py-20 text-center">
            <div className="grid h-14 w-14 place-items-center rounded-2xl bg-primary/10 ring-1 ring-primary/20">
              <GitBranch className="h-7 w-7 text-primary" />
            </div>
            <div>
              <h3 className="text-base font-medium">No repositories yet</h3>
              <p className="mt-1 max-w-sm text-sm text-muted-foreground">
                Paste a public GitHub URL to analyze a codebase and start asking questions about it.
              </p>
            </div>
            <Button onClick={() => setImportOpen(true)} className="gap-2">
              <Plus className="h-4 w-4" /> Import your first repository
            </Button>
            <div className="flex flex-wrap items-center justify-center gap-2 pt-2">
              <span className="text-[11px] uppercase tracking-wide text-muted-foreground/70">Or try:</span>
              {DEMO_REPOS.map((d) => (
                <button
                  key={d.url}
                  onClick={() => startImport(d.url)}
                  className="inline-flex items-center gap-1.5 rounded-full border border-border/60 bg-background/60 px-2.5 py-1 font-mono text-[11px] transition-colors hover:border-primary/40 hover:text-primary"
                >
                  <Sparkles className="h-3 w-3 text-primary" /> {d.label}
                  <span className="text-muted-foreground/60">· {d.lang}</span>
                </button>
              ))}
            </div>
          </Card>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {repos
              .filter((r) => r.name.toLowerCase().includes(q.toLowerCase()))
              .map((r) => (
              <Card
                key={r.id}
                className="group relative flex flex-col gap-3 border-border/60 bg-card/60 p-5 transition-colors hover:border-primary/40"
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-2">
                    <div className="grid h-9 w-9 place-items-center rounded-md bg-muted">
                      <Github className="h-4 w-4 text-muted-foreground" />
                    </div>
                    <div className="min-w-0">
                      <div className="truncate font-mono text-sm font-medium">{r.repo}</div>
                      <div className="truncate text-xs text-muted-foreground">{r.owner}</div>
                    </div>
                  </div>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-7 w-7 opacity-0 group-hover:opacity-100">
                        <ChevronRight className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => deleteRepo(r.id)} className="gap-2 text-destructive">
                        <Trash2 className="h-4 w-4" /> Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>

                <div className="flex items-center justify-between">
                  <StatusBadge status={r.status} />
                  <span className="text-[11px] text-muted-foreground">{timeAgo(r.createdAt)}</span>
                </div>

                {r.status === "failed" && <p className="line-clamp-2 text-xs text-destructive/80">{r.error}</p>}

                <Button
                  variant={r.status === "ready" ? "default" : "secondary"}
                  size="sm"
                  disabled={r.status !== "ready"}
                  onClick={() => onOpenRepo(r)}
                  className="mt-1 w-full gap-2"
                >
                  <MessageSquare className="h-4 w-4" />
                  {r.status === "ready" ? "Open chat" : "Processing…"}
                </Button>
              </Card>
            ))}
          </div>
        )}
      </main>

      <Dialog open={importOpen} onOpenChange={(o) => (o ? setImportOpen(true) : closeImport())}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Github className="h-4 w-4" /> Import repository
            </DialogTitle>
            <DialogDescription>
              {importing ? "Analyzing the codebase — this runs in the background." : "Paste a public GitHub repository URL."}
            </DialogDescription>
          </DialogHeader>

          {!importing ? (
            <div className="space-y-3">
              <Input
                autoFocus
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && startImport()}
                placeholder="https://github.com/owner/repo"
                className="font-mono text-sm"
              />
              <Button onClick={() => startImport()} className="w-full gap-2">
                <Sparkles className="h-4 w-4" /> Analyze repository
              </Button>
              <div className="flex flex-wrap items-center gap-2 pt-1">
                <span className="text-[11px] uppercase tracking-wide text-muted-foreground/70">Try:</span>
                {DEMO_REPOS.map((d) => (
                  <button
                    key={d.url}
                    onClick={() => startImport(d.url)}
                    className="inline-flex items-center gap-1 rounded-full border border-border/60 bg-muted/40 px-2 py-0.5 font-mono text-[11px] transition-colors hover:border-primary/40 hover:text-primary"
                  >
                    {d.label}
                  </button>
                ))}
              </div>
              <p className="text-[11px] text-muted-foreground">V1 supports public repos up to 400 source files.</p>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="rounded-md border border-border/60 bg-muted/40 px-3 py-2 font-mono text-xs">{importing.name}</div>
              <ImportProgress repo={importing} />
              {importing.status === "ready" && (
                <Button
                  className="w-full gap-2"
                  onClick={() => {
                    const r = importing;
                    closeImport();
                    onOpenRepo(r);
                  }}
                >
                  <MessageSquare className="h-4 w-4" /> Open chat
                </Button>
              )}
              {importing.status === "failed" && (
                <Button variant="secondary" className="w-full" onClick={closeImport}>
                  Close
                </Button>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

/* ----------------------------- File tree ----------------------------- */
function buildTree(paths) {
  const root = {};
  for (const p of paths) {
    const parts = p.split("/");
    let node = root;
    parts.forEach((part, i) => {
      const isFile = i === parts.length - 1;
      node[part] = node[part] || { __file: isFile, __path: isFile ? p : null, children: {} };
      node = node[part].children;
    });
  }
  return root;
}

function TreeNode({ name, node, depth, onOpen, activePath }) {
  const [open, setOpen] = useState(depth < 1);
  const isFile = node.__file;
  if (isFile) {
    return (
      <button
        onClick={() => onOpen(node.__path)}
        className={cn(
          "flex w-full items-center gap-1.5 rounded px-1.5 py-1 text-left font-mono text-xs hover:bg-muted/60",
          activePath === node.__path && "bg-primary/15 text-primary"
        )}
        style={{ paddingLeft: depth * 12 + 6 }}
      >
        <FileCode2 className="h-3.5 w-3.5 shrink-0 opacity-70" />
        <span className="truncate">{name}</span>
      </button>
    );
  }
  const kids = Object.entries(node.children).sort((a, b) => {
    const af = a[1].__file, bf = b[1].__file;
    if (af !== bf) return af ? 1 : -1;
    return a[0].localeCompare(b[0]);
  });
  return (
    <div>
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-1.5 rounded px-1.5 py-1 text-left font-mono text-xs text-muted-foreground hover:bg-muted/60"
        style={{ paddingLeft: depth * 12 + 6 }}
      >
        {open ? <FolderOpen className="h-3.5 w-3.5 text-primary/70" /> : <Folder className="h-3.5 w-3.5" />}
        <span className="truncate">{name}</span>
      </button>
      {open && kids.map(([n, c]) => (
        <TreeNode key={n} name={n} node={c} depth={depth + 1} onOpen={onOpen} activePath={activePath} />
      ))}
    </div>
  );
}

/* ----------------------------- Code pane ----------------------------- */
function CodePane({ repoId, activeFile, onOpenFile }) {
  const [tree, setTree] = useState(null);
  const [content, setContent] = useState("");
  const [loadingFile, setLoadingFile] = useState(false);
  const editorRef = useRef(null);
  const monacoRef = useRef(null);
  const decoRef = useRef([]);

  useEffect(() => {
    fetch(`/api/repos/${repoId}/tree`)
      .then((r) => r.json())
      .then((d) => setTree((d.files || []).map((f) => f.path)));
  }, [repoId]);

  const highlight = useCallback((start, end) => {
    const editor = editorRef.current;
    const monaco = monacoRef.current;
    if (!editor || !monaco || !start) return;
    editor.revealLinesInCenter(start, end || start);
    decoRef.current = editor.deltaDecorations(decoRef.current, [
      {
        range: new monaco.Range(start, 1, end || start, 1),
        options: {
          isWholeLine: true,
          className: "bg-primary/15",
          linesDecorationsClassName: "border-l-2 border-primary",
        },
      },
    ]);
  }, []);

  useEffect(() => {
    if (!activeFile?.path) return;
    setLoadingFile(true);
    fetch(`/api/repos/${repoId}/file?path=${encodeURIComponent(activeFile.path)}`)
      .then((r) => r.json())
      .then((d) => {
        setContent(d.file?.content || "// file not found");
        setTimeout(() => highlight(activeFile.startLine, activeFile.endLine), 150);
      })
      .finally(() => setLoadingFile(false));
  }, [activeFile, repoId, highlight]);

  return (
    <div className="flex h-full flex-col">
      <div className="flex h-10 shrink-0 items-center gap-2 border-b border-border/60 px-3">
        <FileCode2 className="h-3.5 w-3.5 text-muted-foreground" />
        <span className="truncate font-mono text-xs text-muted-foreground">
          {activeFile?.path || "No file open"}
          {activeFile?.startLine ? (
            <span className="text-primary">:{activeFile.startLine}-{activeFile.endLine}</span>
          ) : null}
        </span>
      </div>

      {!activeFile?.path ? (
        <ScrollArea className="flex-1">
          <div className="p-2">
            <div className="mb-2 flex items-center gap-1.5 px-1.5 text-[11px] uppercase tracking-wide text-muted-foreground/70">
              <Terminal className="h-3 w-3" /> File tree
            </div>
            {tree === null ? (
              <div className="space-y-1 p-2">
                {[...Array(8)].map((_, i) => (
                  <div key={i} className="h-4 w-full animate-pulse rounded bg-muted/50" />
                ))}
              </div>
            ) : (
              Object.entries(buildTree(tree))
                .sort((a, b) => (a[1].__file === b[1].__file ? a[0].localeCompare(b[0]) : a[1].__file ? 1 : -1))
                .map(([n, c]) => (
                  <TreeNode key={n} name={n} node={c} depth={0} onOpen={(p) => onOpenFile({ path: p })} activePath={null} />
                ))
            )}
          </div>
        </ScrollArea>
      ) : (
        <div className="relative flex-1">
          {loadingFile && (
            <div className="absolute inset-0 z-10 grid place-items-center bg-background/60">
              <Loader2 className="h-5 w-5 animate-spin text-primary" />
            </div>
          )}
          <MonacoEditor
            height="100%"
            theme="vs-dark"
            language={langFromPath(activeFile.path)}
            value={content}
            onMount={(editor, monaco) => {
              editorRef.current = editor;
              monacoRef.current = monaco;
              if (activeFile.startLine) highlight(activeFile.startLine, activeFile.endLine);
            }}
            options={{
              readOnly: true,
              minimap: { enabled: false },
              fontSize: 12,
              fontFamily: "var(--font-mono), monospace",
              lineNumbers: "on",
              scrollBeyondLastLine: false,
              renderLineHighlight: "none",
              padding: { top: 12 },
            }}
          />
        </div>
      )}
    </div>
  );
}

/* --------------------------- Chat message --------------------------- */
function CitationChips({ citations, onOpen }) {
  if (!citations?.length) return null;
  return (
    <div className="mt-3 flex flex-wrap gap-1.5 border-t border-border/50 pt-3">
      {citations.map((c) => (
        <button
          key={c.id}
          onClick={() => onOpen({ path: c.path, startLine: c.startLine, endLine: c.endLine })}
          className="group inline-flex items-center gap-1 rounded-full border border-primary/30 bg-primary/10 px-2 py-0.5 font-mono text-[11px] text-primary transition-colors hover:bg-primary/20"
          title={c.symbolName || c.path}
        >
          <span className="text-primary/60">[{c.id}]</span>
          <span className="max-w-[220px] truncate">{c.path}</span>
          <span className="text-primary/70">:{c.startLine}-{c.endLine}</span>
        </button>
      ))}
    </div>
  );
}

function Message({ msg, onOpenCitation }) {
  if (msg.role === "user") {
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%] rounded-2xl rounded-br-sm bg-primary px-4 py-2.5 text-sm text-primary-foreground">
          {msg.content}
        </div>
      </div>
    );
  }

  const citations = msg.citations || [];
  const linkify = (text) =>
    (text || "").replace(/\[(\d+)\]/g, (m, n) =>
      citations.some((c) => c.id === Number(n)) ? `[[${n}]](cite:${n})` : m
    );
  const mdComponents = {
    a: ({ href, children }) => {
      if (href && href.startsWith("cite:")) {
        const id = Number(href.slice(5));
        const c = citations.find((x) => x.id === id);
        return (
          <button
            type="button"
            onClick={() => c && onOpenCitation({ path: c.path, startLine: c.startLine, endLine: c.endLine })}
            className="mx-0.5 inline-flex items-center rounded bg-primary/20 px-1 align-baseline font-mono text-[11px] font-medium text-primary hover:bg-primary/35"
            title={c ? `${c.path}:${c.startLine}-${c.endLine}` : ""}
          >
            {children}
          </button>
        );
      }
      return (
        <a href={href} target="_blank" rel="noreferrer" className="text-primary underline">
          {children}
        </a>
      );
    },
  };

  return (
    <div className="flex gap-3">
      <div className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-md bg-primary/15 ring-1 ring-primary/25">
        <Sparkles className="h-3.5 w-3.5 text-primary" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="prose prose-invert prose-sm max-w-none prose-pre:bg-muted/70 prose-pre:border prose-pre:border-border/50 prose-code:font-mono prose-code:text-primary prose-p:leading-relaxed">
          {msg.content ? (
            <span className={cn(msg.streaming && "streaming-caret")}>
              <ReactMarkdown remarkPlugins={[remarkGfm]} components={mdComponents}>
                {linkify(msg.content)}
              </ReactMarkdown>
            </span>
          ) : (
            <span className="inline-flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> Searching the codebase…
            </span>
          )}
        </div>
        {!msg.streaming && <CitationChips citations={msg.citations} onOpen={onOpenCitation} />}
      </div>
    </div>
  );
}

/* ----------------------------- Workspace ----------------------------- */
function Workspace({ user, repo, onBack }) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [sessionId, setSessionId] = useState(null);
  const [activeFile, setActiveFile] = useState(null);
  const [showCode, setShowCode] = useState(true);
  const scrollRef = useRef(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  const patchLastAssistant = (fn) => {
    setMessages((prev) => {
      const copy = [...prev];
      for (let i = copy.length - 1; i >= 0; i--) {
        if (copy[i].role === "assistant") {
          copy[i] = fn({ ...copy[i] });
          break;
        }
      }
      return copy;
    });
  };

  const send = async (text) => {
    const q = (text ?? input).trim();
    if (!q || streaming) return;
    setInput("");
    setMessages((m) => [...m, { role: "user", content: q }, { role: "assistant", content: "", citations: [], streaming: true }]);
    setStreaming(true);
    try {
      const res = await fetch(`/api/repos/${repo.id}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: q, sessionId }),
      });
      if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        throw new Error(e.error || "Request failed");
      }
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = "";
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        const events = buf.split("\n\n");
        buf = events.pop();
        for (const ev of events) {
          const line = ev.split("\n").find((l) => l.startsWith("data: "));
          if (!line) continue;
          let data;
          try { data = JSON.parse(line.slice(6)); } catch { continue; }
          if (data.type === "session") setSessionId(data.sessionId);
          else if (data.type === "text") patchLastAssistant((m) => ({ ...m, content: m.content + data.content }));
          else if (data.type === "citations") patchLastAssistant((m) => ({ ...m, citations: data.citations }));
          else if (data.type === "error") { toast.error(data.error); patchLastAssistant((m) => ({ ...m, content: m.content || "⚠️ " + data.error })); }
        }
      }
    } catch (err) {
      toast.error(err.message);
      patchLastAssistant((m) => ({ ...m, content: m.content || "⚠️ " + err.message }));
    } finally {
      setStreaming(false);
      patchLastAssistant((m) => ({ ...m, streaming: false }));
    }
  };

  const openCitation = (c) => {
    setShowCode(true);
    setActiveFile({ path: c.path, startLine: c.startLine, endLine: c.endLine, ts: Date.now() });
  };

  return (
    <div className="flex h-screen flex-col">
      <header className="flex h-14 shrink-0 items-center justify-between border-b border-border/60 bg-background/80 px-4 backdrop-blur">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onBack}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className="flex items-center gap-2">
            <Github className="h-4 w-4 text-muted-foreground" />
            <a href={repo.githubUrl} target="_blank" rel="noreferrer" className="font-mono text-sm hover:text-primary">
              {repo.name}
            </a>
          </div>
          <StatusBadge status={repo.status} />
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" className="gap-2" onClick={() => { setMessages([]); setSessionId(null); }}>
            <MessageSquare className="h-4 w-4" /> New chat
          </Button>
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setShowCode((s) => !s)}>
            {showCode ? <PanelRightClose className="h-4 w-4" /> : <PanelRightOpen className="h-4 w-4" />}
          </Button>
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        <div className={cn("flex min-w-0 flex-col", showCode ? "w-full lg:w-1/2 lg:border-r lg:border-border/60" : "w-full")}>
          <div ref={scrollRef} className="scrollbar-thin flex-1 overflow-y-auto px-4 py-6 lg:px-6">
            <div className="mx-auto max-w-2xl space-y-6">
              {messages.length === 0 ? (
                <div className="pt-8">
                  <div className="mb-6 flex flex-col items-center text-center">
                    <div className="mb-3 grid h-12 w-12 place-items-center rounded-xl bg-primary/15 ring-1 ring-primary/25">
                      <Sparkles className="h-6 w-6 text-primary" />
                    </div>
                    <h2 className="text-lg font-medium">Ask about {repo.repo}</h2>
                    <p className="mt-1 text-sm text-muted-foreground">
                      Answers are grounded in the real code with clickable citations.
                    </p>
                  </div>
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    {STARTERS.map((s) => (
                      <button
                        key={s}
                        onClick={() => send(s)}
                        className="rounded-lg border border-border/60 bg-card/50 px-4 py-3 text-left text-sm transition-colors hover:border-primary/40 hover:bg-card"
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                messages.map((m, i) => <Message key={i} msg={m} onOpenCitation={openCitation} />)
              )}
            </div>
          </div>

          <div className="shrink-0 border-t border-border/60 bg-background/80 p-3 backdrop-blur lg:p-4">
            <div className="mx-auto flex max-w-2xl items-end gap-2">
              <Textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    send();
                  }
                }}
                placeholder={`Ask about ${repo.repo}…`}
                rows={1}
                className="max-h-40 min-h-[44px] resize-none bg-card/60"
              />
              <Button onClick={() => send()} disabled={streaming || !input.trim()} size="icon" className="h-11 w-11 shrink-0">
                {streaming ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              </Button>
            </div>
          </div>
        </div>

        {showCode && (
          <div className="hidden min-w-0 flex-1 bg-card/30 lg:block">
            <CodePane repoId={repo.id} activeFile={activeFile} onOpenFile={openCitation} />
          </div>
        )}
      </div>
    </div>
  );
}

/* ------------------------------- App ------------------------------- */
export default function App() {
  const [user, setUser] = useState(null);
  const [ready, setReady] = useState(false);
  const [activeRepo, setActiveRepo] = useState(null);

  useEffect(() => {
    try {
      const u = localStorage.getItem("repochat_user");
      if (u) setUser(JSON.parse(u));
    } catch {}
    setReady(true);
  }, []);

  const login = (u) => {
    localStorage.setItem("repochat_user", JSON.stringify(u));
    setUser(u);
  };
  const logout = () => {
    localStorage.removeItem("repochat_user");
    setUser(null);
    setActiveRepo(null);
  };

  if (!ready) return <div className="min-h-screen bg-background" />;
  if (!user) return <LoginScreen onLogin={login} />;
  if (activeRepo) return <Workspace user={user} repo={activeRepo} onBack={() => setActiveRepo(null)} />;
  return <ReposScreen user={user} onOpenRepo={setActiveRepo} onLogout={logout} />;
}
