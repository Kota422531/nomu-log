import assert from 'node:assert/strict';
import * as C from '../js/cycle.js';

const base = (mode, extra = {}) => ({
  settings: { mode, fixed: { activeDays: 21, restDays: 7 }, flex: { minDays: 24, maxDays: 120, restDays: 4 }, lowStockAt: 7, ...extra },
  cycles: [], logs: {}, visits: [], stock: null,
});

// 固定 21+7
{
  const s = base('fixed');
  C.resetCycles(s, { phase: 'active', day: 1 }, '2026-10-01');
  assert.deepEqual(C.dayInfo(s, '2026-10-01'), { ...C.dayInfo(s, '2026-10-01'), phase: 'active', day: 1 });
  assert.equal(C.dayInfo(s, '2026-10-21').day, 21);
  assert.equal(C.dayInfo(s, '2026-10-22').phase, 'rest');
  assert.equal(C.dayInfo(s, '2026-10-28').restDay, 7);
  assert.equal(C.dayInfo(s, '2026-10-29').day, 1); // 次のシート
  assert.equal(C.dayInfo(s, '2026-12-24').day, 1); // 3周期後 (84日後)
  assert.equal(C.dayInfo(s, '2026-09-30').phase, 'none');
  // シート途中から登録: 今日が12日目
  C.resetCycles(s, { phase: 'active', day: 12 }, '2026-10-20');
  assert.equal(C.dayInfo(s, '2026-10-09').day, 1);
  // 休薬3日目から登録
  C.resetCycles(s, { phase: 'rest', day: 3 }, '2026-10-20');
  assert.equal(C.dayInfo(s, '2026-10-20').restDay, 3);
  assert.equal(C.dayInfo(s, '2026-10-25').day, 1);
}
// 28連続(休薬0)
{
  const s = base('fixed'); s.settings.fixed = { activeDays: 28, restDays: 0 };
  C.resetCycles(s, { phase: 'active', day: 1 }, '2026-10-01');
  assert.equal(C.dayInfo(s, '2026-10-28').day, 28);
  assert.equal(C.dayInfo(s, '2026-10-29').day, 1);
}
// 連続服用: 24日飲んだ後に休薬を選ぶ
{
  const s = base('flexible');
  C.resetCycles(s, { phase: 'active', day: 1 }, '2026-09-01');
  const d24 = '2026-09-24';
  assert.equal(C.restChoice(s, d24).allowed, false); // 24日目、まだ飲んでいない → 23日完了
  s.logs[d24] = { taken: true };
  let rc = C.restChoice(s, d24);
  assert.equal(rc.allowed, true); assert.equal(rc.restStart, '2026-09-25');
  assert.equal(C.dayInfo(s, '2026-12-01').phase, 'active'); // 休薬を選ばない限り続く
  C.startRest(s, rc.restStart);
  assert.equal(C.dayInfo(s, '2026-09-25').phase, 'rest');
  assert.equal(C.dayInfo(s, '2026-09-28').restDay, 4);
  assert.equal(C.dayInfo(s, '2026-09-29').day, 1);
  assert.equal(C.dayInfo(s, '2026-09-24').day, 24); // 過去は変わらない
  // 取り消し
  assert.equal(C.cancelRest(s, '2026-09-24'), true);
  assert.equal(C.dayInfo(s, '2026-09-25').day, 25);
  // 40日目に飲む前に休薬 → 当日から休薬
  rc = C.restChoice(s, '2026-10-10');
  assert.equal(rc.day, 40); assert.equal(rc.restStart, '2026-10-10');
  C.startRest(s, rc.restStart);
  const sch = C.buildSchedule(s, '2026-10-10', 10);
  assert.deepEqual(sch.restDates, ['2026-10-10', '2026-10-11', '2026-10-12', '2026-10-13']);
  assert.equal(C.dayStatus(s, '2026-09-23', '2026-10-10'), 'missed');
}
// 残り錠数
{
  const s = base('fixed');
  s.stock = { base: 10, since: '2026-10-01' };
  s.logs = { '2026-09-30': { taken: true }, '2026-10-01': { taken: true }, '2026-10-02': { taken: true } };
  assert.equal(C.remainingPills(s), 8);
}
console.log('cycle tests: all passed');
// 使い始める前の日は「未記録」にしない
{
  const s = base('fixed');
  C.resetCycles(s, { phase: 'active', day: 10 }, '2026-10-20'); s.trackSince = '2026-10-20';
  assert.equal(C.dayStatus(s, '2026-10-15', '2026-10-22'), 'before');
  assert.equal(C.dayStatus(s, '2026-10-21', '2026-10-22'), 'missed');
  console.log('trackSince tests: passed');
}
