/**
 * 案件のスコアリングと危険案件フィルタ。
 * 「1件ずつ自分で調べる」をやめるための頭脳。上から順に応募すればいい状態にする。
 */

/** 応募してはいけない／地雷の匂いがする案件のパターン */
export const RED_FLAGS = [
  [/初期費用|登録料|研修費|教材費|参加費|保証金/, '費用の負担を求めている（詐欺・情報商材の定番）'],
  [/完全出来高.*(単価|報酬)?\s*(なし|0円)|報酬は成果のみ|固定報酬なし/, '完全出来高で固定なし（時間だけ取られやすい）'],
  [/情報商材|副業スクール|投資案件|バイナリー|ネットワークビジネス|MLM|アムウェイ|権利収入/, '商材が危険'],
  [/(LINE|ライン|Telegram|テレグラム)(で|に)?(登録|追加).{0,12}(詳細|説明|お伝え)/, '外部へ誘導してから詳細を出す型（規約違反・詐欺が多い）'],
  [/身分証.{0,10}(すぐ|先に|事前に)/, '着手前に身分証を求めている'],
  [/口座|銀行.{0,6}(貸し|レンタル|名義)/, '口座の貸し借り（犯罪）'],
  [/仮想通貨|暗号資産.{0,10}(勧誘|販売|紹介)/, '暗号資産の勧誘'],
];

/** 相性がいいキーワード（琴音さんの持ち味が効く領域） */
export const PLUS_KEYWORDS = [
  [/中古車|自動車|カーディーラー|車販売|整備工場/, 18, '自動車業界＝本業ドンピシャ'],
  [/店舗|実店舗|美容室|飲食|工務店|整体|サロン|地域/, 12, '店舗向け＝本業と同じ相手'],
  [/LINE|公式アカウント|Lステップ|MEO|SNS|Instagram|TikTok/, 12, 'LINE・SNS＝実装経験あり'],
  [/AI|自動化|DX|業務効率|ノーコード|SaaS|ツール導入/, 10, 'AI・自動化＝説明できる領域'],
  [/未経験(可|歓迎|OK)|初心者(可|歓迎|OK)|研修|マニュアル|同行/, 10, '未経験可・教育あり＝入りやすい'],
  [/長期|継続|安定|コアメンバー|正社員登用/, 8, '長期前提＝スキルが積み上がる'],
  [/在宅|リモート|フルリモート|オンライン完結/, 8, '在宅可'],
  [/フィードバック|振り返り|1on1|ロープレ/, 8, '営業スキルが伸びる環境'],
];

/** 相性が悪いキーワード */
export const MINUS_KEYWORDS = [
  [/常駐|出社必須|東京(勤務|在住)|首都圏(のみ|限定)|関東(のみ|限定)/, -18, '出社・エリア条件が合わない'],
  [/(週|1日).{0,4}(40|8)時間以上|フルタイム必須/, -12, '稼働量が重い'],
  [/保険|証券|不動産投資|太陽光/, -10, '重規制・重商材（初回には重い）'],
  [/英語|中国語|バイリンガル/, -10, '語学要件'],
  [/法人格必須|インボイス登録必須/, -6, '条件に要確認事項あり'],
];

/** 報酬テキストから最低額をざっくり数値化（円） */
export function parseReward(text) {
  const s = String(text || '').replace(/[,，]/g, '');
  if (!s) return null;
  const man = s.match(/(\d+(?:\.\d+)?)\s*万/);
  if (man) return Math.round(parseFloat(man[1]) * 10000);
  const yen = s.match(/(\d{3,})\s*円/);
  if (yen) return parseInt(yen[1], 10);
  return null;
}

/**
 * 案件を採点する。
 * @returns {{score:number, reasons:string[], redFlags:string[], verdict:'apply'|'maybe'|'skip'}}
 */
export function scoreJob(job, profile = {}) {
  const text = `${job.title || ''}\n${job.description || ''}\n${job.budget || ''}`;
  const reasons = [];
  const redFlags = [];
  let score = 50;

  for (const [re, why] of RED_FLAGS) if (re.test(text)) redFlags.push(why);

  for (const [re, pts, why] of PLUS_KEYWORDS) {
    if (re.test(text)) { score += pts; reasons.push(`+${pts} ${why}`); }
  }
  for (const [re, pts, why] of MINUS_KEYWORDS) {
    if (re.test(text)) { score += pts; reasons.push(`${pts} ${why}`); }
  }

  // 報酬
  const minReward = parseReward(job.budget) ?? parseReward(text);
  const floor = profile.minReward ?? 30000;
  if (minReward != null) {
    if (minReward >= floor * 3) { score += 12; reasons.push('+12 報酬が十分'); }
    else if (minReward >= floor) { score += 6; reasons.push('+6 報酬は許容範囲'); }
    else { score -= 15; reasons.push(`-15 報酬が希望下限(${floor}円)を下回る`); }
  } else {
    reasons.push('±0 報酬の記載を読み取れず（要確認）');
  }

  // 競合の少なさ
  if (typeof job.applicants === 'number') {
    if (job.applicants <= 3) { score += 12; reasons.push('+12 応募者が少ない（今なら目立つ）'); }
    else if (job.applicants >= 15) { score -= 10; reasons.push('-10 応募者が多い（埋もれる）'); }
  }

  // 募集文の熱量（コピペ募集は返信も来ない）
  const len = String(job.description || '').length;
  if (len >= 400) { score += 6; reasons.push('+6 募集文が丁寧（本気の発注者）'); }
  else if (len > 0 && len < 120) { score -= 8; reasons.push('-8 募集文が薄い（返信率が低い傾向）'); }

  // 本人確認・実績のある発注者
  if (job.clientVerified) { score += 8; reasons.push('+8 本人確認済みの発注者'); }

  score = Math.max(0, Math.min(100, Math.round(score)));
  const verdict = redFlags.length ? 'skip' : score >= 65 ? 'apply' : score >= 45 ? 'maybe' : 'skip';
  return { score, reasons, redFlags, verdict };
}

/** 一覧をスコア順に並べ替え、地雷を後ろに落とす */
export function rankJobs(jobs, profile) {
  return jobs
    .map((j) => ({ ...j, ...scoreJob(j, profile) }))
    .sort((a, b) => {
      if (a.redFlags.length !== b.redFlags.length) return a.redFlags.length - b.redFlags.length;
      return b.score - a.score;
    });
}
