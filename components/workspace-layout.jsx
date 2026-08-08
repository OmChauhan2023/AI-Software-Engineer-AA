"use client";

import React, { useState } from "react";
import { FolderTree, MessageSquare, Terminal, GitBranch, Github, Layers } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

export function WorkspaceLayout({
  repo,
  files = [],
  activeFile,
  onSelectFile,
  children, // Left pane (Chat)
  rightPane, // Right pane (Monaco)
}) {
  const [showFileTree, setShowFileTree] = useState(false);

  return (
    <div className="flex flex-col h-screen w-full bg-background text-foreground overflow-hidden font-sans">
      {/* Top Application Header */}
      <header className="h-14 border-b border-border/40 px-4 flex items-center justify-between bg-card/60 backdrop-blur-md z-10">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center text-primary font-bold">
            <Layers className="w-4 h-4" />
          </div>
          <div>
            <h1 className="text-sm font-semibold tracking-tight flex items-center gap-2">
              AI Repository Assistant
              <Badge variant="secondary" className="text-[10px] px-1.5 py-0">v1.0</Badge>
            </h1>
            <p className="text-[11px] text-muted-foreground">
              Grounded RAG with Tree-sitter AST & Gemini
            </p>
          </div>
        </div>

        {repo && (
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground bg-muted/40 px-2.5 py-1 rounded-md border border-border/30">
              <Github className="w-3.5 h-3.5 text-foreground" />
              <span className="font-medium text-foreground">{repo.owner}/{repo.name}</span>
              <span className="text-zinc-600">|</span>
              <GitBranch className="w-3.5 h-3.5 text-muted-foreground" />
              <span>{repo.default_branch || "main"}</span>
            </div>

            <Button
              variant="outline"
              size="sm"
              className="text-xs h-8 gap-1.5"
              onClick={() => setShowFileTree(!showFileTree)}
            >
              <FolderTree className="w-3.5 h-3.5" />
              {showFileTree ? "Hide Files" : "Browse Files"} ({files.length})
            </Button>
          </div>
        )}
      </header>

      {/* Main Two-Pane Split Body */}
      <div className="flex-1 flex overflow-hidden relative">
        {/* Optional File Tree Drawer */}
        {showFileTree && (
          <div className="w-64 border-r border-border/40 bg-card/40 flex flex-col z-20 transition-all">
            <div className="px-3 py-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider border-b border-border/30">
              Repository Files
            </div>
            <div className="flex-1 overflow-y-auto p-2 space-y-1">
              {files.map((file) => (
                <button
                  key={file.id}
                  onClick={() => {
                    onSelectFile(file);
                    setShowFileTree(false);
                  }}
                  className={`w-full text-left px-2.5 py-1.5 rounded-md text-xs font-mono truncate transition-colors flex items-center justify-between ${
                    activeFile?.id === file.id
                      ? "bg-primary/15 text-primary font-medium"
                      : "hover:bg-muted/60 text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <span className="truncate">{file.file_path}</span>
                  <span className="text-[10px] text-zinc-500">{file.line_count}L</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Left Pane: Conversation & Ingestion Progress */}
        <div className="w-1/2 flex flex-col h-full border-r border-border/40 bg-background/50">
          {children}
        </div>

        {/* Right Pane: Monaco Editor Code Canvas */}
        <div className="w-1/2 flex flex-col h-full bg-card/20">
          {rightPane}
        </div>
      </div>
    </div>
  );
}
