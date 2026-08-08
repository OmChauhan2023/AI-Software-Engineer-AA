"use client";

import React, { useState } from "react";
import { useRepository, useChat } from "@/lib/hooks";
import { api } from "@/lib/api";
import { WorkspaceLayout } from "@/components/workspace-layout";
import { ChatPanel } from "@/components/chat-panel";
import { MonacoCodeViewer } from "@/components/monaco-code-viewer";
import { IngestionProgressTracker } from "@/components/ingestion-progress";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Sparkles, Github, ArrowRight, Loader2, BookOpen } from "lucide-react";

export default function Home() {
  const [repoUrl, setRepoUrl] = useState("");
  const [activeFile, setActiveFile] = useState(null);
  const [fileContent, setFileContent] = useState("// Select a file or click a citation in chat to view code");
  const [highlightRange, setHighlightRange] = useState(null);

  const {
    repositories,
    currentRepo,
    files,
    loading,
    error,
    selectRepository,
    startIngestion,
    refreshRepositories,
  } = useRepository();

  const handleSelectCitation = async (citation) => {
    if (!currentRepo) return;
    try {
      // Find matching file in repository files list or fetch directly
      const matched = files.find((f) => f.file_path === citation.file_path);
      if (matched) {
        const data = await api.getFileContent(currentRepo.id, matched.id);
        setActiveFile(matched);
        setFileContent(data.content);
      } else {
        setActiveFile({ file_path: citation.file_path });
        setFileContent(citation.snippet || "// Code snippet preview");
      }
      setHighlightRange({
        startLine: citation.start_line,
        endLine: citation.end_line,
      });
    } catch (err) {
      console.error("Failed to load cited file:", err);
    }
  };

  const handleSelectFile = async (file) => {
    if (!currentRepo) return;
    try {
      const data = await api.getFileContent(currentRepo.id, file.id);
      setActiveFile(file);
      setFileContent(data.content);
      setHighlightRange(null);
    } catch (err) {
      console.error("Failed to load file:", err);
    }
  };

  const { messages, isStreaming, sendMessage } = useChat(
    currentRepo?.id,
    handleSelectCitation
  );

  const handleIngestSubmit = async (e) => {
    e.preventDefault();
    if (!repoUrl.trim()) return;
    try {
      await startIngestion(repoUrl);
      setRepoUrl("");
    } catch (err) {
      console.error("Ingestion submit error:", err);
    }
  };

  // If no repository is active, show the clean onboarding hero
  if (!currentRepo) {
    return (
      <main className="min-h-screen flex flex-col items-center justify-center p-6 bg-background text-foreground relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-b from-primary/5 via-transparent to-transparent pointer-events-none" />

        <div className="w-full max-w-xl space-y-6 text-center z-10">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 border border-primary/20 text-xs font-semibold text-primary">
            <Sparkles className="w-3.5 h-3.5" />
            <span>AST-Parsed & Gemini RAG Assistant</span>
          </div>

          <h1 className="text-3xl sm:text-4xl font-bold tracking-tight">
            Chat with any GitHub repository
          </h1>
          <p className="text-sm text-muted-foreground max-w-md mx-auto">
            Paste any public GitHub repository to parse its AST with Tree-sitter, vectorize into Qdrant, and start asking grounded questions with real line citations.
          </p>

          <form onSubmit={handleIngestSubmit} className="flex gap-2">
            <div className="relative flex-1">
              <Github className="w-4 h-4 absolute left-3 top-3 text-muted-foreground" />
              <Input
                value={repoUrl}
                onChange={(e) => setRepoUrl(e.target.value)}
                placeholder="https://github.com/owner/repository"
                className="pl-9 text-xs h-10 font-mono"
              />
            </div>
            <Button type="submit" disabled={loading || !repoUrl.trim()} className="h-10 text-xs gap-1.5 px-4">
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowRight className="w-4 h-4" />}
              Ingest Repo
            </Button>
          </form>

          {error && <p className="text-xs text-rose-500 font-mono">{error}</p>}

          {/* Existing Repositories */}
          {repositories.length > 0 && (
            <div className="pt-6 border-t border-border/40 text-left space-y-3">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                <BookOpen className="w-3.5 h-3.5" /> Ingested Repositories
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {repositories.map((repo) => (
                  <button
                    key={repo.id}
                    onClick={() => selectRepository(repo)}
                    className="p-3 rounded-lg border border-border/40 bg-card hover:bg-muted/50 text-left transition-all hover:border-primary/40 space-y-1"
                  >
                    <div className="font-semibold text-xs text-foreground truncate">
                      {repo.owner}/{repo.name}
                    </div>
                    <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                      <span>{repo.total_files || 0} files</span>
                      <span className="capitalize">{repo.status}</span>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </main>
    );
  }

  return (
    <WorkspaceLayout
      repo={currentRepo}
      files={files}
      activeFile={activeFile}
      onSelectFile={handleSelectFile}
      rightPane={
        <MonacoCodeViewer
          filePath={activeFile?.file_path || "Select code to inspect"}
          content={fileContent}
          language={activeFile?.language || "javascript"}
          highlightRange={highlightRange}
        />
      }
    >
      <div className="flex flex-col h-full">
        {currentRepo.status !== "ready" && (
          <div className="p-4 border-b border-border/40">
            <IngestionProgressTracker
              repo={currentRepo}
              onComplete={refreshRepositories}
            />
          </div>
        )}
        <div className="flex-1 overflow-hidden">
          <ChatPanel
            messages={messages}
            isStreaming={isStreaming}
            onSendMessage={sendMessage}
            onSelectCitation={handleSelectCitation}
            repoName={`${currentRepo.owner}/${currentRepo.name}`}
          />
        </div>
      </div>
    </WorkspaceLayout>
  );
}
