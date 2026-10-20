import * as C from './cycle.js';
import { load, save, defaultState, importJSON, hashPin, requestPersist } from './store.js';
import * as Push from './push.js';

const APP_VERSION = '1.0.0';
const $ = (s, r = document) => r.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const WD = '日月火水木金土';
const fmt = (s, withWd = true) => { const d = C.parse(s); return `${d.getMonth() + 1}月${d.getDate()}日${withWd ? `(${WD[d.getDay()]})` : ''}`; };
const fmtShort = (s) => { const d = C.parse(s); return `${d.getMonth() + 1}/${d.getDate()}(${WD[d.getDay()]})`; };
const nowHM = () => { const d = new Date(); return `${C.pad(d.getHours())}:${C.pad(d.getMinutes())}`; };

let state = load();
let tab = 'today';
let calMonth = C.todayStr().slice(0, 7);

// ---------- 保存・同期 ----------
let syncTimer = null;
function commit(opts = {}) {
  save(state);
  if (!opts.silent) render();
  if (state.push.enabled) {
    clearTimeout(syncTimer);
    syncTimer = setTimeout(syncPush, 600);
  }
}
function pushPayload() {
  const s = state.settings;
  return { time: s.time, repeatMin: Number(s.repeatMin), repeatCount: Number(s.repeatCount), ...C.buildSchedule(state) };
}
async function syncPush() {
  if (!state.push.enabled || !Push.isConfigured()) return;
  try { await Push.sync({ ...pushPayload(), enabled: true }); state.push.lastSync = new Date().toISOString(); save(state); }
  catch (e) { console.warn('sync failed', e); }
}

function toast(msg) {
  const t = $('#toast');
  t.textContent = msg; t.hidden = false;
  clearTimeout(toast.t); toast.t = setTimeout(() => { t.hidden = true; }, 2600);
}

// ---------- モーダル ----------
function openModal(html, onMount) {
  $('#modal-body').innerHTML = html;
  $('#modal').hidden = false;
  document.body.classList.add('noscroll');
  onMount && onMount($('#modal-body'));
}
function closeModal() { $('#modal').hidden = true; document.body.classList.remove('noscroll'); $('#modal-body').innerHTML = ''; }
$('#modal').addEventListener('click', (e) => { if (e.target.closest('[data-close]')) closeModal(); });

function confirmBox(title, body, okLabel, onOk, danger = false) {
  openModal(`
    <h2 class="sheet-title">${esc(title)}</h2>
    <p class="sheet-text">${body}</p>
    <div class="btn-row">
      <button class="btn ghost" data-close>やめる</button>
      <button class="btn ${danger ? 'danger' : 'primary'}" id="ok">${esc(okLabel)}</button>
    </div>`, (m) => { $('#ok', m).onclick = () => { closeModal(); onOk(); }; });
}

// ---------- 記録の操作 ----------
function setTaken(date, taken, at) {
  if (taken) state.logs[date] = { taken: true, at: at || nowHM() };
  else delete state.logs[date];
}

// ---------- 画面: 今日 ----------
function phaseLabel(info) {
  const s = state.settings;
  if (info.phase === 'rest') return { big: `休薬 ${info.restDay}日目`, sub: `${info.restTotal}日間のうち`, cls: 'rest' };
  if (info.phase !== 'active') return { big: 'まだ始まっていません', sub: '', cls: 'none' };
  if (s.mode === 'fixed') return { big: `服用 ${info.day}日目`, sub: `${s.fixed.activeDays}日間のうち`, cls: 'active' };
  return { big: `連続服用 ${info.day}日目`, sub: '休薬日は自分で選ぶ設定', cls: 'active' };
}

function sheetGrid(today) {
  const s = state.settings;
  const info = C.dayInfo(state, today);
  if (info.phase === 'none') return '';
  const c = info.cycle;
  let start, length, title;
  if (s.mode === 'fixed') {
    start = c.start; length = s.fixed.activeDays + s.fixed.restDays; title = '今のシート';
  } else {
    const activeLen = c.restStart ? C.diffDays(c.start, c.restStart) : null;
    const dayIdx = info.phase === 'active' ? info.day - 1 : activeLen;
    const block = Math.floor(dayIdx / 28);
    start = C.addDays(c.start, block * 28); length = 28;
    title = block > 0 ? `${block * 28 + 1}〜${block * 28 + 28}日目` : '1〜28日目';
    if (c.restStart && c.restStart >= start && c.restStart < C.addDays(start, 28)) {
      length = Math.min(28, C.diffDays(start, c.restStart) + c.restDays);
    }
  }
  let cells = '';
  for (let i = 0; i < length; i++) {
    const d = C.addDays(start, i);
    const st = C.dayStatus(state, d, today);
    const di = C.dayInfo(state, d);
    const num = di.phase === 'rest' ? '休' : (di.phase === 'active' ? di.day : '');
    cells += `<button class="pill ${st} ${d === today ? 'is-today' : ''}" data-day="${d}" aria-label="${fmt(d)} ${statusText(st)}"><span>${num}</span></button>`;
  }
  return `<section class="card">
    <div class="card-head"><h3>${title}</h3><span class="muted small">タップで記録を修正</span></div>
    <div class="sheet">${cells}</div>
    <div class="legend"><span><i class="pill-dot taken"></i>飲んだ</span><span><i class="pill-dot missed"></i>未記録</span><span><i class="pill-dot rest"></i>休薬</span></div>
  </section>`;
}

