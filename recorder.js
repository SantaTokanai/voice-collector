import { initializeApp } from "https://www.gstatic.com/firebasejs/11.0.0/firebase-app.js";
import { getAuth, signInAnonymously } from "https://www.gstatic.com/firebasejs/11.0.0/firebase-auth.js";
import { getFirestore, collection, addDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/11.0.0/firebase-firestore.js";
import { getStorage, ref, uploadBytes } from "https://www.gstatic.com/firebasejs/11.0.0/firebase-storage.js";

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

const MAX_SECONDS = 10;

// --- DOM要素 ---
const nicknameInput = document.getElementById('nickname-input');
const recordBtn = document.getElementById('record-btn');
const recordBtnLabel = document.getElementById('record-btn-label');
const timerDisplay = document.getElementById('timer-display');
const progressBar = document.getElementById('progress-bar');
const statusMsg = document.getElementById('status-msg');

const recorderSection = document.getElementById('recorder-section');
const playbackSection = document.getElementById('playback-section');
const doneSection = document.getElementById('done-section');

const playbackAudio = document.getElementById('playback-audio');
const rerecordBtn = document.getElementById('rerecord-btn');
const submitBtn = document.getElementById('submit-btn');
const recordAgainBtn = document.getElementById('record-again-btn');

playbackAudio.addEventListener('error', () => {
  console.error('playback error:', playbackAudio.error);
});

// --- 状態管理 ---
let mediaRecorder = null;
let mediaStream = null;
let recordedChunks = [];
let recordedBlob = null;
let recordStartTime = 0;
let timerRafId = null;
let currentUser = null;
let currentPlaybackUrl = null;

function setStatus(text, type = 'error') {
  statusMsg.textContent = text;
  statusMsg.className = 'status-msg' + (type === 'info' ? ' info' : '');
}

// --- 匿名ログイン（ユーザーには一切見せず、裏側で自動的に行う） ---
signInAnonymously(auth)
  .then((cred) => {
    currentUser = cred.user;
    recordBtn.disabled = false;
    setStatus('', 'info');
  })
  .catch((err) => {
    console.error('anonymous sign-in error:', err);
    setStatus('準備に失敗しました。ページを再読み込みしてください。');
  });

// --- 録音対応する音声形式を選ぶ ---
function pickMimeType() {
  const candidates = [
    'audio/webm;codecs=opus',
    'audio/webm',
    'audio/mp4',
    'audio/ogg;codecs=opus'
  ];
  for (const type of candidates) {
    if (window.MediaRecorder && MediaRecorder.isTypeSupported(type)) {
      return type;
    }
  }
  return ''; // ブラウザのデフォルトに任せる
}

function extensionFromMimeType(mimeType) {
  if (mimeType.includes('mp4')) return 'm4a';
  if (mimeType.includes('ogg')) return 'ogg';
  return 'webm';
}

// --- 録音開始 ---
async function startRecording() {
  const nickname = nicknameInput.value.trim();
  if (!nickname) {
    setStatus('先にニックネームを入力してください');
    nicknameInput.focus();
    return;
  }
  if (!currentUser) {
    setStatus('準備中です。少し待ってからもう一度お試しください');
    return;
  }

  try {
    mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true });
  } catch (err) {
    console.error('getUserMedia error:', err);
    setStatus('マイクへのアクセスが許可されていません。ブラウザの設定をご確認ください');
    return;
  }

  const mimeType = pickMimeType();
  try {
    mediaRecorder = mimeType
      ? new MediaRecorder(mediaStream, { mimeType })
      : new MediaRecorder(mediaStream);
  } catch (err) {
    console.error('MediaRecorder init error:', err);
    setStatus('このブラウザは録音に対応していません');
    stopMicStream();
    return;
  }

  recordedChunks = [];
  mediaRecorder.ondataavailable = (e) => {
    if (e.data && e.data.size > 0) recordedChunks.push(e.data);
  };
  mediaRecorder.onstop = handleRecordingStopped;

  mediaRecorder.start();
  recordStartTime = performance.now();

  nicknameInput.disabled = true;
  recordBtn.classList.add('is-recording');
  recordBtnLabel.textContent = '⏹️ 録音を止める';
  setStatus('録音中です...', 'info');

  tickTimer();
}

