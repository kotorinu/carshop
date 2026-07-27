#!/usr/bin/env node
/**
 * carshop × LINE Harness — CRM初期設定を一発投入するseedスクリプト
 *
 * LINE Harness デプロイ後に1回実行すると、以下を作成する（再実行しても重複しない）:
 *   - タグ（流入元 src:* / 興味 int:* / 状態 st:*）
 *   - ステップ配信シナリオ「新規友だち育成（Day0-7）」5通
 *     （文面は packages/line-bot/src/flows/steps.ts から移植）
 *   - LIFFフォーム（無料査定）→ 送信時に自動タグ付け
 *   - 来店予約は外部予約サービス RESERVA（reserva.be）へのトラッキングリンクに一本化
 *     （実際の空き枠・二重予約防止はRESERVA側に任せる。クリック時にst:来店予約タグが付く）
 *   - 自動応答（査定/予約/来店/アクセス/営業時間）※replyMessageなので無料
 *   - IF-THEN自動化（キーワード → タグ付け）
 *   - リッチメニュー（--richmenu 指定時。richmenu/richmenu.png をアップロードしてデフォルト化）
 *
 * 使い方:
 *   node seed.mjs [--dry-run] [--richmenu]
 *
 * 接続情報の解決順:
 *   1. 環境変数 WORKER_URL / API_KEY / LIFF_ID / INVENTORY_URL（.env は使わず直接指定）
 *   2. ~/.line-harness/.line-harness-config.json（create-line-harness が保存するもの）
 */
import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import os from "node:os";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DRY = process.argv.includes("--dry-run");
const DO_RICHMENU = process.argv.includes("--richmenu");

// ---------- 接続情報 ----------
function loadConfig() {
  let fileCfg = {};
  const cfgPath = join(os.homedir(), ".line-harness", ".line-harness-config.json");
  if (existsSync(cfgPath)) {
    try {
      fileCfg = JSON.parse(readFileSync(cfgPath, "utf8"));
    } catch {
      console.warn(`警告: ${cfgPath} の読み込みに失敗（環境変数を使います）`);
    }
  }
  const workerUrl = (process.env.WORKER_URL || fileCfg.workerUrl || "").replace(/\/$/, "");
  const apiKey = process.env.API_KEY || fileCfg.apiKey || "";
  const liffId = process.env.LIFF_ID || fileCfg.liffId || "";
  const inventoryUrl = process.env.INVENTORY_URL || "https://kotokoto-company-site.vercel.app/";
  const reservaUrl = process.env.RESERVA_URL || "https://reserva.be/jupitercoring";
  if (!workerUrl || !apiKey) {
    console.error(
      "エラー: WORKER_URL / API_KEY が見つかりません。\n" +
        "  環境変数で渡すか、`npx create-line-harness` 完了後に再実行してください。\n" +
        `  （設定ファイル: ${cfgPath}）`,
    );
    process.exit(1);
  }
  if (!liffId) {
    console.error("エラー: LIFF_ID が見つかりません（フォームURLの生成に必要）。");
    process.exit(1);
  }
  return { workerUrl, apiKey, liffId, inventoryUrl, reservaUrl };
}

const cfg = loadConfig();

async function api(method, path, body) {
  if (DRY && method !== "GET") {
    console.log(`  [dry] ${method} ${path}`, body ? JSON.stringify(body).slice(0, 120) + "…" : "");
    return { id: `dry-${Math.random().toString(36).slice(2, 8)}` };
  }
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
}

// HarnessのLIFF SPAは ?page=form&id= 形式で受ける（?formId= は無効・真っ白になる）
const formUrl = (formId) => `https://liff.line.me/${cfg.liffId}?page=form&id=${formId}`;

const SHOP_INFO =
  "🚗 株式会社Jupiter Coring 大阪支店\n" +
  "📍 大阪府寝屋川市黒原橘町4-1\n" +
  "📞 06-6328-6042\n" +
  "🕘 営業時間 9:00〜19:00（木曜定休）\n" +
  "全車支払総額表示・法定整備付き・保証付き。現車確認歓迎です！";