function statusText(st) {
  return { taken: '飲んだ', missed: '未記録', due: '今日', planned: '予定', rest: '休薬', before: '記録なし', '': '' }[st] || '';
}

function renderToday() {
  const today = C.todayStr();
  if (!state.cycles.length) return renderSetup(true);
  const s = state.settings;
  const info = C.dayInfo(state, today);
  const pl = phaseLabel(info);
  const taken = C.isTaken(state, today);
  const log = state.logs[today];
  let hero = '';

  if (info.phase === 'active') {
    hero = taken
      ? `<button class="take-btn done" id="untake" aria-label="記録を取り消す">
           <svg viewBox="0 0 48 48" aria-hidden="true"><path d="M14 25l7 7 14-15"/></svg>
           <b>飲みました</b><small>${esc(log.at)} に記録<br>タップで取り消し</small></button>`
      : `<button class="take-btn" id="take">
           <span class="ring"></span><b>飲んだ</b><small>タップで記録</small></button>`;
  } else if (info.phase === 'rest') {
    const next = C.addDays(today, info.restTotal - info.restDay + 1);
    hero = `<div class="rest-hero"><b>今日は休薬日です</b><small>次の服用開始 ${fmt(next)}<br>休薬中は通知をお休みします</small></div>`;
  } else {
    const first = state.cycles.map((c) => c.start).sort()[0];
    hero = `<div class="rest-hero"><b>${fmt(first)}から服用開始</b></div>`;
  }

  // 昨日の未記録
  let alertCard = '';
  const y = C.addDays(today, -1);
  const yInfo = C.dayInfo(state, y);
  if (yInfo.phase === 'active' && C.dayStatus(state, y, today) === 'missed' && !(state.logs[y] && state.logs[y].missedAck)) {
    alertCard = `<section class="card alert">
      <div class="alert-text"><b>昨日(${fmtShort(y)})の記録がありません</b><span>飲んでいたら記録してください。</span></div>
      <div class="btn-row tight">
        <button class="btn small" id="y-missed">飲み忘れた</button>
        <button class="btn small primary" id="y-taken">飲んでいた</button>
      </div></section>`;
  }

  // 連続服用: 休薬の選択
  let restCard = '';
  const rc = C.restChoice(state, today);
  if (rc) {
    if (rc.overMax) {
      restCard = `<section class="card warn"><b>連続服用が${s.flex.maxDays}日に達しました</b>
        <p class="muted">設定した上限です。医師の指示に従って休薬してください。</p>
        <button class="btn primary block" id="rest-start">${rc.restStart === today ? '今日から' : '明日から'}休薬する</button></section>`;
    } else if (rc.allowed) {
      restCard = `<section class="card choice"><div class="card-head"><h3>休薬を始められます</h3>
        <span class="muted small">${rc.completed}日服用済み</span></div>
        <p class="muted">${s.flex.minDays}日以上飲んだので、休薬日を自分で選べます(休薬は${s.flex.restDays}日間)。${rc.nearMax ? `<br><b>上限の${s.flex.maxDays}日が近づいています。</b>` : ''}</p>
        <button class="btn block" id="rest-start">${rc.restStart === today ? '今日から' : '明日から'}休薬する</button></section>`;
    } else {
      restCard = `<p class="hint">あと${s.flex.minDays - rc.completed}日飲むと、休薬日を選べるようになります。</p>`;
    }
  }
  // 選んだ休薬の取り消し(連続服用)
  if (s.mode === 'flexible') {
    const tInfo = C.dayInfo(state, C.addDays(today, 1));
    const planned = (info.phase === 'active' && tInfo.phase === 'rest' && tInfo.restDay === 1) || (info.phase === 'rest' && info.restDay === 1);
    if (planned) {
      restCard = `<section class="card choice"><b>${info.phase === 'rest' ? '今日' : '明日'}から休薬します</b>
        <p class="muted">間違えた場合は取り消して服用を続けられます。</p>
        <button class="btn ghost block" id="rest-cancel">休薬を取り消す</button></section>`;
    }
  }

  // 残り錠数
  let stockCard = '';
  const rem = C.remainingPills(state);
  if (rem != null) {
    const low = rem <= s.lowStockAt;
    stockCard = `<section class="card stock ${low ? 'low' : ''}"><div><span class="muted small">手元の残り</span><b>${Math.max(rem, 0)}<small>錠</small></b></div>
      <p>${low ? '残りわずかです。次のシートの準備・受診の予約をしましょう。' : 'シートを開けたら設定から追加できます。'}</p></section>`;
  }

  // 次の受診
  let visitCard = '';
  const nv = state.visits.filter((v) => v.date >= today).sort((a, b) => (a.date + a.time < b.date + b.time ? -1 : 1))[0];
  if (nv) {
    const days = C.diffDays(today, nv.date);
    visitCard = `<section class="card visit" data-go="care"><span class="muted small">次の受診</span>
      <b>${fmt(nv.date)} ${esc(nv.time || '')}</b><span class="badge">${days === 0 ? '今日' : days === 1 ? '明日' : `あと${days}日`}</span></section>`;
  }

  return `
    <section class="hero ${pl.cls}">
      ${s.medName ? `<div class="medname">${esc(s.medName)}</div>` : ''}
      <div class="phase"><b>${pl.big}</b><span>${pl.sub}</span></div>
      ${hero}
      ${info.phase === 'active' && !taken ? `<p class="muted center small">通知 ${esc(s.time)}${state.push.enabled ? '' : '(通知は設定からオン)'}</p>` : ''}
    </section>
    ${alertCard}${restCard}${stockCard}${visitCard}
    ${sheetGrid(today)}`;
}

