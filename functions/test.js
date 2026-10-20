const assert = require('node:assert/strict');
const { decide } = require('./logic');

// 2026-10-20 21:00 JST = 12:00 UTC
const at = (hm, day = '2026-10-20') => new Date(`${day}T${hm}:00+09:00`);
const doc = {
  token: 't', enabled: true, tz: 'Asia/Tokyo', time: '21:00', repeatMin: 30, repeatCount: 3,
  startDate: '2026-10-01', restDates: ['2026-10-22'], takenDates: [], visitEves: ['2026-10-20'], lowStock: false,
};

assert.deepEqual(decide(doc, at('20:55')).map((n) => n.key), []);
assert.deepEqual(decide(doc, at('21:00')).map((n) => n.key), ['dose-0', 'visit']);
assert.deepEqual(decide(doc, at('21:05')).map((n) => n.key), ['dose-0', 'visit']); // まだ送っていなければ拾う
assert.deepEqual(decide({ ...doc, sent: { day: '2026-10-20', keys: ['dose-0', 'visit'] } }, at('21:05')).map((n) => n.key), []); // 重複しない
assert.deepEqual(decide(doc, at('21:30')).map((n) => n.key), ['dose-1']);
assert.deepEqual(decide(doc, at('22:30')).map((n) => n.key), ['dose-3']);
assert.deepEqual(decide(doc, at('23:00')).map((n) => n.key), []); // 3回まで
assert.deepEqual(decide({ ...doc, takenDates: ['2026-10-20'] }, at('21:30')).map((n) => n.key), []); // 飲んだら止まる
assert.deepEqual(decide(doc, at('21:00', '2026-10-22')).map((n) => n.key), []); // 休薬日は送らない
assert.deepEqual(decide(doc, at('21:00', '2026-09-30')).map((n) => n.key), []); // 開始前
assert.deepEqual(decide({ ...doc, enabled: false }, at('21:00')).map((n) => n.key), []);
assert.equal(decide({ ...doc, enabled: false, testRequested: true }, at('10:00'))[0].tag, 'test');
assert.ok(decide({ ...doc, lowStock: true }, at('21:00'))[0].body.includes('残り'));
// 23:30 設定で 30分おき → 日付をまたぐ分は送らない
assert.deepEqual(decide({ ...doc, time: '23:30' }, at('23:59')).map((n) => n.key), []);
console.log('functions tests: all passed');
