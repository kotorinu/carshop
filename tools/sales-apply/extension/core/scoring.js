/**
 * 案件の採点。判断基準の正本は tools/sales-apply/案件選定ルール.md（実践活動FAQ）。
 *
 * チェックリスト（この6つ＋媒体で判断する）
 *   営業対象   BtoC ◯ / BtoB ×（原則）
 *   商材の種類 無形 ◯ / 有形 ×
 *   商材単価   30万〜120万 ◯ / 10万以下 ×
 *   アポイント 譲渡型 ◯ / 自己獲得型 ×
 *   営業スタイル オンライン完結 ◯ / 現場訪問必須 ×
 *   対象顧客   一般成人 ◯ / 子ども・学生向け ×
 *   媒体       クラウドワークスは使用禁止
 *
 * 募集文に書いていない項目は「不明」にして、面接で聞くことリストに回す。
 * 「完璧な案件を見つけてから応募する」のではなく「まず動く」ためのバランスにしてある。
 */

/** 使ってはいけない媒体 */
export const BANNED_SITES = {
  crowdworks: 'クラウドワークスは使用禁止（実践活動ルール）。他の媒体で探してください。',
};

/** 応募してはいけない／地雷の匂いがする案件 */
export const RED_FLAGS = [
  [/初期費用|登録料|研修費|教材費|参加費|保証金/, '費用の負担を求めている（詐欺・情報商材の定番）'],
  [/情報商材|副業スクール|投資案件|バイナリー|ネットワークビジネス|MLM|アムウェイ|権利収入/, '商材が危険'],
  [/(LINE|ライン|Telegram|テレグラム)(で|に)?(登録|追加).{0,12}(詳細|説明|お伝え)/, '外部へ誘導してから詳細を出す型（規約違反・詐欺が多い）'],
  [/身分証.{0,10}(すぐ|先に|事前に)/, '着手前に身分証を求めている'],
  [/口座|銀行.{0,6}(貸し|レンタル|名義)/, '口座の貸し借り（犯罪）'],
  [/仮想通貨|暗号資産.{0,10}(勧誘|販売|紹介)/, '暗号資産の勧誘'],
  [/スクールに(入|加入)|一緒に活動しませんか|コミュニティに(参加|加入)/, '別スクール・組織への勧誘の可能性 → 運営に相談してから判断'],
];

/* ---------- 判定用の言葉 ---------- */
const RE = {
  btoc: /BtoC|B2C|toC向け|個人(の)?(お客様|お客さま|向け|宅|顧客)|一般個人|コンシューマ|受講(生|希望|検討)|会員(募集|様)|エンドユーザー/i,
  btob: /BtoB|B2B|toB向け|法人(営業|向け|様|開拓|顧客)|企業(向け|様|担当者|開拓)|中小企業|店舗(オーナー|経営者)(様)?(向け|へ)|代表者様/i,

  intangible: /無形商材|スクール|講座|コーチング|コンサル(ティング)?|ジム|パーソナルトレーニング|フィットネス|英会話|語学|結婚相談所|婚活|サブスク|SaaS|オンラインサロン|セミナー|教育サービス|転職支援|キャリア支援|美容(医療|クリニック)|エステ|脱毛|会員制サービス|プログラミングスクール|動画編集スクール/,
  tangible: /有形商材|物販|商品販売|アパレル|洋服|食品|飲食物|家電|中古車|自動車|新車|時計|宝石|貴金属|不動産|マンション|戸建|太陽光|住宅|リフォーム|家具|通信機器|ウォーターサーバー/,

  handover: /アポイント(は)?(こちら|弊社|当社|会社)(側)?(で|が)?(用意|供給|提供|支給|獲得)|アポ(イント)?(の)?(支給|供給|提供|譲渡|固定|お渡し)|商談(のみ|に専念|に集中|だけ)|反響営業|インバウンド|問い合わせ(のあった|いただいた|ベース)|広告(運用)?(から|経由)(の)?(問い合わせ|反響|リード)|集客は(弊社|当社|会社|こちら)/,
  selfGet: /アポ(イント)?(は)?(ご)?自(身|分)(で|が)|自分でアポ|新規開拓|飛び込み|交流会|人脈(を活かし|から)|セルフアポ|集客から(お願い|担当)|リード獲得から/,

  online: /オンライン(完結|商談|面談|営業)|zoom|ズーム|google\s*meet|リモート|在宅|フルリモート|web(面談|商談)/i,
  onsite: /訪問(営業|必須)|対面(での)?(商談|面談|営業)|来社|常駐|出社(必須)?|現地(に|へ)|店舗(に|へ)(伺|訪問)|フィールドセールス|ラウンダー/,

  minors: /学習塾|進学塾|家庭教師|受験|中学生|高校生|小学生|児童|生徒(募集|様)|保護者|こども|子ども|子供|キッズ|学生向け/,

  teleapoOnly: /テレアポ(のみ|専門|業務のみ)|架電(のみ|業務のみ)|コール(のみ|専門|センター)/,
  hasMeeting: /商談|クロージング|面談|相談会|カウンセリング/,

  adLead: /広告(運用|費)|リスティング|Meta広告|SNS運用|インスタ(グラム)?運用|TikTok運用|YouTube(運用|広告)/,
  lineLead: /LINE(公式)?(リスト|配信|@)|ステップ配信|メルマガ配信/,

  newbieOk: /未経験(可|歓迎|OK|でも)|初心者(可|歓迎|OK)|研修(あり|制度)|マニュアル(あり|完備)|ロープレ|同行|フィードバック|1on1/i,
  longTerm: /長期|継続|安定|コアメンバー|正社員登用|3ヶ月以上|半年以上/,
};

