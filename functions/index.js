const { onSchedule } = require('firebase-functions/v2/scheduler');
const logger = require('firebase-functions/logger');
const { initializeApp } = require('firebase-admin/app');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');
const { getMessaging } = require('firebase-admin/messaging');
const { decide, localNow } = require('./logic');

initializeApp();
const db = getFirestore();

// 5分ごとに、通知が必要な端末へプッシュを送る
exports.medReminder = onSchedule(
  { schedule: 'every 5 minutes', timeZone: 'Asia/Tokyo', region: 'asia-northeast1', memory: '256MiB', timeoutSeconds: 120 },
  async () => {
    const now = new Date();
    const snap = await db.collection('devices').where('token', '!=', null).get();
    let sentCount = 0;

    await Promise.all(snap.docs.map(async (docSnap) => {
      const d = docSnap.data();
      const list = decide(d, now);
      if (!list.length) return;
      const { day } = localNow(now, d.tz);
      const prevKeys = (d.sent && d.sent.day === day) ? (d.sent.keys || []) : [];
      const newKeys = [];
      let dropToken = false;

      for (const n of list) {
        try {
          await getMessaging().send({
            token: d.token,
            data: { title: n.title, body: n.body, tag: n.tag, url: './' },
            webpush: { headers: { Urgency: 'high', TTL: '3600' } },
          });
          newKeys.push(n.key);
          sentCount++;
        } catch (err) {
          const code = err && err.code;
          if (code === 'messaging/registration-token-not-registered' || code === 'messaging/invalid-registration-token') {
            dropToken = true; // アプリを削除した端末など
            break;
          }
          logger.warn('send failed', docSnap.id, code || err);
        }
      }

      const update = { sent: { day, keys: [...prevKeys, ...newKeys] } };
      if (list.some((n) => n.clearTest)) update.testRequested = FieldValue.delete();
      if (dropToken) { update.token = FieldValue.delete(); update.enabled = false; }
      await docSnap.ref.set(update, { merge: true });
    }));

    logger.info(`checked ${snap.size} devices, sent ${sentCount}`);
  },
);