function bindToday(v) {
  const today = C.todayStr();
  v.querySelector('#take')?.addEventListener('click', () => { setTaken(today, true); commit(); toast('記録しました'); });
  v.querySelector('#untake')?.addEventListener('click', () => confirmBox('記録を取り消しますか?', '今日の「飲んだ」記録を消します。', '取り消す', () => { setTaken(today, false); commit(); }));
  v.querySelector('#y-taken')?.addEventListener('click', () => {
    const y = C.addDays(today, -1);
    openModal(`<h2 class="sheet-title">${fmt(y)} に飲んだ</h2>
      <label class="field"><span>飲んだ時刻(わかれば)</span><input type="time" id="t" value="${esc(state.settings.time)}"></label>
      <div class="btn-row"><button class="btn ghost" data-close>やめる</button><button class="btn primary" id="ok">記録する</button></div>`,
    (m) => { $('#ok', m).onclick = () => { setTaken(y, true, $('#t', m).value); closeModal(); commit(); toast('記録しました'); }; });
  });
  v.querySelector('#y-missed')?.addEventListener('click', () => {
    const y = C.addDays(today, -1);
    state.logs[y] = { taken: false, missedAck: true }; commit({ silent: true });
    showMissedHelp(() => render());
  });
  v.querySelector('#rest-start')?.addEventListener('click', () => {
    const rc = C.restChoice(state, today);
    confirmBox(`${fmt(rc.restStart)}から休薬しますか?`, `休薬は${state.settings.flex.restDays}日間です。休薬中は通知が止まり、休薬明けに服用1日目から通知を再開します。`, '休薬する', () => {
      C.startRest(state, rc.restStart); commit(); toast('休薬日を設定しました');
    });
  });
  v.querySelector('#rest-cancel')?.addEventListener('click', () => {
    if (C.cancelRest(state, today)) { commit(); toast('休薬を取り消しました'); }
  });
  v.querySelectorAll('[data-day]').forEach((b) => b.addEventListener('click', () => openDay(b.dataset.day)));
  v.querySelector('[data-go]')?.addEventListener('click', () => go('care'));
}

function showMissedHelp(after) {
  const s = state.settings;
  const phone = state.clinic.phone;
  openModal(`<h2 class="sheet-title">飲み忘れたとき</h2>
    ${s.missedNote ? `<div class="note-box">${esc(s.missedNote).replace(/\n/g, '<br>')}</div>`
    : `<p class="sheet-text">対処の方法はお薬によって違います。自己判断せず、お薬の説明書(添付文書)や医師・薬剤師の指示を確認してください。<br><small class="muted">「受診・メモ」で、自分用の対処メモを登録できます。</small></p>`}
    ${phone ? `<a class="btn block" href="tel:${esc(phone.replace(/[^0-9+]/g, ''))}">${esc(state.clinic.name || 'かかりつけ')}に電話する</a>` : ''}
    <div class="btn-row"><button class="btn primary" data-close>閉じる</button></div>`);
  after && after();
}

// ---------- 1日の記録を編集 ----------
function openDay(date) {
  const today = C.todayStr();
  const info = C.dayInfo(state, date);
  const log = state.logs[date];
  const isFuture = date > today;
  const phase = info.phase === 'active' ? `服用 ${info.day}日目` : info.phase === 'rest' ? `休薬 ${info.restDay}日目` : '周期の外';
  const visit = state.visits.find((v) => v.date === date);
  openModal(`
    <h2 class="sheet-title">${fmt(date)}</h2>
    <p class="muted">${phase}${visit ? ` ・ 受診 ${esc(visit.time || '')}` : ''}</p>
    ${isFuture ? '' : `
    <div class="seg" role="radiogroup" aria-label="服用">
      <button type="button" class="seg-btn ${log && log.taken ? 'on' : ''}" data-v="1">飲んだ</button>
      <button type="button" class="seg-btn ${!(log && log.taken) ? 'on' : ''}" data-v="0">飲んでいない</button>
    </div>
    <label class="field" id="time-field" ${log && log.taken ? '' : 'hidden'}><span>飲んだ時刻</span><input type="time" id="t" value="${esc((log && log.at) || state.settings.time)}"></label>`}
    <label class="field"><span>メモ(体調など)</span><textarea id="memo" rows="3" placeholder="例: 少し頭痛あり">${esc(state.memos[date] || '')}</textarea></label>
    <div class="btn-row"><button class="btn ghost" data-close>やめる</button><button class="btn primary" id="ok">保存</button></div>`,
  (m) => {
    let taken = !!(log && log.taken);
    m.querySelectorAll('.seg-btn').forEach((b) => b.addEventListener('click', () => {
      taken = b.dataset.v === '1';
      m.querySelectorAll('.seg-btn').forEach((x) => x.classList.toggle('on', x === b));
      $('#time-field', m).hidden = !taken;
    }));
    $('#ok', m).onclick = () => {
      if (!isFuture) {
        if (taken) setTaken(date, true, $('#t', m).value || state.settings.time);
        else if (log && log.taken) delete state.logs[date];
      }
      const memo = $('#memo', m).value.trim();
      if (memo) state.memos[date] = memo; else delete state.memos[date];
      closeModal(); commit(); toast('保存しました');
    };
  });
}