// ---------- 1. タグ ----------
const TAGS = [
  { name: "src:tiktok", color: "#1d4ed8" },
  { name: "src:jimoty", color: "#2563eb" },
  { name: "src:mercari", color: "#3b82f6" },
  { name: "src:店頭", color: "#60a5fa" },
  { name: "src:紹介", color: "#93c5fd" },
  { name: "src:instagram", color: "#818cf8" },
  { name: "int:査定", color: "#f59e0b" },
  { name: "int:購入", color: "#f97316" },
  { name: "st:来店予約", color: "#16a34a" },
  { name: "st:成約", color: "#15803d" },
  { name: "st:配信停止", color: "#6b7280" },
];

async function seedTags() {
  console.log("── タグ ──");
  const existing = await api("GET", "/api/tags");
  const byName = new Map((existing ?? []).map((t) => [t.name, t]));
  const ids = {};
  for (const tag of TAGS) {
    if (byName.has(tag.name)) {
      ids[tag.name] = byName.get(tag.name).id;
      console.log(`  スキップ（既存）: ${tag.name}`);
    } else {
      const created = await api("POST", "/api/tags", tag);
      ids[tag.name] = created.id;
      console.log(`  作成: ${tag.name}`);
    }
  }
  return ids;
}

// ---------- 2. ステップ配信（Day0-7・5通） ----------
// 文面は carshop/packages/line-bot/src/flows/steps.ts より移植
const SCENARIO_NAME = "新規友だち育成（Day0-7）";
const STEPS = [
  {
    day: 0,
    delay: 0,
    text:
      "【1/5】当店は大阪の中古車販売店です。\n媒体に頼らず、SNSで「本当にいい一台」と「高く売りたい方」を直接つないでいます。買取も販売もお任せください。",
  },
  {
    day: 1,
    delay: 1440,
    text:
      "【2/5】今週の注目在庫を3台ピックアップ。\n気になる車種があれば返信で「車種名」を送ってください。来店予約もLINEから可能です。",
  },
  {
    day: 3,
    delay: 2880,
    text:
      "【3/5】車を高く売るコツ。\n①下取りより専門店査定 ②記録簿・整備歴を揃える ③相場を知ってから出す。\nLINEなら無料で査定シミュレーションができます。",
  },
  {
    day: 5,
    delay: 2880,
    text:
      "【4/5】お客様の声・納車事例をご紹介。\n初めての一台も、維持の本音まで正直にご案内します。今だけ来店予約で点検サービス付き。",
  },
  {
    day: 7,
    delay: 2880,
    text:
      "【5/5】期間限定の買取アップキャンペーン中。\n「査定」と送っていただくか、メニューの無料査定からどうぞ。最後までお読みいただきありがとうございます！",
  },
];

async function seedScenario(tagIds) {
  console.log("── ステップ配信 ──");
  const list = await api("GET", "/api/scenarios");
  const found = (list ?? []).find((s) => s.name === SCENARIO_NAME);
  if (found && (found.stepCount ?? 0) > 0) {
    console.log(`  スキップ（既存・${found.stepCount}ステップ）: ${SCENARIO_NAME}`);
    return found.id;
  }
  const scenario =
    found ??
    (await api("POST", "/api/scenarios", {
      name: SCENARIO_NAME,
      description: "友だち追加から7日間の育成シーケンス（旧line-botのsteps.tsを移植）",
      triggerType: "friend_add",
      isActive: true,
    }));
  const optOutTagId = tagIds["st:配信停止"];
  for (let i = 0; i < STEPS.length; i++) {
    const s = STEPS[i];
    await api("POST", `/api/scenarios/${scenario.id}/steps`, {
      stepOrder: i + 1,
      delayMinutes: s.delay,
      messageType: "text",
      messageContent: s.text,
      // Day1以降は「st:配信停止」タグが付いていたら送らない（falseで次ステップへスキップ）
      ...(i > 0 && optOutTagId
        ? { conditionType: "tag_not_exists", conditionValue: optOutTagId }
        : {}),
    });
    console.log(`  ステップ作成: Day${s.day}`);
  }
  console.log(`  作成: ${SCENARIO_NAME}`);
  return scenario.id;
}

