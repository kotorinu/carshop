/**
 * LIFFフォーム送信ストア(data/submissions.json)。
 * store.ts(leads)と同じ軽量JSON方式。本番は D1 / sqlite に差し替え可。
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { REPO_ROOT, type Submission } from "@app/shared";

const DB_FILE = path.join(REPO_ROOT, "data", "submissions.json");

type Db = { submissions: Submission[] };

function load(): Db {
  if (!existsSync(DB_FILE)) return { submissions: [] };
  return JSON.parse(readFileSync(DB_FILE, "utf8"));
}

function save(db: Db): void {
  mkdirSync(path.dirname(DB_FILE), { recursive: true });
  writeFileSync(DB_FILE, JSON.stringify(db, null, 2), "utf8");
}

export function addSubmission(s: Submission): void {
  const db = load();
  db.submissions.push(s);
  save(db);
}

export function allSubmissions(): Submission[] {
  return load().submissions;
}