// ---------- 画面: カレンダー ----------
function renderCalendar() {
  const today = C.todayStr();
  const [yy, mm] = calMonth.split('-').map(Number);
  const first = `${calMonth}-01`;
  const startW = C.parse(first).getDay();
  const days = new Date(yy, mm, 0).getDate();
  let cells = '';
  for (let i = 0; i < startW; i++) cells += '<div class="cal-cell empty"></div>';
  let taken = 0, missed = 0;
  for (let d = 1; d <= days; d++) {
    const ds = `${calMonth}-${C.pad(d)}`;
    const st = C.dayStatus(state, ds, today);
    if (st === 'taken') taken++; if (st === 'missed') missed++;
    const visit = state.visits.some((v) => v.date === ds);
    const memo = !!state.memos[ds];
    const w = (startW + d - 1) % 7;
    cells += `<button class="cal-cell ${st} ${ds === today ? 'is-today' : ''} ${w === 0 ? 'sun' : w === 6 ? 'sat' : ''}" data-day="${ds}">
      <span class="n">${d}</span><span class="mark"></span>
      <span class="tags">${visit ? '<i class="tag-visit" title="受診"></i>' : ''}${memo ? '<i class="tag-memo" title="メモ"></i>' : ''}</span></button>`;
  }
  return `<section class="card cal">
    <div class="cal-head">
      <button class="icon-btn" id="prev" aria-label="前の月">‹</button>
      <h3>${yy}年${mm}月</h3>
      <button class="icon-btn" id="next" aria-label="次の月">›</button>
    </div>
    <div class="cal-grid wd">${[...WD].map((w, i) => `<div class="${i === 0 ? 'sun' : i === 6 ? 'sat' : ''}">${w}</div>`).join('')}</div>
    <div class="cal-grid">${cells}</div>
    <div class="legend"><span><i class="pill-dot taken"></i>飲んだ</span><span><i class="pill-dot missed"></i>未記録</span><span><i class="pill-dot rest"></i>休薬</span><span><i class="tag-visit"></i>受診</span><span><i class="tag-memo"></i>メモ</span></div>
  </section>
  <section class="stats"><div><b>${taken}</b><span>飲んだ日</span></div><div><b>${missed}</b><span>未記録の日</span></div></section>
  ${calMonth !== today.slice(0, 7) ? '<button class="btn ghost block" id="thismonth">今月に戻る</button>' : ''}
  <p class="hint">過去の日付もタップして記録・修正できます。</p>`;
}
function bindCalendar(v) {
  const shift = (n) => { const [y, m] = calMonth.split('-').map(Number); const d = new Date(y, m - 1 + n, 1); calMonth = `${d.getFullYear()}-${C.pad(d.getMonth() + 1)}`; render(); };
  $('#prev', v).onclick = () => shift(-1);
  $('#next', v).onclick = () => shift(1);
  v.querySelector('#thismonth')?.addEventListener('click', () => { calMonth = C.todayStr().slice(0, 7); render(); });
  v.querySelectorAll('[data-day]').forEach((b) => b.addEventListener('click', () => openDay(b.dataset.day)));
  // スワイプで月移動
  let x0 = null;
  const g = $('.cal', v);
  g.addEventListener('touchstart', (e) => { x0 = e.touches[0].clientX; }, { passive: true });
  g.addEventListener('touchend', (e) => { if (x0 == null) return; const dx = e.changedTouches[0].clientX - x0; if (Math.abs(dx) > 60) shift(dx < 0 ? 1 : -1); x0 = null; });
}

