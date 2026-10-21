// 端末内の保存(記録はこの端末の外には出さない)
const KEY = 'nomulog:v1';

export function defaultState() {
  return {
    version: 1,
    settings: {
      medName: '',
      mode: 'flexible',   // 休薬は利用者が決める
      fixed: { activeDays: 21, restDays: 7 },
      flex: { minDays: 24, maxDays: 120, restDays: 4 },
      time: '21:00',
      repeatMin: 30,      // 未記録のとき何分おきに再通知するか(0=しない)
      repeatCount: 3,     // 再通知の最大回数
      remindEvenIfTaken: false, // 先に記録した日も時刻に通知するか
      sheetSize: 28,
      lowStockAt: 7,
      missedNote: '',     // 飲み忘れたときの対処(添付文書や医師の指示を自分でメモ)
      lockHash: null,
      lockSalt: null,
    },
    cycles: [],
    logs: {},     // 'YYYY-MM-DD': { taken: true, at: 'HH:MM' }
    memos: {},    // 'YYYY-MM-DD': 'テキスト'
    visits: [],   // { id, date, time, note }
    clinic: { name: '', phone: '' },
    stock: null,  // { base, since }
    push: { enabled: false },
    sheet: null,        // 錠剤シートの起点 { since, used }
    sheetPrepAck: {},   // 「次のシート準備した」を押したシート
    trackSince: null, // アプリで記録を始めた日(これより前は「未記録」にしない)
  };
}

function merge(def, val) {
  if (val == null || typeof def !== 'object' || Array.isArray(def) || def === null) return val ?? def;
  const out = { ...def };
  for (const k of Object.keys(val)) out[k] = (k in def) ? merge(def[k], val[k]) : val[k];
  return out;
}

export function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return defaultState();
    return migrate(merge(defaultState(), JSON.parse(raw)));
  } catch (e) {
    console.warn('load failed', e);
    return defaultState();
  }
}

// 旧版(休薬日が固定のパターン)からの移行: 休薬は利用者が決める方式にそろえる
function migrate(st) {
  if (st.settings.mode !== 'flexible') {
    st.settings.mode = 'flexible';
    st.cycles = (st.cycles || []).slice(-1).map((c) => ({ start: c.start, restStart: null, restDays: null }));
  }
  return st;
}

export function save(state) {
  try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) { console.warn('save failed', e); }
}

export function importJSON(text) {
  const data = JSON.parse(text);
  if (!data || typeof data !== 'object' || !data.settings || !Array.isArray(data.cycles)) {
    throw new Error('このファイルは のむログ のバックアップではないようです');
  }
  return migrate(merge(defaultState(), data));
}

export async function hashPin(pin, salt) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(salt + ':' + pin));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

// ホーム画面アプリのデータを消されにくくする
export async function requestPersist() {
  try { if (navigator.storage && navigator.storage.persist) await navigator.storage.persist(); } catch (_) {}
}
