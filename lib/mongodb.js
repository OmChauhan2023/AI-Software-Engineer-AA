import { MongoClient } from "mongodb";

const uri = process.env.MONGO_URL;
const dbName = process.env.DB_NAME || "code_rag";

if (!uri) {
  throw new Error("Missing MONGO_URL environment variable");
}

let globalWithMongo = globalThis;

if (!globalWithMongo._mongoClientPromise) {
  const client = new MongoClient(uri);
  globalWithMongo._mongoClientPromise = client.connect();
}

export async function getDb() {
  const client = await globalWithMongo._mongoClientPromise;
  return client.db(dbName);
}
