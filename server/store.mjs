import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.join(__dirname, "data");
const dbPath = process.env.VERCEL
  ? path.join("/tmp", "autoloop.local.json")
  : path.join(dataDir, "autoloop.local.json");
const seedPath = path.join(dataDir, "seed.json");

function ensureDb() {
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  if (!fs.existsSync(dbPath)) {
    fs.copyFileSync(seedPath, dbPath);
  }
}

export function readDb() {
  ensureDb();
  return JSON.parse(fs.readFileSync(dbPath, "utf8"));
}

export function writeDb(db) {
  ensureDb();
  fs.writeFileSync(dbPath, JSON.stringify(db, null, 2), "utf8");
  return db;
}

export function updateDb(mutator) {
  const db = readDb();
  const result = mutator(db);
  writeDb(db);
  return result ?? db;
}
