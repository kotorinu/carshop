// ウェルカムファネル妥協なし版: Day0=hero付きFlex、自動応答4種をボタン付きFlexに、購入相談ルート追加
const WORKER = "https://carshop-line-harness.jupitercoring.workers.dev";
const KEY = process.env.API_KEY;
const HERO = "https://carshop-line-harness.jupitercoring.workers.dev/images/64f15828-4997-4970-a392-587f9356269d.png";
const RESERVA_TRACK = `${WORKER}/t/MktVwAt`;
const FORM_URL = "https://liff.line.me/2010502252-ahtpIdmQ?page=form&id=18557405-4f51-4fcf-9a47-173dcd1f9df8";
const INVENTORY = "https://kotokoto-company-site.vercel.app/";
const NAVY = "#122a52";

async function api(method, path, body) {
  const res = await fetch(`${WORKER}${path}`, {
    method,
    headers: { Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || json.success === false) {
    throw new Error(`${method} ${path} -> HTTP ${res.status}: ${JSON.stringify(json).slice(0, 300)}`);
  }
  return json.data;
}

const btn = (label, action) => ({
  type: "button", style: "primary", color: NAVY, height: "sm", action,
});
const msgBtn = (label, text) => btn(label, { type: "message", label, text });
const uriBtn = (label, uri) => btn(label, { type: "uri", label, uri });

// ---- Day0: hero付きウェルカムカード ----
const day0Flex = {
  type: "bubble",
  hero: { type: "image", url: HERO, size: "full", aspectRatio: "20:13", aspectMode: "cover" },
  body: {
    type: "box", layout: "vertical", spacing: "md",
    contents: [
      {
        type: "text",
        text: "SNSで「本当にいい一台」と「高く売りたい方」を直接つないでいます。傷も弱点も正直に伝えるのがモットーです。",
        size: "sm", color: "#555555", wrap: true,
      },
      { type: "text", text: "ご用件を選んでください👇", weight: "bold", size: "md", margin: "sm" },
    ],
  },
  footer: {
    type: "box", layout: "vertical", spacing: "sm",
    contents: [
      msgBtn("🚗 車を探している", "購入相談"),
      msgBtn("💰 車を売りたい（無料査定）", "査定"),
      msgBtn("📅 お店に行ってみたい", "予約"),
      { type: "text", text: "ふつうにメッセージを送ってもOKです😊", size: "xs", color: "#999999", align: "center", margin: "md" },
    ],
  },
};

// ---- 自動応答Flex ----
const shopBox = {
  type: "box", layout: "vertical", spacing: "xs", margin: "md",
  contents: [
    { type: "text", text: "株式会社Jupiter Coring 大阪支店", size: "xs", color: "#888888", wrap: true },
    { type: "text", text: "大阪府寝屋川市黒原橘町4-1", size: "xs", color: "#888888", wrap: true },
    { type: "text", text: "9:00〜19:00（木曜定休）", size: "xs", color: "#888888" },
  ],
};

const REPLY_FLEX = {
  査定: {
    type: "bubble",
    body: {
      type: "box", layout: "vertical", spacing: "md",
      contents: [
        { type: "text", text: "無料査定、30秒で完了🚗", weight: "bold", size: "lg", wrap: true },
        {
          type: "text",
          text: "フォームに入力するだけで概算をお返しします。\n\nお急ぎの方は、このトークに「車種・年式・走行距離」を送っていただければ、そのまま概算をお出しします！",
          size: "sm", color: "#555555", wrap: true,
        },
      ],
    },
    footer: {
      type: "box", layout: "vertical", spacing: "sm",
      contents: [uriBtn("30秒査定フォームを開く", FORM_URL)],
    },
  },
  購入相談: {
    type: "bubble",
    body: {
      type: "box", layout: "vertical", spacing: "md",
      contents: [
        { type: "text", text: "ありがとうございます🚗", weight: "bold", size: "lg" },
        {
          type: "text",
          text: "「こんな車を探してる」「予算◯◯万円くらい」と返信いただければ、在庫に無い車もオークションからお探しできます！\n\nまずは今の在庫をどうぞ👇",
          size: "sm", color: "#555555", wrap: true,
        },
      ],
    },
    footer: {
      type: "box", layout: "vertical", spacing: "sm",
      contents: [uriBtn("今の在庫を見る", INVENTORY)],
    },
  },
  予約: {
    type: "bubble",
    body: {
      type: "box", layout: "vertical", spacing: "md",
      contents: [
        { type: "text", text: "ご来店お待ちしています📅", weight: "bold", size: "lg" },
        {
          type: "text",
          text: "空き状況を見て、そのままネット予約できます👇\n現車確認だけでも大歓迎です。",
          size: "sm", color: "#555555", wrap: true,
        },
        shopBox,
      ],
    },
    footer: {
      type: "box", layout: "vertical", spacing: "sm",
      contents: [uriBtn("空き状況を見て予約する", RESERVA_TRACK)],
    },
  },
};
REPLY_FLEX["来店"] = REPLY_FLEX["予約"];

// ---- 1) シナリオ: Day0差し替え＋番号除去 ----
const scenarios = await api("GET", "/api/scenarios");
const sc = scenarios.find((s) => s.name === "新規友だち育成（Day0-7）");
if (!sc) throw new Error("シナリオが見つかりません");
const detail = await api("GET", `/api/scenarios/${sc.id}`);
const steps = detail.steps ?? [];
console.log(`シナリオ: ${sc.name} / steps=${steps.length}`);
for (const s of steps) {
  const order = s.stepOrder ?? s.step_order;
  if (order === 1) {
    await api("PUT", `/api/scenarios/${sc.id}/steps/${s.id}`, {
      messageType: "flex",
      messageContent: JSON.stringify(day0Flex),
    });
    console.log("  Day0 -> hero付きFlexに更新");
  } else {
    const content = s.messageContent ?? s.message_content ?? "";
    const stripped = content.replace(/^【\d+\/\d+】/, "");
    if (stripped !== content) {
      await api("PUT", `/api/scenarios/${sc.id}/steps/${s.id}`, { messageContent: stripped });
      console.log(`  step${order}: 【n/5】番号を除去`);
    }
  }
}

// ---- 2) 自動応答: 査定/予約/来店をFlexへ更新、購入相談を新規作成 ----
const replies = await api("GET", "/api/auto-replies");
for (const [keyword, flex] of Object.entries(REPLY_FLEX)) {
  const existing = (replies ?? []).find((r) => r.keyword === keyword);
  const payload = {
    keyword,
    matchType: "contains",
    responseType: "flex",
    responseContent: JSON.stringify(flex),
  };
  if (existing) {
    await api("PUT", `/api/auto-replies/${existing.id}`, payload);
    console.log(`自動応答「${keyword}」-> Flexに更新`);
  } else {
    await api("POST", "/api/auto-replies", payload);
    console.log(`自動応答「${keyword}」-> Flexで新規作成`);
  }
}

// ---- 3) 自動化: 購入相談 -> int:購入 ----
const tags = await api("GET", "/api/tags");
const buyTag = tags.find((t) => t.name === "int:購入");
const autos = await api("GET", "/api/automations");
if (!(autos ?? []).some((a) => a.name === "「購入相談」でint:購入タグ")) {
  await api("POST", "/api/automations", {
    name: "「購入相談」でint:購入タグ",
    eventType: "message_received",
    conditions: { keyword: "購入相談" },
    actions: [{ type: "add_tag", params: { tagId: buyTag.id } }],
  });
  console.log("自動化「購入相談→int:購入」作成");
} else {
  console.log("自動化 既存スキップ");
}

console.log("\n完了");
