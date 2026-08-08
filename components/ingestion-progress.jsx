"use client";

import React, { useEffect, useState } from "react";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, Loader2, GitBranch, Cpu, Database, AlertCircle } from "lucide-react";
import { api } from "@/lib/api";

export function IngestionProgressTracker({ repo, onComplete }) {
  const [status, setStatus] = useState(repo?.status || "pending");
  const [percentage, setPercentage] = useState(repo?.progress_percentage || 0);
  const [message, setMessage] = useState(repo?.status_message || "Queued for ingestion");

  useEffect(() => {
    if (!repo?.id || status === "ready" || status === "failed") return;

    const eventSource = new EventSource(api.getProgressStreamUrl(repo.id));

    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        setStatus(data.status);
        setPercentage(data.percentage);
        setMessage(data.message);

        if (data.status === "ready") {
          eventSource.close();
          if (onComplete) onComplete();
        } else if (data.status === "failed") {
          eventSource.close();
        }
      } catch (err) {
        console.error("SSE parse error:", err);
      }
    };

    eventSource.onerror = () => {
      eventSource.close();
    };

    return () => {
      eventSource.close();
    };
  }, [repo?.id, status, onComplete]);

  const stages = [
    { key: "cloning", label: "Git Shallow Clone", icon: GitBranch },
    { key: "parsing", label: "Tree-sitter AST", icon: Cpu },
    { key: "embedding", label: "Gemini Vectorization", icon: Database },
    { key: "ready", label: "Grounded & Ready", icon: CheckCircle2 },
  ];

  return (
    <div className="p-4 rounded-xl bg-card border border-border/60 shadow-sm space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {status === "ready" ? (
            <CheckCircle2 className="w-4 h-4 text-emerald-500" />
          ) : status === "failed" ? (
            <AlertCircle className="w-4 h-4 text-rose-500" />
          ) : (
            <Loader2 className="w-4 h-4 text-primary animate-spin" />
          )}
          <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Pipeline: {status}
          </span>
        </div>
        <span className="text-xs font-mono font-bold text-foreground">{percentage}%</span>
      </div>

      <Progress value={percentage} className="h-1.5" />

      <p className="text-xs text-muted-foreground font-mono truncate">{message}</p>

      {/* Step Indicators */}
      <div className="grid grid-cols-4 gap-2 pt-1 border-t border-border/30">
        {stages.map((stage, idx) => {
          const Icon = stage.icon;
          const isDone =
            status === "ready" ||
            (status === "embedding" && idx <= 1) ||
            (status === "parsing" && idx === 0);
          const isCurrent = status === stage.key;

          return (
            <div
              key={stage.key}
              className={`flex flex-col items-center p-2 rounded-lg text-center transition-colors ${
                isDone
                  ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                  : isCurrent
                  ? "bg-primary/15 text-primary border border-primary/30"
                  : "bg-muted/30 text-muted-foreground/60"
              }`}
            >
              <Icon className="w-3.5 h-3.5 mb-1" />
              <span className="text-[10px] font-medium leading-tight">{stage.label}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