// ---------- 画面: 受診・メモ ----------
function renderCare() {
  const today = C.todayStr();
  const upcoming = state.visits.filter((v) => v.date >= today).sort((a, b) => (a.date + a.time < b.date + b.time ? -1 : 1));
  const past = state.visits.filter((v) => v.date < today).sort((a, b) => (a.date < b.date ? 1 : -1)).slice(0, 5);
  const row = (v) => `<li class="visit-row"><div><b>${fmt(v.date)} ${esc(v.time || '')}</b>${v.note ? `<span class="muted">${esc(v.note)}</span>` : ''}</div>
    <button class="icon-btn" data-del="${esc(v.id)}" aria-label="削除">×</button></li>`;
  const phone = state.clinic.phone;
  return `
  <section class="card">
    <div class="card-head"><h3>受診の予定</h3><button class="btn small" id="add-visit">＋ 追加</button></div>
    ${upcoming.length ? `<ul class="list">${upcoming.map(row).join('')}</ul>` : '<p class="muted">予定はまだありません。前日に通知でお知らせします。</p>'}
    ${past.length ? `<details class="past"><summary>過去の受診</summary><ul class="list">${past.map(row).join('')}</ul></details>` : ''}
  </section>
  <section class="card">
    <div class="card-head"><h3>かかりつけ</h3></div>
    <label class="field"><span>病院・クリニック名</span><input id="c-name" value="${esc(state.clinic.name)}" placeholder="例: ○○レディースクリニック"></label>
    <label class="field"><span>電話番号</span><input id="c-phone" type="tel" inputmode="tel" value="${esc(phone)}" placeholder="例: 022-000-0000"></label>
    ${phone ? `<a class="btn block" href="tel:${esc(phone.replace(/[^0-9+]/g, ''))}">電話をかける</a>` : ''}
  </section>
  <section class="card">
    <div class="card-head"><h3>飲み忘れたときの対処メモ</h3></div>
    <p class="muted small">お薬の説明書(添付文書)や、医師・薬剤師から聞いた対処を書いておくと、飲み忘れたときにすぐ見られます。</p>
    <textarea id="missed-note" rows="5" placeholder="例: 気づいた時点ですぐ1錠。○時間以上過ぎたら病院に電話">${esc(state.settings.missedNote)}</textarea>
  </section>
  <button class="btn ghost block" id="show-missed">飲み忘れたときの画面を見る</button>`;
}
function bindCare(v) {
  $('#add-visit', v).onclick = () => openModal(`<h2 class="sheet-title">受診の予定を追加</h2>
    <label class="field"><span>日付</span><input type="date" id="vd" value="${C.addDays(C.todayStr(), 7)}"></label>
    <label class="field"><span>時刻</span><input type="time" id="vt" value="10:00"></label>
    <label class="field"><span>メモ</span><input id="vn" placeholder="例: 次のシートを処方してもらう"></label>
    <div class="btn-row"><button class="btn ghost" data-close>やめる</button><button class="btn primary" id="ok">追加</button></div>`,
  (m) => { $('#ok', m).onclick = () => {
    const date = $('#vd', m).value; if (!date) return;
    state.visits.push({ id: Math.random().toString(36).slice(2, 10), date, time: $('#vt', m).value, note: $('#vn', m).value.trim() });
    closeModal(); commit(); toast('予定を追加しました');
  }; });
  v.querySelectorAll('[data-del]').forEach((b) => b.addEventListener('click', () => confirmBox('この予定を削除しますか?', '', '削除', () => {
    state.visits = state.visits.filter((x) => x.id !== b.dataset.del); commit();
  }, true)));
  const saveClinic = () => { state.clinic.name = $('#c-name', v).value.trim(); state.clinic.phone = $('#c-phone', v).value.trim(); commit(); };
  $('#c-name', v).addEventListener('change', saveClinic);
  $('#c-phone', v).addEventListener('change', saveClinic);
  $('#missed-note', v).addEventListener('change', (e) => { state.settings.missedNote = e.target.value; commit({ silent: true }); toast('保存しました'); });
  $('#show-missed', v).onclick = () => showMissedHelp();
}

// ---------- 服用パターンの設定(初回にも使う) ----------
const PRESETS = [
  { id: '21-7', label: '21日服用 + 7日休薬', a: 21, r: 7 },
  { id: '24-4', label: '24日服用 + 4日休薬', a: 24, r: 4 },
  { id: '28-0', label: '28日服用(休薬なし)', a: 28, r: 0 },
  { id: 'custom', label: '日数を自分で決める' },
  { id: 'flex', label: '連続服用(休薬日を自分で選ぶ)' },
];
function currentPreset(s) {
  if (s.mode === 'flexible') return 'flex';
  const p = PRESETS.find((x) => x.a === s.fixed.activeDays && x.r === s.fixed.restDays);
  return p ? p.id : 'custom';
}
function setupForm(first) {
  const s = state.settings;
  const cur = currentPreset(s);
  const today = C.todayStr();
  const info = state.cycles.length ? C.dayInfo(state, today) : { phase: 'active', day: 1 };
  const curPhase = info.phase === 'rest' ? 'rest' : 'active';
  const curDay = info.phase === 'rest' ? info.restDay : (info.day || 1);
  return `
  <form id="setup" class="setup">
    ${first ? `<div class="welcome"><h2>はじめに</h2><p>服用のしかたを教えてください。あとから設定で変えられます。記録はこのスマホの中だけに保存されます。</p></div>
    <label class="field"><span>お薬の名前(任意・画面に表示するだけ)</span><input name="medName" value="${esc(s.medName)}" placeholder="例: いつものお薬"></label>` : '<h2 class="sheet-title">服用パターン</h2>'}
    <fieldset class="field"><legend>服用パターン</legend>
      <div class="radios">${PRESETS.map((p) => `<label class="radio"><input type="radio" name="preset" value="${p.id}" ${p.id === cur ? 'checked' : ''}><span>${p.label}</span></label>`).join('')}</div>
    </fieldset>
    <div class="sub" data-for="custom">
      <div class="two"><label class="field"><span>服用日数</span><input type="number" name="a" min="1" max="365" value="${s.fixed.activeDays}"></label>
      <label class="field"><span>休薬日数</span><input type="number" name="r" min="0" max="60" value="${s.fixed.restDays}"></label></div>
    </div>
    <div class="sub" data-for="flex">
      <label class="field"><span>何日飲んだら休薬を選べるようにするか</span><input type="number" name="minDays" min="1" max="365" value="${s.flex.minDays}"></label>
      <label class="field"><span>連続服用の上限(日)</span><input type="number" name="maxDays" min="1" max="730" value="${s.flex.maxDays}"></label>
      <label class="field"><span>休薬日数</span><input type="number" name="fr" min="1" max="60" value="${s.flex.restDays}"></label>
      <p class="muted small">日数はお薬の説明書や医師の指示に合わせてください。</p>
    </div>
    <fieldset class="field"><legend>今日は</legend>
      <div class="today-pick">
        <select name="phase"><option value="active" ${curPhase === 'active' ? 'selected' : ''}>服用</option><option value="rest" ${curPhase === 'rest' ? 'selected' : ''}>休薬</option></select>
        <input type="number" name="day" min="1" max="730" value="${curDay}"><span>日目</span>
      </div>
      <p class="muted small">シートの途中からでも始められます。過去の記録はカレンダーから付けられます。</p>
    </fieldset>
    ${first ? `<label class="field"><span>毎日の服用時刻</span><input type="time" name="time" value="${esc(s.time)}"></label>` : ''}
    <div class="btn-row">${first ? '' : '<button type="button" class="btn ghost" data-close>やめる</button>'}<button class="btn primary" type="submit">${first ? 'はじめる' : '保存'}</button></div>
  </form>`;
}
function bindSetup(root, first) {
  const f = $('#setup', root);
  const upd = () => {
    const p = f.preset.value;
    f.querySelectorAll('.sub').forEach((el) => { el.hidden = el.dataset.for !== p; });
  };
  f.querySelectorAll('input[name=preset]').forEach((r) => r.addEventListener('change', upd));
  upd();
  f.addEventListener('submit', (e) => {
    e.preventDefault();
    const s = state.settings;
    const p = f.preset.value;
    const num = (v, d, min = 0) => { const n = parseInt(v, 10); return Number.isFinite(n) && n >= min ? n : d; };
    if (p === 'flex') {
      s.mode = 'flexible';
      s.flex = { minDays: num(f.minDays.value, 24, 1), maxDays: num(f.maxDays.value, 120, 1), restDays: num(f.fr.value, 4, 1) };
      if (s.flex.maxDays < s.flex.minDays) s.flex.maxDays = s.flex.minDays;
    } else {
      s.mode = 'fixed';
      const pr = PRESETS.find((x) => x.id === p);
      s.fixed = pr && pr.a ? { activeDays: pr.a, restDays: pr.r } : { activeDays: num(f.a.value, 21, 1), restDays: num(f.r.value, 7, 0) };
    }
    if (first) { s.medName = f.medName.value.trim(); if (f.time.value) s.time = f.time.value; }
    let phase = f.phase.value;
    if (phase === 'rest' && s.mode === 'fixed' && s.fixed.restDays === 0) phase = 'active';
    C.resetCycles(state, { phase, day: f.day.value });
    if (!state.trackSince) state.trackSince = C.todayStr();
    if (!first) closeModal();
    commit();
    toast(first ? '設定しました' : '服用パターンを変更しました');
    if (first) requestPersist();
  });
}
function renderSetup(first) { return setupForm(first); }

