const $ = (id) => document.getElementById(id);
const FLAT = ['displayName', 'fullName', 'fullNameKana', 'location', 'email', 'phone', 'postalCode', 'address', 'businessSummary', 'selfIntroCore', 'proposedAmount', 'salesExperience', 'salesExperienceLevel'];
const AVAIL = ['hours', 'contact', 'responseTime', 'startDate'];

function toForm(p) {
  for (const k of FLAT) $(k).value = p[k] ?? '';
  for (const k of AVAIL) $(k).value = (p.availability || {})[k] ?? '';
  $('priceMin').value = (p.targetProductPrice || {}).min ?? 300000;
  $('priceMax').value = (p.targetProductPrice || {}).max ?? 1200000;
  $('canWorkDaytime').checked = p.canWorkDaytime === true;
  $('salesExperienceLevel').value = p.salesExperienceLevel || 'none';
  const ach = (p.achievements || []).map((a) => (typeof a === 'string' ? a : a.text));
  $('achievements').value = ach.join('\n');
}

function fromForm(base = {}) {
  const p = { ...base };
  for (const k of FLAT) p[k] = $(k).value.trim();
  p.targetProductPrice = {
    min: Number($('priceMin').value) || 300000,
    max: Number($('priceMax').value) || 1200000,
  };
  p.canWorkDaytime = $('canWorkDaytime').checked;
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

/**
 * 何も保存されていないときの初期値。拡張機能に同梱した profile.default.json を読む。
 * これのおかげで、入れた直後から設定なしで使える。
 */
async function loadDefault() {
  try {
    const res = await fetch(chrome.runtime.getURL('profile.default.json'));
    if (res.ok) return await res.json();
  } catch { /* 同梱ファイルが無い場合は空で始める */ }
  return {
    displayName: '', businessSummary: '', selfIntroCore: '', location: '',
    salesExperienceLevel: 'none', canWorkDaytime: false,
    targetProductPrice: { min: 300000, max: 1200000 },
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
    title: '【BtoC/オンライン完結】パーソナルジムの入会カウンセリング（アポイント支給）',
    description: '広告運用で集めた無料カウンセリングのお申し込みに対して、Zoomで商談していただきます。アポイントは弊社で用意しますので商談に集中していただけます。商材単価は50万円のコースです。未経験可、ロープレとフィードバックの時間を毎週取ります。長期で一緒にやってくださる方を探しています。',
    budget: '1商談5,000円＋成果報酬',
  };
  const out = composeApplication(job, fromForm(current));
  $('previewOut').textContent = out.text + (out.warnings.length ? `\n\n─── 直したほうがいい点 ───\n・${out.warnings.join('\n・')}` : '');
};
