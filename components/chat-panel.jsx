"use client";

import React, { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { CitationBadge } from "@/components/citation-badge";
import { Send, Bot, User, Sparkles, Code2, Terminal } from "lucide-react";

export function ChatPanel({
  messages = [],
  isStreaming = false,
  onSendMessage,
  onSelectCitation,
  repoName = "Repository",
}) {
  const [input, setInput] = useState("");
  const messagesEndRef = useRef(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isStreaming]);

  const handleSubmit = (e) => {
    e?.preventDefault();
    if (!input.trim() || isStreaming) return;
    onSendMessage(input);
    setInput("");
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const suggestedPrompts = [
    "How does authentication and session management work?",
    "Where is the main entry point and routing configured?",
    "Explain the database models and relationships.",
    "Show me the core business logic and services.",
  ];

  return (
    <div className="flex flex-col h-full bg-background relative">
      {/* Messages Thread */}
      <div className="flex-1 overflow-y-auto p-4 space-y-6">
        {messages.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center p-6 space-y-4">
            <div className="w-12 h-12 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary shadow-inner">
              <Sparkles className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-base font-semibold">Chat with {repoName}</h2>
              <p className="text-xs text-muted-foreground max-w-sm mt-1">
                Ask questions about architecture, functions, or implementation details. Every answer is grounded with real file and line citations.
              </p>
            </div>

            {/* Quick Suggestions */}
            <div className="grid grid-cols-1 gap-2 w-full max-w-md pt-2">
              {suggestedPrompts.map((prompt, i) => (
                <button
                  key={i}
                  onClick={() => onSendMessage(prompt)}
                  className="text-left text-xs p-2.5 rounded-lg border border-border/40 bg-card/40 hover:bg-muted/60 transition-colors text-muted-foreground hover:text-foreground flex items-center gap-2"
                >
                  <Code2 className="w-3.5 h-3.5 text-primary shrink-0" />
                  <span className="truncate">{prompt}</span>
                </button>
              ))}
            </div>
          </div>
        ) : (
          messages.map((msg, idx) => (
            <div
              key={msg.id || idx}
              className={`flex gap-3 text-sm ${
                msg.role === "user" ? "justify-end" : "justify-start"
              }`}
            >
              {msg.role === "assistant" && (
                <div className="w-7 h-7 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center text-primary shrink-0 mt-0.5">
                  <Bot className="w-4 h-4" />
                </div>
              )}

              <div
                className={`max-w-[85%] rounded-xl p-3.5 space-y-2 ${
                  msg.role === "user"
                    ? "bg-primary text-primary-foreground font-medium"
                    : "bg-card border border-border/50 text-foreground"
                }`}
              >
                <div className="whitespace-pre-wrap leading-relaxed font-sans text-xs">
                  {msg.content}
                  {msg.streaming && (
                    <span className="inline-block w-1.5 h-3.5 ml-1 bg-primary animate-pulse" />
                  )}
                </div>

                {/* Grounded Citation Badges */}
                {msg.citations && msg.citations.length > 0 && (
                  <div className="pt-2 border-t border-border/30 flex flex-wrap items-center gap-1">
                    <span className="text-[10px] text-muted-foreground font-mono mr-1">Citations:</span>
                    {msg.citations.map((citation, cIdx) => (
                      <CitationBadge
                        key={cIdx}
                        citation={citation}
                        onSelect={onSelectCitation}
                      />
                    ))}
                  </div>
                )}
              </div>

              {msg.role === "user" && (
                <div className="w-7 h-7 rounded-lg bg-muted border border-border/60 flex items-center justify-center text-muted-foreground shrink-0 mt-0.5">
                  <User className="w-4 h-4" />
                </div>
              )}
            </div>
          ))
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input Form */}
      <div className="p-3 border-t border-border/40 bg-card/40 backdrop-blur-sm">
        <form onSubmit={handleSubmit} className="relative flex items-center">
          <Textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask about this codebase (e.g. how does auth work?)..."
            className="min-h-[44px] max-h-32 pr-12 text-xs font-sans resize-none py-3"
            rows={1}
          />
          <Button
            type="submit"
            size="icon"
            disabled={!input.trim() || isStreaming}
            className="absolute right-1.5 h-8 w-8 rounded-lg"
          >
            <Send className="w-3.5 h-3.5" />
          </Button>
        </form>
      </div>
    </div>
  );
}
