// 服用周期の計算(画面に依存しない純粋なロジック)
// 日付はすべて端末ローカルの 'YYYY-MM-DD' 文字列で扱う

export const pad = (n) => String(n).padStart(2, '0');
export const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const parse = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
export const addDays = (s, n) => { const d = parse(s); d.setDate(d.getDate() + n); return ymd(d); };
export const diffDays = (a, b) => { // b - a(日数)
  const [y1, m1, d1] = a.split('-').map(Number);
  const [y2, m2, d2] = b.split('-').map(Number);
  return Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 86400000);
};
export const todayStr = () => ymd(new Date());

/*
 state.settings.mode:
   'fixed'    … 決まった日数で服用→休薬を繰り返す(例: 21+7, 24+4, 28+0)
   'flexible' … 連続服用。所定日数を飲んだ後は、休薬開始日を自分で選ぶ
 state.cycles: [{ start, restStart|null, restDays|null }]  確定済みの周期(開始日順)
   固定モードでは最後の周期の後ろを自動で延長して計算する。
*/

export function expandCycles(state, until) {
  const s = state.settings;
  const out = [...(state.cycles || [])]
    .sort((a, b) => (a.start < b.start ? -1 : 1))
    .map((c) => ({ ...c }));
  if (!out.length) return out;
  for (let guard = 0; guard < 5000; guard++) {
    const last = out[out.length - 1];
    if (last.restStart == null) {
      if (s.mode !== 'fixed') break; // 連続服用は休薬日が決まるまで開いたまま
      last.restStart = addDays(last.start, s.fixed.activeDays);
      last.restDays = s.fixed.restDays;
    }
    const next = addDays(last.restStart, last.restDays || 0);
    if (next > until) break;
    out.push({ start: next, restStart: null, restDays: null, virtual: true });
  }
  return out;
}

function findIndex(cs, date) {
  let idx = -1;
  for (let i = 0; i < cs.length; i++) if (cs[i].start <= date) idx = i;
  return idx;
}

export function dayInfo(state, date) {
  const cs = expandCycles(state, date);
  const idx = findIndex(cs, date);
  if (idx < 0) return { phase: 'none' };
  const c = cs[idx];
  if (c.restStart && date >= c.restStart) {
    const k = diffDays(c.restStart, date);
    if (k < (c.restDays || 0)) {
      return { phase: 'rest', restDay: k + 1, restTotal: c.restDays, activeDays: diffDays(c.start, c.restStart), cycle: c };
    }
    return { phase: 'none' };
  }
  return { phase: 'active', day: diffDays(c.start, date) + 1, cycle: c };
}

export function isTaken(state, date) {
  return !!(state.logs && state.logs[date] && state.logs[date].taken);
}

// カレンダー用の状態: taken / missed / due / planned / rest / before / ''
export function dayStatus(state, date, today = todayStr()) {
  const info = dayInfo(state, date);
  if (info.phase === 'rest') return isTaken(state, date) ? 'taken' : 'rest';
  if (info.phase !== 'active') return isTaken(state, date) ? 'taken' : '';
  if (isTaken(state, date)) return 'taken';
  if (state.trackSince && date < state.trackSince) return 'before'; // アプリを使い始める前(未記録扱いにしない)
  if (date < today) return 'missed';
  if (date === today) return 'due';
  return 'planned';
}

// 連続服用モード: 休薬を選べるか、選べるなら休薬開始日はいつか
export function restChoice(state, today = todayStr()) {
  const s = state.settings;
  if (s.mode !== 'flexible') return null;
  const info = dayInfo(state, today);
  if (info.phase !== 'active') return null;
  const takenToday = isTaken(state, today);
  const completed = takenToday ? info.day : info.day - 1; // 飲み終えた日数
  return {
    day: info.day,
    completed,
    allowed: completed >= s.flex.minDays,
    restStart: takenToday ? addDays(today, 1) : today,
    overMax: completed >= s.flex.maxDays,
    nearMax: completed >= s.flex.maxDays - 7,
  };
}

// 休薬開始(連続服用モード)。以降の確定周期は破棄して作り直す
export function startRest(state, restStart) {
  const cs = expandCycles(state, restStart);
  const idx = findIndex(cs, restStart);
  if (idx < 0) return;
  const kept = cs.slice(0, idx).map(({ start, restStart: r, restDays }) => ({ start, restStart: r, restDays }));
  kept.push({ start: cs[idx].start, restStart, restDays: state.settings.flex.restDays });
  // 休薬明けから次の周期を確定させる
  kept.push({ start: addDays(restStart, state.settings.flex.restDays), restStart: null, restDays: null });
  state.cycles = kept;
}

// 選んだ休薬を取り消して連続服用を続ける
export function cancelRest(state, today = todayStr()) {
  const cs = (state.cycles || []).slice().sort((a, b) => (a.start < b.start ? -1 : 1));
  for (let i = cs.length - 1; i >= 0; i--) {
    const c = cs[i];
    if (c.restStart && addDays(c.restStart, c.restDays) > today && c.restStart <= addDays(today, 1)) {
      state.cycles = cs.slice(0, i).concat([{ start: c.start, restStart: null, restDays: null }]);
      return true;
    }
  }
  return false;
}

// 今日が何日目かから周期を作り直す
// where: { phase: 'active', day } または { phase: 'rest', day }
export function resetCycles(state, where, today = todayStr()) {
  const s = state.settings;
  const n = Math.max(1, Number(where.day) || 1);
  if (where.phase === 'rest') {
    const restDays = s.mode === 'fixed' ? s.fixed.restDays : s.flex.restDays;
    const restStart = addDays(today, -(n - 1));
    const activeDays = s.mode === 'fixed' ? s.fixed.activeDays : s.flex.minDays;
    state.cycles = [{ start: addDays(restStart, -activeDays), restStart, restDays }];
    if (s.mode === 'flexible') state.cycles.push({ start: addDays(restStart, restDays), restStart: null, restDays: null });
  } else {
    state.cycles = [{ start: addDays(today, -(n - 1)), restStart: null, restDays: null }];
  }
  if (s.mode === 'fixed') state.cycles = state.cycles.map((c) => ({ start: c.start, restStart: null, restDays: null })).slice(0, 1);
}

// 錠剤の残り
export function remainingPills(state) {
  const st = state.stock;
  if (!st || st.base == null) return null;
  let used = 0;
  for (const [d, l] of Object.entries(state.logs || {})) if (l.taken && d >= st.since) used++;
  return st.base - used;
}

// サーバーに渡す通知スケジュール(薬の名前や記録の中身は送らない)
export function buildSchedule(state, today = todayStr(), days = 400) {
  const restDates = [];
  const cs = state.cycles || [];
  const until = addDays(today, days);
  for (let d = today; d <= until; d = addDays(d, 1)) {
    if (dayInfo(state, d).phase !== 'active') restDates.push(d);
  }
  const first = cs.length ? cs.map((c) => c.start).sort()[0] : null;
  const takenDates = [];
  for (let i = -3; i <= 1; i++) { const d = addDays(today, i); if (isTaken(state, d)) takenDates.push(d); }
  const visitEves = (state.visits || [])
    .filter((v) => v.date >= today)
    .map((v) => addDays(v.date, -1));
  const rem = remainingPills(state);
  return {
    startDate: first,
    horizon: until,
    restDates,
    takenDates,
    visitEves,
    lowStock: rem != null && rem <= state.settings.lowStockAt,
  };
}
