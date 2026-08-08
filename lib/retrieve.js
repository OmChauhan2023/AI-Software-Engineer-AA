import { getDb } from "./mongodb";
import { embed } from "./embeddings";

function dot(a, b) {
  let s = 0;
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) s += a[i] * b[i];
  return s;
}

// Local embeddings are L2-normalized, so dot product == cosine similarity.
export async function retrieve(repoId, question, k = 6) {
  const q = await embed(question);
  const db = await getDb();
  const chunks = await db
    .collection("chunks")
    .find({ repoId })
    .project({ embedding: 1, path: 1, startLine: 1, endLine: 1, symbolName: 1, text: 1, language: 1 })
    .toArray();

  const scored = chunks.map((c) => ({ c, score: dot(q, c.embedding || []) }));
  scored.sort((a, b) => b.score - a.score);

  return scored.slice(0, k).map(({ c, score }) => ({
    path: c.path,
    startLine: c.startLine,
    endLine: c.endLine,
    symbolName: c.symbolName || null,
    text: c.text,
    language: c.language,
    score,
  }));
}