// ---------- 画面: 設定 ----------
function pushStatusHTML() {
  if (!Push.isConfigured()) return '<p class="muted small">プッシュ通知はまだ準備中です(README の手順で Firebase を設定すると使えます)。</p>';
  if (Push.isIOS() && !Push.isStandalone()) {
    return `<div class="note-box small">iPhone で通知を受け取るには、Safari の<b>共有ボタン → 「ホーム画面に追加」</b>をして、ホーム画面のアイコンから開いてください。</div>`;
  }
  if (!Push.pushSupported()) return '<p class="muted small">このブラウザはプッシュ通知に対応していません。</p>';
  const perm = Push.permission();
  if (state.push.enabled && perm === 'granted') {
    return `<p class="ok-line">通知はオンです</p>
      <div class="btn-row tight"><button class="btn small" id="push-test">テスト通知</button><button class="btn small ghost" id="push-off">オフにする</button></div>`;
  }
  if (perm === 'denied') return '<p class="muted small">通知がブロックされています。iPhone の「設定」→「通知」→「のむログ」から許可してください。</p>';
  return '<button class="btn primary block" id="push-on">通知をオンにする</button>';
}
function renderSettings() {
  const s = state.settings;
  const rem = C.remainingPills(state);
  const patternText = s.mode === 'flexible'
    ? `連続服用(${s.flex.minDays}日以降に休薬を選択・休薬${s.flex.restDays}日・上限${s.flex.maxDays}日)`
    : (s.fixed.restDays ? `${s.fixed.activeDays}日服用 + ${s.fixed.restDays}日休薬` : `${s.fixed.activeDays}日服用(休薬なし)`);
  const opt = (vals, cur, unit) => vals.map((v) => `<option value="${v}" ${String(v) === String(cur) ? 'selected' : ''}>${v === 0 ? 'しない' : v + unit}</option>`).join('');
  return `
  <section class="card">
    <div class="card-head"><h3>お薬</h3></div>
    <label class="field"><span>名前(任意)</span><input id="medName" value="${esc(s.medName)}" placeholder="例: いつものお薬"></label>
    <div class="kv"><span>服用パターン</span><b>${patternText}</b></div>
    <button class="btn block" id="edit-pattern">服用パターン・今日が何日目かを変更</button>
  </section>
  <section class="card">
    <div class="card-head"><h3>通知</h3></div>
    <label class="field"><span>服用時刻</span><input type="time" id="time" value="${esc(s.time)}"></label>
    <div class="two">
      <label class="field"><span>記録がないとき再通知</span><select id="repeatMin">${opt([0, 10, 15, 30, 60], s.repeatMin, '分おき')}</select></label>
      <label class="field"><span>再通知の回数</span><select id="repeatCount">${opt([1, 2, 3, 4, 6], s.repeatCount, '回まで')}</select></label>
    </div>
    <p class="muted small">休薬日と、すでに「飲んだ」を記録した日は通知しません。受診日の前日にもお知らせします。</p>
    <div id="push-status">${pushStatusHTML()}</div>
  </section>
  <section class="card">
    <div class="card-head"><h3>残り錠数</h3>${rem != null ? `<b class="big-num">${Math.max(rem, 0)}<small>錠</small></b>` : ''}</div>
    <div class="two">
      <label class="field"><span>1シートの錠数</span><input type="number" id="sheetSize" min="1" max="200" value="${s.sheetSize}"></label>
      <label class="field"><span>残りが何錠で知らせる</span><input type="number" id="lowStockAt" min="0" max="200" value="${s.lowStockAt}"></label>
    </div>
    <div class="btn-row tight"><button class="btn small" id="add-sheet">＋ 1シート追加</button><button class="btn small ghost" id="set-stock">残り数を入力</button></div>
  </section>
  <section class="card">
    <div class="card-head"><h3>パスコードロック</h3></div>
    ${s.lockHash ? `<p class="ok-line">オン(アプリを開くときに4桁の数字を入力)</p>
      <div class="btn-row tight"><button class="btn small" id="lock-change">変更</button><button class="btn small ghost" id="lock-off">オフにする</button></div>`
    : '<button class="btn block" id="lock-on">パスコードを設定する</button>'}
  </section>
  <section class="card">
    <div class="card-head"><h3>バックアップ</h3></div>
    <p class="muted small">記録はこのスマホの中だけにあります。機種変更に備えて、ときどき書き出して保存してください。</p>
    <div class="btn-row tight"><button class="btn small" id="export">書き出す</button><label class="btn small ghost file-btn">読み込む<input type="file" id="import" accept="application/json,.json"></label></div>
  </section>
  <section class="card">
    <button class="btn danger ghost block" id="reset">すべてのデータを消す</button>
  </section>
  <p class="about">のむログ v${APP_VERSION}<br>サーバーに送るのは通知に必要な情報(通知時刻・休薬日・飲んだ日付)だけです。<br>このアプリは服用の記録とお知らせのためのもので、医療上の判断は医師・薬剤師にご相談ください。</p>`;
}
function bindSettings(v) {
  const s = state.settings;
  $('#medName', v).addEventListener('change', (e) => { s.medName = e.target.value.trim(); commit({ silent: true }); toast('保存しました'); });
  $('#edit-pattern', v).onclick = () => openModal(setupForm(false), (m) => bindSetup(m, false));
  $('#time', v).addEventListener('change', (e) => { if (e.target.value) { s.time = e.target.value; commit({ silent: true }); toast(`通知を ${s.time} にしました`); } });
  $('#repeatMin', v).addEventListener('change', (e) => { s.repeatMin = Number(e.target.value); commit({ silent: true }); });
  $('#repeatCount', v).addEventListener('change', (e) => { s.repeatCount = Number(e.target.value); commit({ silent: true }); });
  $('#sheetSize', v).addEventListener('change', (e) => { s.sheetSize = Math.max(1, parseInt(e.target.value, 10) || 28); commit({ silent: true }); });
  $('#lowStockAt', v).addEventListener('change', (e) => { s.lowStockAt = Math.max(0, parseInt(e.target.value, 10) || 0); commit(); });
  $('#add-sheet', v).onclick = () => {
    if (!state.stock) state.stock = { base: 0, since: C.todayStr() };
    state.stock.base += s.sheetSize; commit(); toast(`${s.sheetSize}錠 追加しました`);
  };
  $('#set-stock', v).onclick = () => openModal(`<h2 class="sheet-title">残り錠数を入力</h2>
    <label class="field"><span>今日の分を飲む前の、手元の錠数(予備のシートも含む)</span><input type="number" id="n" min="0" value="${Math.max(C.remainingPills(state) ?? s.sheetSize, 0)}"></label>
    <div class="btn-row"><button class="btn ghost" data-close>やめる</button><button class="btn primary" id="ok">保存</button></div>`,
  (m) => { $('#ok', m).onclick = () => {
    const today = C.todayStr();
    const n = Math.max(0, parseInt($('#n', m).value, 10) || 0);
    state.stock = { base: n, since: today };
    closeModal(); commit(); toast('保存しました');
  }; });

  // 通知
  v.querySelector('#push-on')?.addEventListener('click', async (e) => {
    e.target.disabled = true; e.target.textContent = '設定中…';
    try { await Push.enable(pushPayload()); state.push.enabled = true; commit(); toast('通知をオンにしました'); }
    catch (err) { toast(err.message || '通知をオンにできませんでした'); render(); }
  });
  v.querySelector('#push-off')?.addEventListener('click', async () => {
    try { await Push.disable(); } catch (_) {}
    state.push.enabled = false; commit(); toast('通知をオフにしました');
  });
  v.querySelector('#push-test')?.addEventListener('click', async () => {
    try { await Push.requestServerTest(); toast('5分以内にテスト通知が届きます'); }
    catch (err) { toast('送信できませんでした: ' + (err.message || '')); }
  });

  // パスコード
  const setPin = () => pinSetup();
  v.querySelector('#lock-on')?.addEventListener('click', setPin);
  v.querySelector('#lock-change')?.addEventListener('click', setPin);
  v.querySelector('#lock-off')?.addEventListener('click', () => confirmBox('パスコードをオフにしますか?', '', 'オフにする', () => { s.lockHash = null; s.lockSalt = null; commit(); }));

  // バックアップ
  $('#export', v).onclick = async () => {
    const blob = new Blob([JSON.stringify(state, null, 1)], { type: 'application/json' });
    const name = `nomulog-backup-${C.todayStr()}.json`;
    const file = new File([blob], name, { type: 'application/json' });
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      try { await navigator.share({ files: [file], title: 'のむログ バックアップ' }); return; } catch (e) { if (e.name === 'AbortError') return; }
    }
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  };
  $('#import', v).addEventListener('change', async (e) => {
    const file = e.target.files[0]; if (!file) return;
    try {
      const next = importJSON(await file.text());
      confirmBox('バックアップを読み込みますか?', '今の記録はバックアップの内容に置き換わります。', '読み込む', () => {
        const push = state.push; state = next; state.push = push; commit(); toast('読み込みました');
      });
    } catch (err) { toast(err.message || '読み込めませんでした'); }
  });
  $('#reset', v).onclick = () => confirmBox('すべてのデータを消しますか?', '記録・設定・受診予定がすべて消え、元に戻せません。先にバックアップの書き出しをおすすめします。', '消す', async () => {
    if (state.push.enabled) { try { await Push.disable(); } catch (_) {} }
    state = defaultState(); commit(); go('today');
  }, true);
}

