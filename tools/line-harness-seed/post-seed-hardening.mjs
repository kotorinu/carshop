// 逃げ穴ゼロ化: フォールバック応答・フォーム送信後メッセージ・Day3/5リンク・リッチメニューv2
import { readFileSync } from "node:fs";

const WORKER = "https://carshop-line-harness.jupitercoring.workers.dev";
const KEY = process.env.API_KEY;
const FORM_URL = "https://liff.line.me/2010502252-ahtpIdmQ?page=form&id=18557405-4f51-4fcf-9a47-173dcd1f9df8";
const RESERVA_TRACK = `${WORKER}/t/MktVwAt`;
const INVENTORY = "https://kotokoto-company-site.vercel.app/";
const RICHMENU_PNG = "C:\\Users\\jupit\\workspace\\carshop\\tools\\line-harness-seed\\richmenu\\richmenu.png";

async function api(method, path, body) {
  const res = await fetch(`${WORKER}${path}`, {
    method,
    headers: { Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || json.success === false) {
    throw new Error(`${method} ${path} -> HTTP ${res.status}: ${JSON.stringify(json).slice(0, 250)}`);
  }
  return json.data;
}

// ---- 1) フォールバック自動応答（どのキーワードにも当たらない自由メッセージ用） ----
const FALLBACK_TEXT =
  "メッセージありがとうございます😊\n" +
  "担当が確認して、営業時間内（9:00〜19:00・木曜定休）に必ずお返事します！\n\n" +
  "お急ぎの方は、下のメニュー（無料査定・在庫・来店予約）からもどうぞ👇";
console.log("1) フォールバック応答はD1直挿入で対応（APIは空keyword不可）");

// ---- 2) 査定フォーム送信後の確認メッセージ ----
const forms = await api("GET", "/api/forms");
const form = (forms ?? []).find((f) => f.name === "無料査定");
if (form) {
  await api("PUT", `/api/forms/${form.id}`, {
    onSubmitMessageType: "text",
    onSubmitMessageContent:
      "無料査定のお申込みありがとうございます🚗\n" +
      "内容を確認して、営業時間内（9:00〜19:00・木曜定休）に概算金額をお送りします！\n" +
      "※お急ぎの場合はこのトークにその旨を送ってください",
  });
  console.log("2) 査定フォームに送信後メッセージ 設定");
}

// ---- 3) Day3/Day5にCTAリンク追記 ----
const scenarios = await api("GET", "/api/scenarios");
const sc = scenarios.find((s) => s.name === "新規友だち育成（Day0-7）");
const detail = await api("GET", `/api/scenarios/${sc.id}`);
for (const s of detail.steps ?? []) {
  const order = s.stepOrder ?? s.step_order;
  const content = s.messageContent ?? "";
  if (order === 3 && !content.includes("liff.line.me")) {
    await api("PUT", `/api/scenarios/${sc.id}/steps/${s.id}`, {
      messageContent: content.replace(
        /LINEなら無料で査定シミュレーションができます。?/,
        `LINEなら30秒で無料査定できます👇\n${FORM_URL}`,
      ),
    });
    console.log("3) Day3に査定フォームリンク追記");
  }
  if (order === 4 && !content.includes("/t/")) {
    await api("PUT", `/api/scenarios/${sc.id}/steps/${s.id}`, {
      messageContent: content + `\n空き状況はこちらから👇\n${RESERVA_TRACK}`,
    });
    console.log("3) Day5に来店予約リンク追記");
  }
}

// ---- 4) リッチメニューv2: 来店予約を message「予約」に（意図タグ捕捉のため） ----
const menus = await api("GET", "/api/rich-menus");
const hasV2 = (menus ?? []).some((m) => m.name === "carshop-main-v2");
if (!hasV2) {
  const menu = await api("POST", "/api/rich-menus", {
    size: { width: 2500, height: 843 },
    selected: true,
    name: "carshop-main-v2",
    chatBarText: "メニュー",
    areas: [
      { bounds: { x: 0, y: 0, width: 833, height: 843 }, action: { type: "message", text: "査定", label: "無料査定" } },
      { bounds: { x: 833, y: 0, width: 833, height: 843 }, action: { type: "uri", uri: INVENTORY, label: "在庫を見る" } },
      { bounds: { x: 1666, y: 0, width: 834, height: 843 }, action: { type: "message", text: "予約", label: "来店予約" } },
    ],
  });
  const base64 = readFileSync(RICHMENU_PNG).toString("base64");
  await api("POST", `/api/rich-menus/${menu.richMenuId}/image`, { image: base64, contentType: "image/png" });
  await api("POST", `/api/rich-menus/${menu.richMenuId}/default`, {});
  console.log("4) リッチメニューv2 作成＋デフォルト設定（予約=タグ捕捉型）");
  // 旧v1を削除
  const v1 = (menus ?? []).find((m) => m.name === "carshop-main-v1");
  if (v1) {
    try {
      await api("DELETE", `/api/rich-menus/${v1.richMenuId ?? v1.id}`);
      console.log("   旧v1削除");
    } catch (e) {
      console.log("   旧v1削除スキップ: " + e.message.slice(0, 100));
    }
  }
} else {
  console.log("4) リッチメニューv2 既存スキップ");
}

console.log("\n全部完了");