// ---------- 3. フォーム ----------
// 「来店予約」は RESERVA（実際の空き枠と連動する外部予約サービス）に一本化する。
// ここでは希望日時をただの自由記述で集めるだけの重複導線は作らない（seedTrackedLinksを参照）。
async function seedForms(tagIds) {
  console.log("── フォーム ──");
  const existing = await api("GET", "/api/forms");
  const byName = new Map((existing ?? []).map((f) => [f.name, f]));
  const defs = [
    {
      name: "無料査定",
      description: "車の情報を送るだけで概算査定をお返しします。",
      onSubmitTagId: tagIds["int:査定"],
      onSubmitMessageType: "text",
      onSubmitMessageContent:
        "無料査定のお申込みありがとうございます🚗\n内容を確認して、営業時間内（9:00〜19:00・木曜定休）に概算金額をお送りします！\n※お急ぎの場合はこのトークにその旨を送ってください",
      saveToMetadata: true,
      fields: [
        { name: "car_model", label: "車種", type: "text", required: true, placeholder: "例: BMW 3シリーズ" },
        { name: "year", label: "年式（西暦）", type: "number", required: true, placeholder: "2019" },
        { name: "mileage", label: "走行距離（km）", type: "number", required: true, placeholder: "45000" },
        {
          name: "accident",
          label: "事故歴・修復歴",
          type: "radio",
          required: true,
          options: ["なし", "あり", "わからない"],
        },
        { name: "name", label: "お名前", type: "text", required: true },
        { name: "phone", label: "お電話番号", type: "tel" },
        { name: "note", label: "その他（装備・状態など）", type: "textarea" },
      ],
    },
  ];
  const ids = {};
  for (const def of defs) {
    if (byName.has(def.name)) {
      ids[def.name] = byName.get(def.name).id;
      console.log(`  スキップ（既存）: ${def.name}`);
    } else {
      const created = await api("POST", "/api/forms", def);
      ids[def.name] = created.id;
      console.log(`  作成: ${def.name}`);
    }
  }
  return ids;
}

// ---------- 3.5. トラッキングリンク（来店予約 → RESERVA） ----------
// クリック時に自動で st:来店予約 タグが付く。実際の空き枠・二重予約防止はRESERVA側に任せる。
const RESERVA_LINK_NAME = "RESERVA来店予約";

async function seedTrackedLinks(tagIds) {
  console.log("── トラッキングリンク ──");
  const existing = await api("GET", "/api/tracked-links");
  const found = (existing ?? []).find((l) => l.name === RESERVA_LINK_NAME);
  if (found) {
    console.log(`  スキップ（既存）: ${RESERVA_LINK_NAME} → ${found.trackingUrl}`);
    return { url: found.trackingUrl };
  }
  const link = await api("POST", "/api/tracked-links", {
    name: RESERVA_LINK_NAME,
    originalUrl: cfg.reservaUrl,
    tagId: tagIds["st:来店予約"],
  });
  console.log(`  作成: ${RESERVA_LINK_NAME} → ${link.trackingUrl}`);
  return { url: link.trackingUrl };
}

// ---------- 4. 自動応答（replyMessage = 通数カウント外） ----------
async function seedAutoReplies(formIds, reservaTrackingUrl) {
  console.log("── 自動応答 ──");
  const appraisalUrl = formUrl(formIds["無料査定"]);
  const bookingText =
    "ご来店予約はこちらから空き状況を見て予約できます👇\n" +
    `${reservaTrackingUrl}\n\n` +
    SHOP_INFO;
  const RULES = [
    {
      keyword: "査定",
      matchType: "contains",
      responseType: "text",
      responseContent:
        "無料査定のご依頼ありがとうございます🚗\n30秒で申込みできます👇\n" +
        `${appraisalUrl}\n\n` +
        "お急ぎの方は、このトークに「車種・年式・走行距離」を送っていただければ、そのまま概算をお出しします！",
    },
    { keyword: "予約", matchType: "contains", responseType: "text", responseContent: bookingText },
    { keyword: "来店", matchType: "contains", responseType: "text", responseContent: bookingText },
    { keyword: "アクセス", matchType: "contains", responseType: "text", responseContent: SHOP_INFO },
    { keyword: "営業時間", matchType: "contains", responseType: "text", responseContent: SHOP_INFO },
  ];
  const existing = await api("GET", "/api/auto-replies");
  const byKeyword = new Set((existing ?? []).map((r) => r.keyword));
  for (const rule of RULES) {
    if (byKeyword.has(rule.keyword)) {
      console.log(`  スキップ（既存）: ${rule.keyword}`);
    } else {
      await api("POST", "/api/auto-replies", rule);
      console.log(`  作成: ${rule.keyword}`);
    }
  }
}

