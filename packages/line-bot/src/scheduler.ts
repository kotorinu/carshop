/**
 * ステップ配信ランナー(cron想定: 1日1回など)。
 * 友だち追加からの経過日数に応じて未送信ステップを push する。
 * 配信停止(stage=unsubscribed)は除外。無料枠を守るため通数は最小限。
 *
 * 実運用: Railwayのcron や node-cron で日次実行。送信済み管理は store に persist。
 */
import { messagingApi } from "@line/bot-sdk";
import { allLeads, upsertLead, getLead } from "./store.js";
import { STEPS } from "./flows/steps.js";

const client = new messagingApi.MessagingApiClient({
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN ?? "",
});

function daysSince(iso: string): number {
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
}

/** lead.stage に "sent:<stepId>" を載せて送信済みを管理(簡易) */
function sentSteps(stage: string): Set<string> {
  return new Set(stage.split("|").filter((s) => s.startsWith("sent:")).map((s) => s.slice(5)));
}

export async function runStepDelivery(dryRun = false): Promise<number> {
  let sent = 0;
  for (const lead of allLeads()) {
    if (lead.stage.startsWith("unsubscribed")) continue;
    const elapsed = daysSince(lead.addedAt);
    const already = sentSteps(lead.stage);
    for (const step of STEPS) {
      if (step.day > elapsed || already.has(step.id)) continue;
      if (!dryRun) {
        await client.pushMessage({ to: lead.lineUserId, messages: step.build(lead) });
        const cur = getLead(lead.lineUserId);
        const base = (cur?.stage ?? lead.stage).replace(/\|?sent:[^|]*/g, (m) => m); // keep
        upsertLead(lead.lineUserId, { stage: `${base}|sent:${step.id}` });
      }
      console.log(`${dryRun ? "[dry]" : "[send]"} ${lead.lineUserId} ← ${step.id}`);
      sent++;
    }
  }
  console.log(`ステップ配信: ${sent}通${dryRun ? "(dry-run)" : ""}`);
  return sent;
}

const isMain = process.argv[1]?.endsWith("scheduler.ts");
if (isMain) {
  runStepDelivery(process.argv.includes("--dry")).catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
