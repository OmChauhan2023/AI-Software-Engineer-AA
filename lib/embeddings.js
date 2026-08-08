import { pipeline } from "@huggingface/transformers";

let extractorPromise;

function getExtractor() {
  if (!extractorPromise) {
    extractorPromise = pipeline("feature-extraction", "Xenova/all-MiniLM-L6-v2");
  }
  return extractorPromise;
}

function clean(text) {
  const t = String(text || "").replace(/\s+/g, " ").trim().slice(0, 2000);
  return t.length ? t : " ";
}

export async function embed(text) {
  const model = await getExtractor();
  const output = await model(clean(text), { pooling: "mean", normalize: true });
  return Array.from(output.data);
}

export async function embedMany(texts, batchSize = 16, onProgress) {
  const model = await getExtractor();
  const results = [];
  for (let i = 0; i < texts.length; i += batchSize) {
    const batch = texts.slice(i, i + batchSize).map(clean);
    const output = await model(batch, { pooling: "mean", normalize: true });
    const list = output.tolist();
    for (const v of list) results.push(v);
    if (onProgress) onProgress(Math.min(i + batchSize, texts.length));
  }
  return results;
}

// warm the model in the background (non-blocking)
export function warmup() {
  getExtractor().catch(() => {});
}