// ---------- 5. IF-THEN自動化（キーワード → タグ付け） ----------
async function seedAutomations(tagIds) {
  console.log("── 自動化ルール ──");
  const RULES = [
    {
      name: "「査定」でint:査定タグ",
      eventType: "message_received",
      conditions: { keyword: "査定" },
      actions: [{ type: "add_tag", params: { tagId: tagIds["int:査定"] } }],
    },
    {
      name: "「予約」でst:来店予約タグ",
      eventType: "message_received",
      conditions: { keyword: "予約" },
      actions: [{ type: "add_tag", params: { tagId: tagIds["st:来店予約"] } }],
    },
    {
      name: "「来店」でst:来店予約タグ",
      eventType: "message_received",
      conditions: { keyword: "来店" },
      actions: [{ type: "add_tag", params: { tagId: tagIds["st:来店予約"] } }],
    },
  ];
  const existing = await api("GET", "/api/automations");
  const byName = new Set((existing ?? []).map((r) => r.name));
  for (const rule of RULES) {
    if (byName.has(rule.name)) {
      console.log(`  スキップ（既存）: ${rule.name}`);
    } else {
      await api("POST", "/api/automations", rule);
      console.log(`  作成: ${rule.name}`);
    }
  }
}

// ---------- 6. 配信テンプレート（管理画面/MCPからの配信で使う雛形） ----------
async function seedTemplates() {
  console.log("── 配信テンプレート ──");
  const TEMPLATES = [
    {
      name: "在庫紹介（週次）",
      category: "broadcast",
      messageType: "text",
      messageContent:
        "🚗今週の注目在庫\n\n【車種名】\n年式20XX年・走行X.X万km・支払総額XXX万円\n（傷・弱点も正直に書く→「だから安い」に変換）\n\n気になる方はこのトークに「車種名」を返信、または来店予約からどうぞ！",
    },
    {
      name: "値下げ告知",
      category: "broadcast",
      messageType: "text",
      messageContent:
        "【値下げしました】\n\n【車種名】XXX万円 → XXX万円\n\n理由も正直にお伝えします：（例）在庫入替のため。状態は変わらず◎\n現車確認歓迎です。来店予約はメニューからどうぞ！",
    },
    {
      name: "売約報告",
      category: "broadcast",
      messageType: "text",
      messageContent:
        "【売約御礼】\n\n【車種名】ご成約いただきました！ありがとうございます🚗\n\n「探してた車種があった」という方、仕入リクエストも受付中です。「査定」と送れば愛車の無料査定もできます。",
    },
    {
      name: "買取キャンペーン",
      category: "broadcast",
      messageType: "text",
      messageContent:
        "【買取アップキャンペーン中】\n\n他店で0円と言われた車、買います。\n下取りより専門店査定が高くなるケース多数。\n\n「査定」と送るだけで無料査定スタート！",
    },
  ];
  const existing = await api("GET", "/api/templates");
  const byName = new Set((existing ?? []).map((t) => t.name));
  for (const tpl of TEMPLATES) {
    if (byName.has(tpl.name)) {
      console.log(`  スキップ（既存）: ${tpl.name}`);
    } else {
      await api("POST", "/api/templates", tpl);
      console.log(`  作成: ${tpl.name}`);
    }
  }
}

