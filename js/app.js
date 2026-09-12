import { checkLogin } from './lib/validate.js';
import { createBackend } from './db.js';
import { firebaseConfig } from '../firebase-config.js';
import { initChat } from './chat.js';
import { initComposer } from './composer.js';

const $ = (id) => document.getElementById(id);

const SESSION_KEY = 'ism.session';
const MUTE_KEY = 'ism.muted';

// localStorage adapter with cross-tab change notification (storage events).
export function browserKv() {
  const cbs = new Set();
  window.addEventListener('storage', (e) => {
    if (e.key) for (const cb of cbs) cb(e.key);
  });
  return {
    getItem: (k) => localStorage.getItem(k),
    setItem: (k, v) => localStorage.setItem(k, v),
    removeItem: (k) => localStorage.removeItem(k),
    subscribe: (cb) => { cbs.add(cb); return () => cbs.delete(cb); },
  };
}

export function showToast(text, ms = 3500) {
  const t = $('toast');
  t.textContent = text;
  t.classList.remove('hidden');
  clearTimeout(showToast._timer);
  showToast._timer = setTimeout(() => t.classList.add('hidden'), ms);
}

function applyMuteIcon() {
  $('mute-btn').textContent = localStorage.getItem(MUTE_KEY) === '1' ? '🔕' : '🔔';
}

async function startChat(user) {
  $('login-screen').classList.add('hidden');
  $('chat-screen').classList.remove('hidden');

  const peer = user === 'Ishu' ? 'Sammy' : 'Ishu';
  $('my-name').textContent = user;
  $('my-avatar').textContent = user[0];
  $('peer-name').textContent = peer;
  $('chat-item-name').textContent = peer;
  $('peer-avatar').textContent = peer[0];
  $('peer-avatar2').textContent = peer[0];

  const { backend, demo } = await createBackend(firebaseConfig, user, browserKv());
  if (demo) $('demo-banner').classList.remove('hidden');

  backend.onConnection((online) => $('conn-status').classList.toggle('hidden', online));

  const els = {
    list: $('message-list'), typingBubble: $('typing-bubble'),
    typingText: $('typing-text'), typingFrom: $('typing-from'),
    scrollBottom: $('scroll-bottom'), lightbox: $('lightbox'),
    lightboxImg: $('lightbox-img'), itemPreview: $('chat-item-preview'),
    itemTime: $('chat-item-time'),
  };

  const composer = initComposer({
    els: {
      input: $('msg-input'), sendBtn: $('send-btn'), emojiBtn: $('emoji-btn'),
      emojiPanel: $('emoji-panel'), attachBtn: $('attach-btn'), fileInput: $('file-input'),
      quoteStrip: $('quote-strip'), quoteText: $('quote-text'), quoteFrom: $('quote-from'),
      quoteCancel: $('quote-cancel'),
    },
    backend, me: user, peer, showToast,
  });

  initChat({
    els, backend, me: user, peer,
    onRequestReply: (msg) => composer.setReply(msg),
  });

  applyMuteIcon();
  $('mute-btn').addEventListener('click', () => {
    localStorage.setItem(MUTE_KEY, localStorage.getItem(MUTE_KEY) === '1' ? '0' : '1');
    applyMuteIcon();
  });

  $('logout-btn').addEventListener('click', () => {
    backend.clearPresence();
    localStorage.removeItem(SESSION_KEY);
    location.reload();
  });
  window.addEventListener('beforeunload', () => backend.clearPresence());
}

$('login-form').addEventListener('submit', (e) => {
  e.preventDefault();
  const result = checkLogin($('login-username').value, $('login-password').value);
  if (!result.ok) {
    const err = $('login-error');
    err.textContent = result.error;
    err.classList.remove('hidden');
    return;
  }
  localStorage.setItem(SESSION_KEY, result.user);
  startChat(result.user);
});

// Restore session on reload (session value is just the validated username).
const saved = localStorage.getItem(SESSION_KEY);
if (saved === 'Ishu' || saved === 'Sammy') startChat(saved);