/** 「30万〜120万」「単価50万円」などから商材単価を拾う（円） */
export function parseProductPrice(text) {
  const s = String(text || '').replace(/[,，]/g, '');
  const near = s.match(/(?:商材|商品|サービス|受注|契約|客)?単価[^\n]{0,16}?(\d+(?:\.\d+)?)\s*万/)
    || s.match(/(\d+(?:\.\d+)?)\s*万円?(?:の|前後の)?(?:商材|サービス|講座|コース|プラン)/);
  if (near) return Math.round(parseFloat(near[1]) * 10000);
  return null;
}

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

/* ---------- チェックリスト ---------- */

/** 1項目の判定を作る小道具 */
const item = (key, label, status, detail, points, ask) => ({ key, label, status, detail, points, ask });

/**
 * 案件をチェックリストで評価する。
 * status: 'ok'（推奨条件に合う）/ 'ng'（避けるべき）/ 'warn'（注意）/ 'unknown'（募集文に書いていない）
 */
export function evaluateJob(job, profile = {}) {
  const text = `${job.title || ''}\n${job.description || ''}\n${job.budget || ''}`;
  const checklist = [];
  const canDaytime = profile.canWorkDaytime === true;   // 日中に動けるならBtoBも可

  // 1. 営業対象
  if (RE.btoc.test(text) && !RE.btob.test(text)) {
    checklist.push(item('target', '営業対象', 'ok', 'BtoC（個人向け）', 20));
  } else if (RE.btob.test(text) && !RE.btoc.test(text)) {
    checklist.push(canDaytime
      ? item('target', '営業対象', 'warn', 'BtoB（日中に動けるので可）', -5)
      : item('target', '営業対象', 'ng', 'BtoB（日中は本業があるため原則NG）', -35));
  } else if (RE.btoc.test(text) && RE.btob.test(text)) {
    checklist.push(item('target', '営業対象', 'warn', 'BtoC・BtoBの両方が出てくる', 0, 'BtoCの商談だけを担当できますか？'));
  } else {
    checklist.push(item('target', '営業対象', 'unknown', '募集文に記載なし', -5, 'お客様は個人の方ですか、法人ですか？'));
  }

  // 2. 商材の種類
  if (RE.intangible.test(text) && !RE.tangible.test(text)) {
    checklist.push(item('product', '商材の種類', 'ok', '無形商材（サービス・情報）', 18));
  } else if (RE.tangible.test(text)) {
    checklist.push(item('product', '商材の種類', 'ng', '有形商材（単価が安い／現場に行く必要が出る）', -35));
  } else {
    checklist.push(item('product', '商材の種類', 'unknown', '募集文に記載なし', -5, '商材は形のあるモノですか、サービスですか？'));
  }

  // 3. 商材単価（推奨 30万〜120万）
  const price = parseProductPrice(text);
  if (price == null) {
    checklist.push(item('price', '商材単価', 'unknown', '募集文に記載なし', -3, '商材の単価はいくらくらいですか？'));
  } else if (price >= 300000 && price <= 1200000) {
    checklist.push(item('price', '商材単価', 'ok', `${price / 10000}万円（推奨レンジ）`, 18));
  } else if (price > 1200000) {
    checklist.push(item('price', '商材単価', 'warn', `${price / 10000}万円（高単価・難易度は上がる）`, 4));
  } else if (price >= 100000) {
    checklist.push(item('price', '商材単価', 'warn', `${price / 10000}万円（推奨レンジ未満だが経験にはなる）`, 2));
  } else {
    checklist.push(item('price', '商材単価', 'ng', `${price / 10000}万円（10万円以下・報酬が数千円になりがち）`, -18));
  }

  // 4. アポイント（最重要）
  if (RE.handover.test(text) && !RE.selfGet.test(text)) {
    checklist.push(item('appointment', 'アポイント', 'ok', '譲渡型（会社が集客してくれる）', 22));
  } else if (RE.selfGet.test(text) && !RE.handover.test(text)) {
    checklist.push(item('appointment', 'アポイント', 'ng', '自己獲得型（アポ取りから自分・今の段階では難易度が高い）', -30));
  } else if (RE.handover.test(text) && RE.selfGet.test(text)) {
    checklist.push(item('appointment', 'アポイント', 'warn', '譲渡＋自己獲得の両方（譲渡が主ならむしろ最上級）', 8,
      'アポイントはどのような方法で獲得されていますか？'));
  } else {
    checklist.push(item('appointment', 'アポイント', 'unknown', '募集文に記載なし（面接で必ず聞く）', -8,
      'アポイントはどのような方法で獲得されていますか？'));
  }

  // 5. 営業スタイル
  if (RE.onsite.test(text)) {
    checklist.push(item('style', '営業スタイル', 'ng', '現場訪問・出社が必要', -30));
  } else if (RE.online.test(text)) {
    checklist.push(item('style', '営業スタイル', 'ok', 'オンライン完結（Zoom等）', 12));
  } else {
    checklist.push(item('style', '営業スタイル', 'unknown', '募集文に記載なし', -3, '商談はオンラインで完結しますか？'));
  }

  // 6. 対象顧客
  if (RE.minors.test(text)) {
    checklist.push(item('customer', '対象顧客', 'ng', '子ども・学生向け（狙って探すのはNG）', -25));
  } else {
    checklist.push(item('customer', '対象顧客', 'ok', '一般成人', 0));
  }

  return checklist;
}

