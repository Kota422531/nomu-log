// プッシュ通知(Firebase)。サーバーに送るのは「通知の時刻・休薬日・飲んだ日付」だけ。
import { firebaseConfig, vapidKey } from './firebase-config.js';

const V = '10.12.2';
let fb = null; // { db, auth, messaging, mods }

export const isConfigured = () => !!(firebaseConfig.apiKey && firebaseConfig.projectId && vapidKey);
export const isIOS = () => /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
export const isStandalone = () => window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
export const pushSupported = () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
export const permission = () => ('Notification' in window ? Notification.permission : 'unsupported');

async function init() {
  if (fb) return fb;
  const [app, auth, fs, msg] = await Promise.all([
    import(`https://www.gstatic.com/firebasejs/${V}/firebase-app.js`),
    import(`https://www.gstatic.com/firebasejs/${V}/firebase-auth.js`),
    import(`https://www.gstatic.com/firebasejs/${V}/firebase-firestore.js`),
    import(`https://www.gstatic.com/firebasejs/${V}/firebase-messaging.js`),
  ]);
  const a = app.initializeApp(firebaseConfig);
  const au = auth.getAuth(a);
  if (!au.currentUser) {
    await new Promise((res) => { const off = auth.onAuthStateChanged(au, () => { off(); res(); }); });
  }
  if (!au.currentUser) await auth.signInAnonymously(au);
  fb = { auth: au, db: fs.getFirestore(a), messaging: msg.getMessaging(a), fs, msg };
  return fb;
}

// 通知をオンにする(ボタン操作の中から呼ぶこと: iPhone の要件)
export async function enable(payload) {
  if (!isConfigured()) throw new Error('Firebase の設定がまだです(js/firebase-config.js)');
  if (!pushSupported()) throw new Error(isIOS() && !isStandalone()
    ? 'iPhone ではホーム画面に追加したアプリから通知をオンにしてください'
    : 'このブラウザはプッシュ通知に対応していません');
  const perm = await Notification.requestPermission();
  if (perm !== 'granted') throw new Error('通知が許可されませんでした。設定アプリ → 通知 から許可してください');
  const { messaging, msg } = await init();
  const reg = await navigator.serviceWorker.ready;
  const token = await msg.getToken(messaging, { vapidKey, serviceWorkerRegistration: reg });
  if (!token) throw new Error('通知用のトークンを取得できませんでした');
  await sync({ ...payload, token, enabled: true });
  return token;
}

export async function disable() {
  if (!isConfigured()) return;
  await sync({ enabled: false });
}

let pending = null;
export async function sync(payload) {
  if (!isConfigured()) return;
  const { auth, db, fs } = await init();
  const ref = fs.doc(db, 'devices', auth.currentUser.uid);
  pending = fs.setDoc(ref, { ...payload, tz: Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Tokyo', updatedAt: fs.serverTimestamp() }, { merge: true });
  return pending;
}

// サーバーからテスト通知を送ってもらう(5分以内に届く)
export async function requestServerTest() {
  await sync({ testRequested: true });
}
