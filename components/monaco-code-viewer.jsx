"use client";

import React, { useEffect, useRef } from "react";
import Editor from "@monaco-editor/react";
import { Badge } from "@/components/ui/badge";
import { FileCode, Hash } from "lucide-react";

export function MonacoCodeViewer({
  filePath = "Select a file to view code",
  content = "// Click any citation in the chat to jump directly to the code",
  language = "javascript",
  highlightRange = null, // { startLine: 45, endLine: 82 }
}) {
  const editorRef = useRef(null);
  const monacoRef = useRef(null);
  const decorationsRef = useRef([]);

  const handleEditorDidMount = (editor, monaco) => {
    editorRef.current = editor;
    monacoRef.current = monaco;
  };

  useEffect(() => {
    if (!editorRef.current || !monacoRef.current || !highlightRange) return;

    const editor = editorRef.current;
    const monaco = monacoRef.current;
    const { startLine, endLine } = highlightRange;

    // Scroll smoothly to the cited lines
    editor.revealLinesInCenter(startLine, endLine || startLine);

    // Apply high-contrast line highlight decoration
    const newDecorations = [
      {
        range: new monaco.Range(startLine, 1, endLine || startLine, 1),
        options: {
          isWholeLine: true,
          className: "bg-amber-500/20 border-l-4 border-amber-500",
          glyphMarginClassName: "bg-amber-500",
          linesDecorationsClassName: "bg-amber-500",
        },
      },
    ];

    decorationsRef.current = editor.deltaDecorations(
      decorationsRef.current,
      newDecorations
    );
  }, [highlightRange, content]);

  return (
    <div className="flex flex-col h-full bg-[#1e1e1e] border-l border-border/40 rounded-r-xl overflow-hidden">
      {/* File Header Bar */}
      <div className="flex items-center justify-between px-4 py-2.5 bg-[#252526] border-b border-[#333333] text-xs">
        <div className="flex items-center gap-2 text-zinc-300 font-mono">
          <FileCode className="w-4 h-4 text-blue-400" />
          <span className="truncate max-w-[300px]">{filePath}</span>
        </div>
        {highlightRange && (
          <Badge variant="outline" className="bg-amber-500/10 text-amber-400 border-amber-500/30 flex items-center gap-1 font-mono">
            <Hash className="w-3 h-3" />
            Lines {highlightRange.startLine}–{highlightRange.endLine}
          </Badge>
        )}
      </div>

      {/* Monaco Editor Canvas */}
      <div className="flex-1 w-full h-full relative">
        <Editor
          height="100%"
          language={language}
          value={content}
          theme="vs-dark"
          options={{
            readOnly: true,
            minimap: { enabled: true },
            fontSize: 13,
            lineNumbers: "on",
            scrollBeyondLastLine: false,
            automaticLayout: true,
            fontFamily: "var(--font-mono), 'JetBrains Mono', 'Fira Code', monospace",
            renderLineHighlight: "all",
          }}
          onMount={handleEditorDidMount}
        />
      </div>
    </div>
  );
}
