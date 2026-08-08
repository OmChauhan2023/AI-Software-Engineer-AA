const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export const api = {
  async listRepositories() {
    const res = await fetch(`${API_BASE_URL}/api/repositories`);
    if (!res.ok) throw new Error("Failed to fetch repositories");
    return res.json();
  },

  async getRepository(repoId) {
    const res = await fetch(`${API_BASE_URL}/api/repositories/${repoId}`);
    if (!res.ok) throw new Error("Failed to fetch repository details");
    return res.json();
  },

  async ingestRepository(githubUrl) {
    const res = await fetch(`${API_BASE_URL}/api/repositories`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ github_url: githubUrl }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.detail || "Failed to submit repository");
    }
    return res.json();
  },

  async listFiles(repoId) {
    const res = await fetch(`${API_BASE_URL}/api/repositories/${repoId}/files`);
    if (!res.ok) throw new Error("Failed to load file tree");
    return res.json();
  },

  async getFileContent(repoId, fileId) {
    const res = await fetch(`${API_BASE_URL}/api/repositories/${repoId}/files/${fileId}`);
    if (!res.ok) throw new Error("Failed to load file content");
    return res.json();
  },

  async listSessions(repoId) {
    const res = await fetch(`${API_BASE_URL}/api/repositories/${repoId}/sessions`);
    if (!res.ok) throw new Error("Failed to load sessions");
    return res.json();
  },

  async getSessionMessages(sessionId) {
    const res = await fetch(`${API_BASE_URL}/api/sessions/${sessionId}/messages`);
    if (!res.ok) throw new Error("Failed to load session messages");
    return res.json();
  },

  getStreamUrl(repoId) {
    return `${API_BASE_URL}/api/repositories/${repoId}/chat`;
  },

  getProgressStreamUrl(repoId) {
    return `${API_BASE_URL}/api/repositories/${repoId}/progress`;
  }
};