/**
 * 案件を採点する。
 * @returns {{score, verdict, redFlags, banned, checklist, reasons, askInInterview}}
 */
export function scoreJob(job, profile = {}) {
  const text = `${job.title || ''}\n${job.description || ''}\n${job.budget || ''}`;
  const reasons = [];
  const redFlags = [];

  // 禁止媒体は問答無用
  const banned = BANNED_SITES[job.site] || null;   // redFlags には入れない（UIで別枠に出す）
  for (const [re, why] of RED_FLAGS) if (re.test(text)) redFlags.push(why);

  const checklist = evaluateJob(job, profile);
  let score = 50;
  for (const c of checklist) {
    score += c.points;
    if (c.points) reasons.push(`${c.points > 0 ? '+' : ''}${c.points} ${c.label}: ${c.detail}`);
  }

  // 集客方法の質（アポの安定度に直結する）
  if (RE.adLead.test(text)) { score += 10; reasons.push('+10 広告・SNS運用で集客（アポ供給が安定しやすい）'); }
  else if (RE.lineLead.test(text)) { score += 6; reasons.push('+6 LINEリスト配信で集客'); }

  // テレアポのみは狙って探さない
  if (RE.teleapoOnly.test(text) && !RE.hasMeeting.test(text)) {
    score -= 12; reasons.push('-12 テレアポのみ（狙って探すのはNG。含まれるだけなら可）');
  }

  // 入りやすさ・続けやすさ
  if (RE.newbieOk.test(text)) { score += 8; reasons.push('+8 未経験可・研修やフィードバックあり'); }
  if (RE.longTerm.test(text)) { score += 6; reasons.push('+6 長期前提'); }

  // 競合の少なさ
  if (typeof job.applicants === 'number') {
    if (job.applicants <= 3) { score += 10; reasons.push('+10 応募者が少ない（今なら目立つ）'); }
    else if (job.applicants >= 15) { score -= 8; reasons.push('-8 応募者が多い（埋もれる）'); }
  }

  // 募集文の熱量
  const len = String(job.description || '').length;
  if (len >= 400) { score += 6; reasons.push('+6 募集文が丁寧（本気の発注者）'); }
  else if (len > 0 && len < 120) { score -= 6; reasons.push('-6 募集文が薄い'); }

  if (job.clientVerified) { score += 6; reasons.push('+6 本人確認済みの発注者'); }

  score = Math.max(0, Math.min(100, Math.round(score)));

  const hardNg = checklist.filter((c) => c.status === 'ng');
  const verdict = banned ? 'banned'
    : redFlags.length ? 'skip'
      : hardNg.length >= 2 ? 'skip'
        : score >= 70 ? 'apply'
          : score >= 50 ? 'maybe' : 'skip';

  // 募集文でわからなかったことは面接で聞く
  const askInInterview = [
    ...checklist.filter((c) => c.ask).map((c) => c.ask),
    'アポイントはどのような方法で獲得されていますか？',
  ].filter((v, i, a) => a.indexOf(v) === i);

  return { score, verdict, redFlags, banned, checklist, reasons, askInInterview, ngItems: hardNg.map((c) => `${c.label}: ${c.detail}`) };
}

/** 一覧をおすすめ順に並べ替える。禁止・地雷は後ろに落とす */
export function rankJobs(jobs, profile) {
  return jobs
    .map((j) => ({ ...j, ...scoreJob(j, profile) }))
    .sort((a, b) => {
      const bad = (j) => (j.banned ? 2 : j.redFlags.length ? 1 : 0);
      if (bad(a) !== bad(b)) return bad(a) - bad(b);
      return b.score - a.score;
    });
}
