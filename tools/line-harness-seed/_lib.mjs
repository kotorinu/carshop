// broadcast.mjs / kpi.mjs 共通: 接続情報の解決とAPIクライアント
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import os from "node:os";

export function loadConfig() {
  let fileCfg = {};
  const cfgPath = join(os.homedir(), ".line-harness", ".line-harness-config.json");
  if (existsSync(cfgPath)) {
    try {
      fileCfg = JSON.parse(readFileSync(cfgPath, "utf8"));
    } catch {
      /* 環境変数にフォールバック */
    }
  }
  const workerUrl = (process.env.WORKER_URL || fileCfg.workerUrl || "").replace(/\/$/, "");
  const apiKey = process.env.API_KEY || fileCfg.apiKey || "";
  if (!workerUrl || !apiKey) {
    console.error("エラー: WORKER_URL / API_KEY が見つかりません（環境変数 or ~/.line-harness/.line-harness-config.json）");
    process.exit(1);
  }
  return { workerUrl, apiKey };
}

export function makeApi(cfg) {
  return async function api(method, path, body) {
    const res = await fetch(`${cfg.workerUrl}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${cfg.apiKey}`,
        "Content-Type": "application/json",
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok || json.success === false) {
      throw new Error(`${method} ${path} → HTTP ${res.status}: ${json.error ?? JSON.stringify(json)}`);
    }
    return json.data;
  };
}

/** 引数パース: --key value / --flag */
export function parseArgs(argv) {
  const args = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith("--")) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (next !== undefined && !next.startsWith("--")) {
        args[key] = next;
        i++;
      } else {
        args[key] = true;
      }
    } else {
      args._.push(a);
    }
  }
  return args;
}
