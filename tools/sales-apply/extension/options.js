const $ = (id) => document.getElementById(id);
const FLAT = ['displayName', 'fullName', 'fullNameKana', 'location', 'email', 'phone', 'postalCode', 'address', 'businessSummary', 'selfIntroCore', 'minReward', 'proposedAmount'];
const AVAIL = ['hours', 'contact', 'responseTime', 'startDate'];

function toForm(p) {
  for (const k of FLAT) $(k).value = p[k] ?? '';
  for (const k of AVAIL) $(k).value = (p.availability || {})[k] ?? '';
  const ach = (p.achievements || []).map((a) => (typeof a === 'string' ? a : a.text));
  $('achievements').value = ach.join('\n');
}

function fromForm(base = {}) {
  const p = { ...base };
  for (const k of FLAT) {
    const v = $(k).value.trim();
    p[k] = k === 'minReward' ? (v ? Number(v) : 30000) : v;
  }
  p.availability = { ...(base.availability || {}) };
  for (const k of AVAIL) p.availability[k] = $(k).value.trim();

  // 実績は「タグ付き」で保存されている分のタグを保てるよう、本文一致でマージする
  const oldByText = new Map((base.achievements || [])
    .map((a) => (typeof a === 'string' ? { text: a, tags: [] } : a))
    .map((a) => [a.text, a]));
  p.achievements = $('achievements').value.split('\n').map((s) => s.trim()).filter(Boolean)
    .map((text) => oldByText.get(text) || { text, tags: [] });
  return p;
}

let current = {};

chrome.storage.local.get({ profile: null }, async ({ profile }) => {
  current = profile || (await loadDefault());
  toForm(current);
  $('json').value = JSON.stringify(current, null, 2);
});

/** 拡張機能に同梱したサンプル（リポジトリの profile.example.json 相当） */
async function loadDefault() {
  return {
    displayName: '', businessSummary: '', selfIntroCore: '', location: '', minReward: 30000,
    availability: { hours: '', contact: '', responseTime: '', startDate: '' },
    achievements: [],
  };
}

$('save').onclick = () => {
  current = fromForm(current);
  chrome.storage.local.set({ profile: current }, () => {
    $('json').value = JSON.stringify(current, null, 2);
    const missing = [];
    for (const k of AVAIL) if (!current.availability[k]) missing.push(k);
    if (!current.displayName) missing.push('displayName');
    $('msg').textContent = missing.length
      ? `保存しました。ただし未入力: ${missing.join(', ')}`
      : '保存しました。';
    $('msg').style.color = missing.length ? '#c2410c' : '#15803d';
  });
};

$('loadJson').onclick = () => {
  try {
    const p = JSON.parse($('json').value);
    current = p;
    toForm(p);
    $('msg').textContent = 'JSONをフォームに反映しました。内容を確認して「保存する」を押してください。';
    $('msg').style.color = '#15803d';
  } catch (e) {
    $('msg').textContent = `JSONが読めません: ${e.message}`;
    $('msg').style.color = '#b91c1c';
  }
};

$('dumpJson').onclick = () => {
  $('json').value = JSON.stringify(fromForm(current), null, 2);
  $('msg').textContent = 'JSON欄に出しました。';
  $('msg').style.color = '#15803d';
};

$('preview').onclick = async () => {
  const { composeApplication } = await import(chrome.runtime.getURL('core/compose.js'));
  const job = {
    id: 'sample-1',
    site: 'sample',
    title: '【長期】店舗向けサービスのインサイドセールス（在宅・未経験歓迎）',
    description: '一緒に立ち上げから携わってくれる方を探しています。お客様は地域の小さなお店が中心です。マニュアルとロープレの研修があるので未経験の方も歓迎します。長く続けてくださる方を優先します。',
    budget: '時給1,500円〜＋成果報酬',
  };
  const out = composeApplication(job, fromForm(current));
  $('previewOut').textContent = out.text + (out.warnings.length ? `\n\n─── 直したほうがいい点 ───\n・${out.warnings.join('\n・')}` : '');
};
