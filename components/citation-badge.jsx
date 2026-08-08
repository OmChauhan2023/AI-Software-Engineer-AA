"use client";

import React from "react";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { FileCode, CornerDownRight } from "lucide-react";

export function CitationBadge({ citation, onSelect }) {
  if (!citation) return null;

  const { file_path, start_line, end_line, snippet, symbol_name } = citation;
  const fileName = file_path.split("/").pop();

  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            onClick={() => onSelect(citation)}
            className="inline-flex items-center gap-1.5 px-2 py-0.5 my-0.5 mx-1 rounded-md text-xs font-mono bg-blue-500/10 text-blue-400 hover:bg-blue-500/20 border border-blue-500/30 transition-all hover:scale-[1.02] cursor-pointer"
          >
            <FileCode className="w-3 h-3 text-blue-400" />
            <span className="font-semibold text-zinc-200">{fileName}</span>
            <span className="text-blue-300/80">:{start_line}–{end_line}</span>
          </button>
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-sm p-3 bg-zinc-900 border-zinc-800 text-zinc-100 shadow-xl font-mono text-xs">
          <div className="flex items-center justify-between pb-1.5 mb-1.5 border-b border-zinc-800 text-zinc-400 text-[11px]">
            <span className="truncate">{file_path}</span>
            <span className="text-blue-400 font-bold">L{start_line}–L{end_line}</span>
          </div>
          {symbol_name && (
            <div className="text-amber-400 text-[11px] mb-1">
              Symbol: <span className="text-zinc-200">{symbol_name}</span>
            </div>
          )}
          {snippet && (
            <pre className="text-[10px] text-zinc-300 bg-black/50 p-1.5 rounded overflow-x-auto max-h-24 whitespace-pre-wrap">
              {snippet}
            </pre>
          )}
          <div className="flex items-center gap-1 text-[10px] text-blue-400 mt-1 pt-1 border-t border-zinc-800">
            <CornerDownRight className="w-2.5 h-2.5" /> Click to open in Monaco Editor
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
