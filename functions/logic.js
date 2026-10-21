// 通知を送るかどうかの判定(テストしやすいように Firebase から切り離している)
const WINDOW_MIN = 5; // 毎分実行。実行が遅れても5分以内なら拾う(重複は sent.keys で防ぐ)

function localNow(date, tz) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', {
      timeZone: tz || 'Asia/Tokyo', year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
    }).formatToParts(date).map((p) => [p.type, p.value]),
  );
  return { day: `${parts.year}-${parts.month}-${parts.day}`, min: Number(parts.hour) * 60 + Number(parts.minute) };
}

const toMin = (hm) => { const [h, m] = String(hm || '21:00').split(':').map(Number); return h * 60 + (m || 0); };
const fmtMin = (m) => `${Math.floor(m / 60) % 24}:${String(m % 60).padStart(2, '0')}`;

// doc: Firestore の devices/{uid}。戻り値: 送る通知の配列 [{ key, title, body, tag }]
function decide(doc, now = new Date()) {
  const out = [];
  if (!doc || !doc.token) return out;
  const { day, min } = localNow(now, doc.tz);
  const sent = (doc.sent && doc.sent.day === day) ? (doc.sent.keys || []) : [];
  const push = (n) => { if (!sent.includes(n.key)) out.push(n); };

  if (doc.testRequested) push({ key: `test-${now.getTime()}`, title: 'のむログ', body: 'テスト通知です。この通知が届けば設定は完了です。', tag: 'test', clearTest: true });
  if (!doc.enabled) return out;

  const base = toMin(doc.time);
  const inWindow = (t) => min >= t && min < t + WINDOW_MIN;

  // 服用の通知
  const started = !doc.startDate || day >= doc.startDate;
  const rest = (doc.restDates || []).includes(day);
  const taken = (doc.takenDates || []).includes(day);
  const remindAnyway = !!doc.remindEvenIfTaken;
  if (started && !rest && (!taken || remindAnyway)) {
    const low = doc.lowStock ? '\n残りが少なくなっています。次のシートの準備を。' : '';
    const body = taken ? `今日の分は記録済みです。${low}` : `今日の分を飲んだら、アプリで記録してください。${low}`;
    if (inWindow(base)) push({ key: 'dose-0', title: 'お薬の時間です', body, tag: 'dose' });
  }
  // 再通知は「まだ記録していない日」だけ
  if (started && !rest && !taken) {
    const every = Number(doc.repeatMin) || 0;
    const count = Math.min(Number(doc.repeatCount) || 0, 12);
    if (every > 0) {
      for (let k = 1; k <= count; k++) {
        const t = base + every * k;
        if (t >= 24 * 60) break; // 日付をまたぐ再通知はしない
        if (inWindow(t)) push({ key: `dose-${k}`, title: 'まだ記録がありません', body: `${fmtMin(base)} のお薬は飲みましたか?`, tag: 'dose' });
      }
    }
  }

  // 次のシートの準備(シートごとに1回だけ)
  if (doc.sheetPrep && doc.sheetPrepSent !== doc.sheetPrep) {
    push({ key: `sheet-${doc.sheetPrep}`, title: '次のシートを準備しましたか?', body: '今のシートの3列目まで飲み終わりました。次のシートの用意や受診の予約を確認しておきましょう。', tag: 'sheet', sheetPrep: doc.sheetPrep });
  }

  // 受診日の前日
  if ((doc.visitEves || []).includes(day) && inWindow(base)) {
    push({ key: 'visit', title: '明日は受診日です', body: '時間と持ち物を確認しておきましょう。', tag: 'visit' });
  }
  return out;
}

module.exports = { decide, localNow, toMin, WINDOW_MIN };
