/**
 * 軽量リードストア(data/leads.json)。
 * 本番は better-sqlite3 / Cloudflare D1 等へ差し替え可(インターフェースは同じ)。
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { REPO_ROOT, type Lead } from "@app/shared";

const DB_FILE = path.join(REPO_ROOT, "data", "leads.json");

type Db = { leads: Record<string, Lead> };

function load(): Db {
  if (!existsSync(DB_FILE)) return { leads: {} };
  return JSON.parse(readFileSync(DB_FILE, "utf8"));
}

function save(db: Db): void {
  mkdirSync(path.dirname(DB_FILE), { recursive: true });
  writeFileSync(DB_FILE, JSON.stringify(db, null, 2), "utf8");
}

export function getLead(lineUserId: string): Lead | undefined {
  return load().leads[lineUserId];
}

export function upsertLead(lineUserId: string, patch: Partial<Lead>): Lead {
  const db = load();
  const existing = db.leads[lineUserId];
  const lead: Lead = {
    lineUserId,
    displayName: patch.displayName ?? existing?.displayName,
    addedAt: existing?.addedAt ?? new Date().toISOString(),
    consentAt: patch.consentAt ?? existing?.consentAt,
    tags: patch.tags ?? existing?.tags ?? [],
    stage: patch.stage ?? existing?.stage ?? "new",
  };
  db.leads[lineUserId] = lead;
  save(db);
  return lead;
}

export function addTag(lineUserId: string, tag: string): void {
  const db = load();
  const lead = db.leads[lineUserId];
  if (!lead) return;
  if (!lead.tags.includes(tag)) lead.tags.push(tag);
  save(db);
}

export function allLeads(): Lead[] {
  return Object.values(load().leads);
}