// ---------- 7. 入口リンク（友だち追加の流入元計測 → 自動タグ） ----------
// URL形式: {WORKER_URL}/auth/line?ref={refCode}
// TikTokプロフィール・ジモティ・メルカリ等にはこのURLを貼る
async function seedEntryRoutes(tagIds) {
  console.log("── 入口リンク（流入元計測） ──");
  const ROUTES = [
    { refCode: "tiktok", name: "TikTokプロフィール", tag: "src:tiktok" },
    { refCode: "jimoty", name: "ジモティ", tag: "src:jimoty" },
    { refCode: "mercari", name: "メルカリ", tag: "src:mercari" },
    { refCode: "tenpo", name: "店頭QR", tag: "src:店頭" },
    { refCode: "intro", name: "紹介", tag: "src:紹介" },
    { refCode: "instagram", name: "Instagramプロフィール", tag: "src:instagram" },
  ];
  const existing = await api("GET", "/api/entry-routes");
  const byRef = new Set((existing ?? []).map((r) => r.refCode));
  for (const route of ROUTES) {
    if (byRef.has(route.refCode)) {
      console.log(`  スキップ（既存）: ${route.refCode}`);
    } else {
      await api("POST", "/api/entry-routes", {
        refCode: route.refCode,
        name: route.name,
        tagId: tagIds[route.tag] ?? null,
        isActive: true,
      });
      console.log(`  作成: ${route.refCode}（${route.name} → ${route.tag}）`);
    }
  }
  return ROUTES;
}

// ---------- 8. リッチメニュー（--richmenu 指定時のみ） ----------
const RICHMENU_NAME = "carshop-main-v2";

async function seedRichMenu(reservaTrackingUrl) {
  console.log("── リッチメニュー ──");
  const imagePath = join(__dirname, "richmenu", "richmenu.png");
  if (!existsSync(imagePath)) {
    console.log(`  スキップ: 画像がありません（${imagePath}）。richmenu/render.cjs で生成してください`);
    return;
  }
  const existing = await api("GET", "/api/rich-menus");
  if ((existing ?? []).some((m) => m.name === RICHMENU_NAME)) {
    console.log(`  スキップ（既存）: ${RICHMENU_NAME}`);
    return;
  }
  const menu = await api("POST", "/api/rich-menus", {
    size: { width: 2500, height: 843 },
    selected: true,
    name: RICHMENU_NAME,
    chatBarText: "メニュー",
    areas: [
      {
        bounds: { x: 0, y: 0, width: 833, height: 843 },
        action: { type: "message", text: "査定", label: "無料査定" },
      },
      {
        bounds: { x: 833, y: 0, width: 833, height: 843 },
        action: { type: "uri", uri: cfg.inventoryUrl, label: "在庫を見る" },
      },
      {
        // messageアクションで「予約」送信→自動応答Flex＋st:来店予約タグ捕捉（uri直行だとタグが取れない）
        bounds: { x: 1666, y: 0, width: 834, height: 843 },
        action: { type: "message", text: "予約", label: "来店予約" },
      },
    ],
  });
  const base64 = readFileSync(imagePath).toString("base64");
  await api("POST", `/api/rich-menus/${menu.richMenuId}/image`, {
    image: base64,
    contentType: "image/png",
  });
  await api("POST", `/api/rich-menus/${menu.richMenuId}/default`, {});
  console.log(`  作成＋画像アップロード＋デフォルト設定: ${RICHMENU_NAME}`);
}

// ---------- 実行 ----------
console.log(`LINE Harness seed 開始 → ${cfg.workerUrl}${DRY ? "（dry-run）" : ""}`);
const tagIds = await seedTags();
await seedScenario(tagIds);
const formIds = await seedForms(tagIds);
const { url: reservaTrackingUrl } = await seedTrackedLinks(tagIds);
await seedAutoReplies(formIds, reservaTrackingUrl);
await seedAutomations(tagIds);
await seedTemplates();
const routes = await seedEntryRoutes(tagIds);
if (DO_RICHMENU) {
  await seedRichMenu(reservaTrackingUrl);
} else {
  console.log("── リッチメニュー: スキップ（--richmenu を付けると投入） ──");
}
console.log("\n完了！管理画面で確認してください。");
console.log("フォームURL:");
for (const [name, id] of Object.entries(formIds)) {
  console.log(`  ${name}: ${formUrl(id)}`);
}
console.log(`来店予約リンク（RESERVA）: ${reservaTrackingUrl}`);
console.log("友だち追加URL（各媒体に貼る）:");
for (const route of routes) {
  console.log(`  ${route.name}: ${cfg.workerUrl}/auth/line?ref=${route.refCode}`);
}
