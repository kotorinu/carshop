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

// --- 受信メッセージログ(data/messages.json) ---
// 毎日の「要対応リスト」(返信漏れ防止)の材料。直近500件だけ保持する。
export type InboundMessage = {
  at: string;
  lineUserId: string;
  kind: "text" | "booking" | "postback";
  text: string;
};

const MSG_FILE = path.join(REPO_ROOT, "data", "messages.json");

export function appendMessage(msg: InboundMessage): void {
  let list: InboundMessage[] = [];
  if (existsSync(MSG_FILE)) {
    try {
      list = JSON.parse(readFileSync(MSG_FILE, "utf8"));
    } catch {
      list = [];
    }
  }
  list.push(msg);
  if (list.length > 500) list = list.slice(-500);
  mkdirSync(path.dirname(MSG_FILE), { recursive: true });
  writeFileSync(MSG_FILE, JSON.stringify(list, null, 2), "utf8");
}

export function recentMessages(sinceMs: number): InboundMessage[] {
  if (!existsSync(MSG_FILE)) return [];
  try {
    const list: InboundMessage[] = JSON.parse(readFileSync(MSG_FILE, "utf8"));
    return list.filter((m) => Date.parse(m.at) >= sinceMs);
  } catch {
    return [];
  }
}