// ---------- パスコード ----------
let unlocked = false;
let hiddenAt = 0;
function keypadHTML() {
  return [1, 2, 3, 4, 5, 6, 7, 8, 9, '', 0, '⌫'].map((k) => k === '' ? '<span></span>' : `<button class="key" data-k="${k}">${k}</button>`).join('');
}
function runPinPad(container, msgEl, dotsEl, onDone) {
  let buf = '';
  const draw = () => dotsEl.querySelectorAll('i').forEach((d, i) => d.classList.toggle('on', i < buf.length));
  draw();
  container.innerHTML = keypadHTML();
  container.onclick = async (e) => {
    const b = e.target.closest('[data-k]'); if (!b) return;
    const k = b.dataset.k;
    if (k === '⌫') buf = buf.slice(0, -1); else if (buf.length < 4) buf += k;
    draw();
    if (buf.length === 4) { const v = buf; buf = ''; setTimeout(draw, 150); await onDone(v); }
  };
}
function showLock() {
  const s = state.settings;
  if (!s.lockHash) { unlocked = true; return; }
  unlocked = false;
  const lock = $('#lock'); lock.hidden = false;
  $('#lock-msg').textContent = 'パスコードを入力';
  runPinPad($('#keypad'), $('#lock-msg'), $('#pin-dots'), async (pin) => {
    if (await hashPin(pin, s.lockSalt) === s.lockHash) { unlocked = true; lock.hidden = true; render(); }
    else { $('#lock-msg').textContent = 'パスコードが違います'; lock.querySelector('.pin-dots').classList.add('shake'); setTimeout(() => lock.querySelector('.pin-dots').classList.remove('shake'), 400); }
  });
}
function pinSetup() {
  openModal(`<h2 class="sheet-title center" id="pm">新しいパスコード(4桁)</h2>
    <div class="pin-dots" id="pd"><i></i><i></i><i></i><i></i></div>
    <div class="keypad" id="kp"></div>
    <p class="muted small center">忘れるとデータを開けなくなります。バックアップもおすすめします。</p>
    <div class="btn-row"><button class="btn ghost" data-close>やめる</button></div>`, (m) => {
    let firstPin = null;
    runPinPad($('#kp', m), $('#pm', m), $('#pd', m), async (pin) => {
      if (!firstPin) { firstPin = pin; $('#pm', m).textContent = 'もう一度入力'; return; }
      if (pin !== firstPin) { firstPin = null; $('#pm', m).textContent = '一致しません。最初から入力'; return; }
      const salt = Math.random().toString(36).slice(2) + Date.now().toString(36);
      state.settings.lockSalt = salt; state.settings.lockHash = await hashPin(pin, salt);
      closeModal(); commit(); toast('パスコードを設定しました');
    });
  });
}

