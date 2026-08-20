import { initializeApp } from "https://www.gstatic.com/firebasejs/11.0.0/firebase-app.js";
import { getAuth, signInWithEmailAndPassword, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.0.0/firebase-auth.js";
import { getFirestore, collection, query, orderBy, getDocs } from "https://www.gstatic.com/firebasejs/11.0.0/firebase-firestore.js";
import { getStorage, ref, getDownloadURL } from "https://www.gstatic.com/firebasejs/11.0.0/firebase-storage.js";

const firebaseConfig = {
  apiKey: "AIzaSyBRchBbwiavnfYtGnJhJF0vcjyi3L7J3WE",
  authDomain: "voice-collector-cd355.firebaseapp.com",
  projectId: "voice-collector-cd355",
  storageBucket: "voice-collector-cd355.firebasestorage.app",
  messagingSenderId: "663959055443",
  appId: "1:663959055443:web:3de514e82864183b8f2aa6"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const storage = getStorage(app);

// --- DOM要素 ---
const loginSection = document.getElementById('login-section');
const emailInput = document.getElementById('admin-email');
const passwordInput = document.getElementById('admin-password');
const loginBtn = document.getElementById('login-btn');
const loginMsg = document.getElementById('login-msg');

const dashboardSection = document.getElementById('dashboard-section');
const summaryText = document.getElementById('summary-text');
const refreshBtn = document.getElementById('refresh-btn');
const logoutBtn = document.getElementById('logout-btn');
const recordingsList = document.getElementById('recordings-list');

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}

function formatDate(timestamp) {
  if (!timestamp) return '日時不明';
  const d = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
  return d.toLocaleString('ja-JP');
}

function extensionFromContentType(contentType) {
  if (!contentType) return 'webm';
  if (contentType.includes('mp4')) return 'm4a';
  if (contentType.includes('ogg')) return 'ogg';
  return 'webm';
}

// --- ログイン状態の監視 ---
onAuthStateChanged(auth, (user) => {
  if (user) {
    loginSection.style.display = 'none';
    dashboardSection.style.display = 'block';
    loadRecordings();
  } else {
    loginSection.style.display = 'block';
    dashboardSection.style.display = 'none';
  }
});

// --- ログイン処理 ---
loginBtn.addEventListener('click', async () => {
  const email = emailInput.value.trim();
  const password = passwordInput.value;

  if (!email || !password) {
    loginMsg.textContent = 'メールアドレスとパスワードを入力してください';
    return;
  }

  loginBtn.disabled = true;
  loginBtn.textContent = '確認中...';
  loginMsg.textContent = '';

  try {
    await signInWithEmailAndPassword(auth, email, password);
    passwordInput.value = '';
  } catch (err) {
    console.error('login error:', err);
    loginMsg.textContent = 'ログインに失敗しました。メールアドレスとパスワードをご確認ください';
  } finally {
    loginBtn.disabled = false;
    loginBtn.textContent = 'ログイン';
  }
});

passwordInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') loginBtn.click();
});

// --- ログアウト ---
logoutBtn.addEventListener('click', () => {
  signOut(auth);
});

// --- 録音一覧の取得・表示 ---
async function loadRecordings() {
  recordingsList.innerHTML = `<div class="recording-loading">読み込み中...</div>`;

  try {
    const q = query(collection(db, 'recordings'), orderBy('createdAt', 'desc'));
    const snap = await getDocs(q);

    if (snap.empty) {
      summaryText.textContent = '件数: 0件';
      recordingsList.innerHTML = `<div class="recording-empty">まだ送信された音声はありません</div>`;
      return;
    }

    summaryText.textContent = `件数: ${snap.size}件`;

    const rows = await Promise.all(snap.docs.map(async (docSnap) => {
      const data = docSnap.data();
      let downloadUrl = '';
      try {
        downloadUrl = await getDownloadURL(ref(storage, data.storagePath));
      } catch (err) {
        console.error('getDownloadURL error:', err, data.storagePath);
      }
      const ext = extensionFromContentType(data.contentType);

      return `
        <div class="recording-row">
          <div class="recording-header">
            <span class="recording-nickname">${escapeHtml(data.nickname || '(ニックネーム不明)')}</span>
            <span class="recording-date">${formatDate(data.createdAt)}</span>
          </div>
          ${downloadUrl
            ? `<audio controls src="${escapeHtml(downloadUrl)}"></audio>
               <a class="recording-download" href="${escapeHtml(downloadUrl)}" download="${escapeHtml(data.nickname || 'recording')}.${ext}">⬇️ ダウンロード</a>`
            : `<div class="recording-loading">音声の取得に失敗しました</div>`
          }
        </div>
      `;
    }));

    recordingsList.innerHTML = rows.join('');

  } catch (err) {
    console.error('loadRecordings error:', err);
    recordingsList.innerHTML = `<div class="recording-empty">読み込みに失敗しました</div>`;
  }
}

refreshBtn.addEventListener('click', loadRecordings);
