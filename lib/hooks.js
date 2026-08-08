import { useState, useEffect, useCallback, useRef } from "react";
import { api } from "./api";

export function useRepository(initialRepoId = null) {
  const [repositories, setRepositories] = useState([]);
  const [currentRepo, setCurrentRepo] = useState(null);
  const [files, setFiles] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const fetchRepositories = useCallback(async () => {
    try {
      const data = await api.listRepositories();
      setRepositories(data);
      if (initialRepoId) {
        const matched = data.find((r) => r.id === initialRepoId);
        if (matched) setCurrentRepo(matched);
      }
    } catch (err) {
      setError(err.message);
    }
  }, [initialRepoId]);

  const selectRepository = async (repo) => {
    setCurrentRepo(repo);
    if (repo && repo.status === "ready") {
      try {
        const fileList = await api.listFiles(repo.id);
        setFiles(fileList);
      } catch (err) {
        console.error("Error loading files:", err);
      }
    }
  };

  const startIngestion = async (githubUrl) => {
    setLoading(true);
    setError(null);
    try {
      const newRepo = await api.ingestRepository(githubUrl);
      setCurrentRepo(newRepo);
      fetchRepositories();
      return newRepo;
    } catch (err) {
      setError(err.message);
      throw err;
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRepositories();
  }, [fetchRepositories]);

  return {
    repositories,
    currentRepo,
    files,
    loading,
    error,
    selectRepository,
    startIngestion,
    refreshRepositories: fetchRepositories,
  };
}

export function useChat(repoId, onCitationSelect) {
  const [messages, setMessages] = useState([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [sessionId, setSessionId] = useState(null);
  const eventSourceRef = useRef(null);

  const sendMessage = async (query) => {
    if (!query.trim() || !repoId || isStreaming) return;

    const userMessage = {
      id: "temp-" + Date.now(),
      role: "user",
      content: query,
      citations: [],
    };

    const assistantPlaceholder = {
      id: "asst-" + Date.now(),
      role: "assistant",
      content: "",
      citations: [],
      streaming: true,
    };

    setMessages((prev) => [...prev, userMessage, assistantPlaceholder]);
    setIsStreaming(true);

    try {
      const res = await fetch(api.getStreamUrl(repoId), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query, session_id: sessionId }),
      });

      if (!res.ok) {
        throw new Error("Chat request failed");
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (line.startsWith("data: ")) {
            try {
              const data = JSON.parse(line.slice(6));
              if (data.type === "session_init") {
                setSessionId(data.session_id);
              } else if (data.type === "token") {
                setMessages((prev) => {
                  const updated = [...prev];
                  const last = updated[updated.length - 1];
                  if (last && last.role === "assistant") {
                    last.content += data.text;
                  }
                  return updated;
                });
              } else if (data.type === "citations_ready") {
                setMessages((prev) => {
                  const updated = [...prev];
                  const last = updated[updated.length - 1];
                  if (last && last.role === "assistant") {
                    last.citations = data.citations || [];
                  }
                  return updated;
                });
              } else if (data.type === "done") {
                setMessages((prev) => {
                  const updated = [...prev];
                  const last = updated[updated.length - 1];
                  if (last && last.role === "assistant") {
                    last.streaming = false;
                    if (data.extracted_citations?.length) {
                      last.citations = data.extracted_citations;
                    }
                  }
                  return updated;
                });
              }
            } catch (err) {
              console.error("JSON parse error:", err);
            }
          }
        }
      }
    } catch (err) {
      console.error("Streaming error:", err);
      setMessages((prev) => {
        const updated = [...prev];
        const last = updated[updated.length - 1];
        if (last && last.role === "assistant") {
          last.content += `\n[Error: ${err.message}]`;
          last.streaming = false;
        }
        return updated;
      });
    } finally {
      setIsStreaming(false);
    }
  };

  return {
    messages,
    isStreaming,
    sessionId,
    sendMessage,
    clearMessages: () => setMessages([]),
  };
}