// ---------- 画面切り替え ----------
function go(t) { tab = t; window.scrollTo(0, 0); render(); }
document.querySelectorAll('.tab').forEach((b) => b.addEventListener('click', () => go(b.dataset.tab)));

function render() {
  const v = $('#view');
  const today = C.todayStr();
  $('#topdate').textContent = fmt(today);
  const setupMode = !state.cycles.length;
  document.body.classList.toggle('setup-mode', setupMode);
  document.querySelectorAll('.tab').forEach((b) => b.classList.toggle('on', b.dataset.tab === tab));
  if (setupMode) { v.innerHTML = renderSetup(true); bindSetup(v, true); return; }
  if (tab === 'today') { v.innerHTML = renderToday(); bindToday(v); }
  else if (tab === 'calendar') { v.innerHTML = renderCalendar(); bindCalendar(v); }
  else if (tab === 'care') { v.innerHTML = renderCare(); bindCare(v); }
  else { v.innerHTML = renderSettings(); bindSettings(v); }
}

// 日付が変わったら描き直す・しばらく閉じていたらロック
let lastDay = C.todayStr();
document.addEventListener('visibilitychange', () => {
  if (document.hidden) { hiddenAt = Date.now(); return; }
  if (state.settings.lockHash && Date.now() - hiddenAt > 60_000 && hiddenAt) showLock();
  if (C.todayStr() !== lastDay) { lastDay = C.todayStr(); calMonth = lastDay.slice(0, 7); }
  state = load();
  render();
  syncPush();
});

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('./sw.js').catch((e) => console.warn('sw', e));
  navigator.serviceWorker.addEventListener('message', (e) => { if (e.data && e.data.type === 'open-today') go('today'); });
}

render();
showLock();
syncPush();