// --- タイマー表示・自動停止 ---
function tickTimer() {
  const elapsed = (performance.now() - recordStartTime) / 1000;
  const clamped = Math.min(elapsed, MAX_SECONDS);

  timerDisplay.textContent = `${clamped.toFixed(1)} / ${MAX_SECONDS.toFixed(1)} 秒`;
  progressBar.style.width = `${(clamped / MAX_SECONDS) * 100}%`;

  if (elapsed >= MAX_SECONDS) {
    stopRecording();
    return;
  }
  timerRafId = requestAnimationFrame(tickTimer);
}

// --- 録音停止 ---
function stopRecording() {
  if (timerRafId) {
    cancelAnimationFrame(timerRafId);
    timerRafId = null;
  }
  if (mediaRecorder && mediaRecorder.state !== 'inactive') {
    mediaRecorder.stop();
  }
}

function stopMicStream() {
  if (mediaStream) {
    mediaStream.getTracks().forEach(t => t.stop());
    mediaStream = null;
  }
}

function handleRecordingStopped() {
  stopMicStream();

  const mimeType = mediaRecorder.mimeType || 'audio/webm';
  recordedBlob = new Blob(recordedChunks, { type: mimeType });

  // 前回分のURLが残っていればメモリ解放してから、新しい再生用URLを作る
  if (currentPlaybackUrl) {
    URL.revokeObjectURL(currentPlaybackUrl);
  }
  currentPlaybackUrl = URL.createObjectURL(recordedBlob);
  playbackAudio.src = currentPlaybackUrl;
  playbackAudio.load();

  recorderSection.style.display = 'none';
  playbackSection.style.display = 'block';

  recordBtn.classList.remove('is-recording');
  recordBtnLabel.textContent = '🎙️ 録音を始める';
  setStatus('', 'info');
}

// --- 撮り直し ---
function resetToRecorder() {
  recordedBlob = null;
  playbackAudio.src = '';
  timerDisplay.textContent = `0.0 / ${MAX_SECONDS.toFixed(1)} 秒`;
  progressBar.style.width = '0%';
  nicknameInput.disabled = false;

  playbackSection.style.display = 'none';
  doneSection.style.display = 'none';
  recorderSection.style.display = 'block';
}

// --- 送信 ---
async function submitRecording() {
  if (!recordedBlob || !currentUser) return;

  const nickname = nicknameInput.value.trim();
  submitBtn.disabled = true;
  rerecordBtn.disabled = true;
  submitBtn.textContent = '送信中...';

  try {
    const mimeType = recordedBlob.type || 'audio/webm';
    const ext = extensionFromMimeType(mimeType);
    const fileName = `${Date.now()}.${ext}`;
    const storagePath = `recordings/${currentUser.uid}/${fileName}`;

    const storageRef = ref(storage, storagePath);
    await uploadBytes(storageRef, recordedBlob, { contentType: mimeType });

    await addDoc(collection(db, 'recordings'), {
      uid: currentUser.uid,
      nickname: nickname,
      storagePath: storagePath,
      contentType: mimeType,
      createdAt: serverTimestamp()
    });

    playbackSection.style.display = 'none';
    doneSection.style.display = 'block';

  } catch (err) {
    console.error('submit error:', err);
    setStatus('送信に失敗しました。もう一度お試しください');
    submitBtn.disabled = false;
    rerecordBtn.disabled = false;
    submitBtn.textContent = '✅ この内容を送信';
  }
}

// --- イベントリスナー ---
recordBtn.addEventListener('click', () => {
  if (mediaRecorder && mediaRecorder.state === 'recording') {
    stopRecording();
  } else {
    startRecording();
  }
});

rerecordBtn.addEventListener('click', resetToRecorder);

submitBtn.addEventListener('click', submitRecording);

recordAgainBtn.addEventListener('click', () => {
  nicknameInput.value = '';
  submitBtn.disabled = false;
  rerecordBtn.disabled = false;
  submitBtn.textContent = '✅ この内容を送信';
  resetToRecorder();
});
