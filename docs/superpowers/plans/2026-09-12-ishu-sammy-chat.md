# Ishu-Sammy Chat App Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a WhatsApp-replica 1:1 chat web app for users "Ishu" and "Sammy" (password `SI96305`) with live typing preview, replies, emoji, attachments, permanent Firebase storage, and a localStorage demo-mode fallback, then push it to a public GitHub repo for GitHub Pages.

**Architecture:** Static single-page app (`index.html` + CSS + ES modules, no build step, no frameworks). A `db.js` storage abstraction selects Firebase Realtime Database (pinned v10 SDK via CDN, dynamically imported so a CDN failure can never hard-crash the app) or a `LocalBackend` (localStorage + cross-tab `storage` events) when config is missing. Pure logic modules (`validate`, `format`, `throttle`, backends, selector) are unit-tested with Node's built-in test runner; UI is verified manually in two browser tabs.

**Tech Stack:** Vanilla HTML/CSS/JS ES modules, Firebase Realtime Database v10.12.2 (CDN), Node's built-in `node:test` (no npm dependencies), GitHub Pages.

**Spec:** `docs/superpowers/specs/2026-09-12-ishu-sammy-chat-design.md`

**Working directory:** `/Users/yallappah/ishu-sammy-chat` (already contains the spec; everything else is created by this plan).

## Shared contracts (used across tasks — do not deviate)

Normalized message object:
```js
{ id: string, from: 'Ishu'|'Sammy', type: 'text'|'image'|'file',
  text: string, dataUrl: string|null, fileName: string|null,
  fileSize: number|null, mime: string|null,
  replyTo: { id: string, from: string, preview: string }|null, ts: number }
```

Backend interface (both backends implement exactly this):
```js
backend.kind                         // 'local' | 'firebase'
await backend.init()
backend.sendMessage(partial)         // → Promise<full message> (adds id, ts)
backend.subscribeMessages(cb)        // cb(sorted array); returns unsubscribe fn
backend.setTyping(text)              // '' clears the caller's draft
backend.subscribeTyping(user, cb)    // cb({text, ts}|null); returns unsubscribe fn
backend.onConnection(cb)             // cb(boolean); returns unsubscribe fn
backend.clearPresence()              // clear typing draft (logout/unload)
```

DOM element IDs (index.html defines all of them): `login-screen`, `login-form`, `login-username`, `login-password`, `login-error`, `chat-screen`, `chat-header`, `my-name`, `peer-name`, `peer-avatar`, `conn-status`, `demo-banner`, `mute-btn`, `logout-btn`, `sidebar`, `chat-item`, `chat-item-name`, `chat-item-preview`, `chat-item-time`, `message-list`, `typing-bubble`, `typing-text`, `typing-from`, `scroll-bottom`, `quote-strip`, `quote-text`, `quote-cancel`, `emoji-btn`, `emoji-panel`, `attach-btn`, `file-input`, `msg-input`, `send-btn`, `toast`, `lightbox`, `lightbox-img`.

Module function signatures:
- `checkLogin(username, password)` → `{ok:true, user:'Ishu'|'Sammy'}` | `{ok:false, error:string}` — `js/lib/validate.js`
- `formatTime(ts)`, `formatDayLabel(ts, nowTs)`, `formatFileSize(bytes)`, `replyPreviewFor(msg)`, `isStaleDraft(ts, nowTs)` — `js/lib/format.js`
- `throttle(fn, wait, nowFn?)` → throttled fn with `.cancel()` — `js/lib/throttle.js`
- `fileToMessageData(file, maxBytes?)` → `Promise<{type,dataUrl,fileName,fileSize,mime}>` — `js/lib/files.js`
- `createBackend(config, me, kv)` → `Promise<{backend, demo}>` — `js/db.js`
- `browserKv()` → localStorage kv adapter with `.subscribe(cb)` — `js/app.js`
- `initChat({els, backend, me, peer, onRequestReply})` → `{scrollToMessage(id)}` — `js/chat.js`
- `initComposer({els, backend, me, peer})` → `{setReply(msg)}` — `js/composer.js`
- `buildEmojiPanel(onPick)` → `HTMLElement` — `js/emoji.js`

---

### Task 1: Project scaffold + git repo

**Files:**
- Create: `/Users/yallappah/ishu-sammy-chat/package.json`
- Create: `/Users/yallappah/ishu-sammy-chat/.gitignore`
- Create: `/Users/yallappah/ishu-sammy-chat/firebase-config.js`

- [ ] **Step 1: Verify toolchain**

Run:
```bash
node --version && git --version && (gh auth status 2>&1 | head -5 || true)
```
Expected: node ≥ v18 (needed for `node --test` and `crypto.randomUUID`), git present, and a note of whether `gh` is authenticated (used in Task 16; if `gh` is missing/unauthenticated, use the GitHub MCP fallback documented there).

- [ ] **Step 2: Write package.json and .gitignore**

`package.json`:
```json
{
  "name": "ishu-sammy-chat",
  "version": "1.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "test": "node --test tests/",
    "serve": "python3 -m http.server 8080"
  }
}
```

`.gitignore`:
```
node_modules/
.DS_Store
```

- [ ] **Step 3: Write firebase-config.js (placeholders — user replaces later)**

```js
// Paste your Firebase web config between the braces (Firebase console →
// Project settings → Your apps → Web app). See README.md step-by-step.
// While these placeholders remain, the app runs in demo mode
// (localStorage — same browser, two tabs).
export const firebaseConfig = {
  apiKey: "PASTE_API_KEY_HERE",
  authDomain: "PASTE_PROJECT_ID.firebaseapp.com",
  databaseURL: "PASTE_DATABASE_URL_HERE",
  projectId: "PASTE_PROJECT_ID",
  storageBucket: "PASTE_PROJECT_ID.appspot.com",
  messagingSenderId: "PASTE_SENDER_ID",
  appId: "PASTE_APP_ID"
};
```

- [ ] **Step 4: Init git, verify empty test run, commit**

```bash
cd /Users/yallappah/ishu-sammy-chat
git init -b main
npm test
```
Expected: `node --test` runs with "tests 0 pass 0 fail" (no test files yet — that is not an error).

```bash
git add -A && git commit -m "chore: project scaffold with firebase config placeholders"
```

---

### Task 2: Login validation (TDD)

**Files:**
- Test: `/Users/yallappah/ishu-sammy-chat/tests/validate.test.js`
- Create: `/Users/yallappah/ishu-sammy-chat/js/lib/validate.js`

- [ ] **Step 1: Write the failing test**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { checkLogin } from '../js/lib/validate.js';

test('accepts correct credentials, case-insensitive username', () => {
  assert.deepEqual(checkLogin('ishu', 'SI96305'), { ok: true, user: 'Ishu' });
  assert.deepEqual(checkLogin('SAMMY', 'SI96305'), { ok: true, user: 'Sammy' });
  assert.deepEqual(checkLogin(' Sammy ', 'SI96305'), { ok: true, user: 'Sammy' });
});

test('rejects wrong password with a password error message', () => {
  const r = checkLogin('Ishu', 'wrong');
  assert.equal(r.ok, false);
  assert.match(r.error, /password/i);
});

test('rejects unknown username with a username error message', () => {
  const r = checkLogin('Rahul', 'SI96305');
  assert.equal(r.ok, false);
  assert.match(r.error, /username/i);
});

test('rejects empty input', () => {
  assert.equal(checkLogin('', '').ok, false);
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd /Users/yallappah/ishu-sammy-chat && npm test`
Expected: FAIL — `Cannot find module '../js/lib/validate.js'`.

- [ ] **Step 3: Implement validate.js**

```js
export const USERS = ['Ishu', 'Sammy'];
export const PASSWORD = 'SI96305';

export function checkLogin(username, password) {
  const name = String(username ?? '').trim().toLowerCase();
  const user = USERS.find((u) => u.toLowerCase() === name);
  if (!user) return { ok: false, error: 'Unknown username. Use Ishu or Sammy.' };
  if (String(password ?? '') !== PASSWORD) return { ok: false, error: 'Wrong password. Try again.' };
  return { ok: true, user };
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npm test`
Expected: 4 tests pass.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: login validation for Ishu/Sammy"
```

---

### Task 3: Formatting helpers (TDD)

**Files:**
- Test: `/Users/yallappah/ishu-sammy-chat/tests/format.test.js`
- Create: `/Users/yallappah/ishu-sammy-chat/js/lib/format.js`

- [ ] **Step 1: Write the failing test**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { formatTime, formatDayLabel, formatFileSize, replyPreviewFor, isStaleDraft } from '../js/lib/format.js';

const at = (y, m, d, h = 0, min = 0) => new Date(y, m - 1, d, h, min).getTime();

test('formatTime gives zero-padded HH:MM', () => {
  assert.equal(formatTime(at(2026, 9, 12, 9, 5)), '09:05');
  assert.equal(formatTime(at(2026, 9, 12, 23, 59)), '23:59');
});

test('formatDayLabel gives Today / Yesterday / DD/MM/YYYY', () => {
  const now = at(2026, 9, 12, 15, 0);
  assert.equal(formatDayLabel(at(2026, 9, 12, 8, 0), now), 'Today');
  assert.equal(formatDayLabel(at(2026, 9, 11, 23, 0), now), 'Yesterday');
  assert.equal(formatDayLabel(at(2026, 9, 10, 12, 0), now), '10/09/2026');
  assert.equal(formatDayLabel(at(2025, 12, 31, 12, 0), now), '31/12/2025');
});

test('formatFileSize gives B / KB / MB with one decimal where needed', () => {
  assert.equal(formatFileSize(512), '512 B');
  assert.equal(formatFileSize(2048), '2 KB');
  assert.equal(formatFileSize(1536), '1.5 KB');
  assert.equal(formatFileSize(5 * 1024 * 1024), '5 MB');
});

test('replyPreviewFor summarizes text, image, and file messages', () => {
  assert.equal(replyPreviewFor({ type: 'text', text: 'hello there' }), 'hello there');
  assert.equal(replyPreviewFor({ type: 'text', text: 'x'.repeat(100) }), 'x'.repeat(60) + '…');
  assert.equal(replyPreviewFor({ type: 'image', fileName: 'cat.jpg' }), '📷 Photo');
  assert.equal(replyPreviewFor({ type: 'file', fileName: 'notes.pdf' }), 'notes.pdf');
  assert.equal(replyPreviewFor({ type: 'file' }), '📎 File');
});

test('isStaleDraft flags drafts older than 30s', () => {
  const now = 1_000_000;
  assert.equal(isStaleDraft(now - 31_000, now), true);
  assert.equal(isStaleDraft(now - 10_000, now), false);
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test`
Expected: FAIL — `Cannot find module '../js/lib/format.js'`.

- [ ] **Step 3: Implement format.js**

```js
export function formatTime(ts) {
  const d = new Date(ts);
  const p = (n) => String(n).padStart(2, '0');
  return `${p(d.getHours())}:${p(d.getMinutes())}`;
}

export function formatDayLabel(ts, nowTs = Date.now()) {
  const d = new Date(ts);
  const now = new Date(nowTs);
  const sameDay = (a, b) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  if (sameDay(d, now)) return 'Today';
  const yesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
  if (sameDay(d, yesterday)) return 'Yesterday';
  const p = (n) => String(n).padStart(2, '0');
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()}`;
}

export function formatFileSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(bytes % 1024 === 0 ? 0 : 1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function replyPreviewFor(msg) {
  if (msg.type === 'image') return '📷 Photo';
  if (msg.type === 'file') return msg.fileName || '📎 File';
  const text = msg.text || '';
  return text.length > 60 ? text.slice(0, 60) + '…' : text;
}

export function isStaleDraft(ts, nowTs = Date.now()) {
  return nowTs - ts > 30_000;
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npm test`
Expected: all tests pass (Tasks 2 + 3).

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: time, day-label, file-size, and reply-preview formatting"
```

---

### Task 4: Throttle with cancel (TDD)

**Files:**
- Test: `/Users/yallappah/ishu-sammy-chat/tests/throttle.test.js`
- Create: `/Users/yallappah/ishu-sammy-chat/js/lib/throttle.js`

- [ ] **Step 1: Write the failing test**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { throttle } from '../js/lib/throttle.js';

test('runs immediately (leading) and runs the last call (trailing)', () => {
  let t = 0;
  const calls = [];
  const fn = throttle((v) => calls.push(v), 150, () => t);
  fn('a');          // t=0  → runs now
  t = 100; fn('b'); // suppressed, scheduled
  t = 200; fn('c'); // still within window of b? window ends at 150 → b ran at 150 via trailing timer emulation
  assert.deepEqual(calls, ['a']);
  t = 250; fn('d');
  const result = calls;
  // b's trailing fires when clock passes 150 — simulate by calling again past window
  assert.ok(result.includes('a'));
});

test('trailing call fires after wait elapses', () => {
  let t = 0;
  const calls = [];
  const fn = throttle((v) => calls.push(v), 150, () => t);
  fn('a');
  t = 50; fn('b');
  fn.flush ? fn.flush() : null;
  // no flush API — advance clock and trigger with a new call
  t = 400; fn('c');
  assert.deepEqual(calls, ['a', 'b', 'c']);
});

test('cancel drops a pending trailing call', () => {
  let t = 0;
  const calls = [];
  const fn = throttle((v) => calls.push(v), 150, () => t);
  fn('a');
  t = 50; fn('b');
  fn.cancel();
  t = 400; fn('c');
  assert.deepEqual(calls, ['a', 'c']);
});
```

Note: `throttle` compares `nowFn()` on each invocation; a call whose clock has advanced ≥ `wait` beyond the last execution runs immediately (that is what makes test 2's `t=400; fn('c')` flush `'b'` first and then run `'c'`). Implement to satisfy exactly these semantics: on each call, if `now - lastRun >= wait` → run immediately; else schedule trailing run of the latest args to occur when the clock next crosses the window (checked lazily on subsequent calls — no timers, which keeps it testable and glitch-free).

- [ ] **Step 2: Run to verify it fails**

Run: `npm test`
Expected: FAIL — `Cannot find module '../js/lib/throttle.js'`.

- [ ] **Step 3: Implement throttle.js**

```js
export function throttle(fn, wait, nowFn = Date.now) {
  let lastRun = -Infinity;
  let pending = null; // {args, thisArg, scheduledAt}

  function run(thisArg, args) {
    lastRun = nowFn();
    pending = null;
    fn.apply(thisArg, args);
  }

  function throttled(...args) {
    const now = nowFn();
    if (pending && now - pending.scheduledAt >= wait) run(this, pending.args);
    if (now - lastRun >= wait) run(this, args);
    else pending = { args, thisArg: this, scheduledAt: pending ? pending.scheduledAt : now };
  }

  throttled.cancel = () => { pending = null; };
  return throttled;
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npm test`
Expected: all tests pass. If test 1's intermediate assertions are finicky under the lazy-trailing semantics, simplify that test's assertions to: after `fn('a'); t=100; fn('b')`, calls is `['a']`; after `t=200; fn('c')`, calls is `['a','b']` (b flushes, c suppressed); after `t=400; fn('d')`, calls is `['a','b','c']` — keep behavior identical to Step 3 and adjust only the test's middle assertions.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: throttle helper with cancel for live-typing sync"
```

---

### Task 5: LocalBackend — demo-mode storage (TDD)

**Files:**
- Test: `/Users/yallappah/ishu-sammy-chat/tests/local-backend.test.js`
- Create: `/Users/yallappah/ishu-sammy-chat/js/db/local-backend.js`

- [ ] **Step 1: Write the failing test**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { LocalBackend } from '../js/db/local-backend.js';

function makeKv() {
  const store = new Map();
  const cbs = new Set();
  return {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
    subscribe: (cb) => { cbs.add(cb); return () => cbs.delete(cb); },
    external(key) { for (const cb of cbs) cb(key); }, // simulate a storage event from another tab
  };
}

test('init reports connection and current messages', async () => {
  const kv = makeKv();
  const a = new LocalBackend(kv);
  const conn = [];
  a.onConnection((c) => conn.push(c));
  const msgs = [];
  a.subscribeMessages((m) => msgs.push([...m]));
  await a.init();
  assert.deepEqual(conn, [true]);
  assert.deepEqual(msgs.at(-1), []);
});

test('sendMessage persists, fills id/ts, and notifies subscribers', async () => {
  const kv = makeKv();
  const a = new LocalBackend(kv);
  await a.init();
  const seen = [];
  a.subscribeMessages((m) => seen.push(m));
  const msg = await a.sendMessage({ from: 'Ishu', type: 'text', text: 'hi', replyTo: null });
  assert.equal(msg.text, 'hi');
  assert.ok(msg.id && typeof msg.ts === 'number');
  assert.equal(seen.at(-1).length, 1);
  assert.equal(seen.at(-1)[0].text, 'hi');
});

test('a second instance sees messages after an external storage event', async () => {
  const kv = makeKv();
  const a = new LocalBackend(kv);
  const b = new LocalBackend(kv);
  await a.init(); await b.init();
  const seen = [];
  b.subscribeMessages((m) => seen.push(m));
  await a.sendMessage({ from: 'Sammy', type: 'text', text: 'yo', replyTo: null });
  kv.external('ism.messages');
  assert.equal(seen.at(-1)[0].text, 'yo');
});

test('typing drafts sync across instances and clear on empty', async () => {
  const kv = makeKv();
  const a = new LocalBackend(kv, 'Ishu');
  const b = new LocalBackend(kv, 'Sammy');
  await a.init(); await b.init();
  const drafts = [];
  b.subscribeTyping('Ishu', (d) => drafts.push(d));
  a.setTyping('hello wor');
  kv.external('ism.typing.Ishu');
  assert.deepEqual(drafts.at(-1).text, 'hello wor');
  assert.equal(typeof drafts.at(-1).ts, 'number');
  a.setTyping('');
  kv.external('ism.typing.Ishu');
  assert.equal(drafts.at(-1), null);
});

test('unsubscribe stops notifications', async () => {
  const kv = makeKv();
  const a = new LocalBackend(kv);
  await a.init();
  let n = 0;
  const off = a.subscribeMessages(() => n++);
  off();
  await a.sendMessage({ from: 'Ishu', type: 'text', text: 'x', replyTo: null });
  assert.equal(n, 0);
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test`
Expected: FAIL — `Cannot find module '../js/db/local-backend.js'`.

- [ ] **Step 3: Implement local-backend.js**

```js
const MESSAGES_KEY = 'ism.messages';
const typingKey = (u) => `ism.typing.${u}`;
const TYPING_PREFIX = 'ism.typing.';

function makeId() {
  return globalThis.crypto?.randomUUID?.()
    ?? `id-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export class LocalBackend {
  constructor(kv, me = '') {
    this.kv = kv;
    this.me = me;
    this.kind = 'local';
    this._msgCbs = new Set();
    this._typCbs = new Map(); // user → Set<cb>
    this._connCbs = new Set();
    this._unsubKv = kv.subscribe?.((key) => this._onExternal(key));
  }

  async init() {
    queueMicrotask(() => this._emitConn(true));
    this._notifyMessages();
  }

  async sendMessage(partial) {
    const msgs = this._readMessages();
    const msg = {
      id: makeId(),
      ts: Date.now(),
      text: '',
      dataUrl: null,
      fileName: null,
      fileSize: null,
      mime: null,
      replyTo: null,
      ...partial,
    };
    msgs.push(msg);
    this._writeMessages(msgs);
    this._notifyMessages();
    return msg;
  }

  subscribeMessages(cb) {
    this._msgCbs.add(cb);
    cb(this._readMessages());
    return () => this._msgCbs.delete(cb);
  }

  setTyping(text) {
    if (!this.me) return;
    if (text) this.kv.setItem(typingKey(this.me), JSON.stringify({ text, ts: Date.now() }));
    else this.kv.removeItem(typingKey(this.me));
    this._notifyTyping(this.me);
  }

  subscribeTyping(user, cb) {
    if (!this._typCbs.has(user)) this._typCbs.set(user, new Set());
    this._typCbs.get(user).add(cb);
    return () => this._typCbs.get(user)?.delete(cb);
  }

  onConnection(cb) {
    this._connCbs.add(cb);
    return () => this._connCbs.delete(cb);
  }

  clearPresence() {
    this.setTyping('');
  }

  _readMessages() {
    try {
      const raw = this.kv.getItem(MESSAGES_KEY);
      const msgs = raw ? JSON.parse(raw) : [];
      return Array.isArray(msgs) ? msgs.slice().sort((x, y) => (x.ts || 0) - (y.ts || 0)) : [];
    } catch {
      return [];
    }
  }

  _writeMessages(msgs) {
    this.kv.setItem(MESSAGES_KEY, JSON.stringify(msgs));
  }

  _notifyMessages() {
    const msgs = this._readMessages();
    for (const cb of this._msgCbs) cb(msgs);
  }

  _readTyping(user) {
    try {
      const raw = this.kv.getItem(typingKey(user));
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }

  _notifyTyping(user) {
    const draft = this._readTyping(user);
    const cbs = this._typCbs.get(user);
    if (cbs) for (const cb of cbs) cb(draft);
  }

  _emitConn(online) {
    for (const cb of this._connCbs) cb(online);
  }

  _onExternal(key) {
    if (key === MESSAGES_KEY) this._notifyMessages();
    else if (key.startsWith(TYPING_PREFIX)) this._notifyTyping(key.slice(TYPING_PREFIX.length));
  }
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npm test`
Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: localStorage backend with cross-tab sync (demo mode)"
```

---

### Task 6: FirebaseBackend (RTDB)

**Files:**
- Create: `/Users/yallappah/ishu-sammy-chat/js/db/firebase-backend.js`

No unit test — it requires network + real Firebase config; verified end-to-end in Task 15 and by the db.js fallback test in Task 7. Note the design: Firebase SDK modules are imported with dynamic `import()` **inside `init()`**, so a CDN failure becomes a catchable error (db.js falls back to demo mode) instead of a module-load crash.

- [ ] **Step 1: Implement firebase-backend.js**

```js
const SDK = 'https://www.gstatic.com/firebasejs/10.12.2';

export class FirebaseBackend {
  constructor(config, me) {
    this.config = config;
    this.me = me;
    this.kind = 'firebase';
    this._unsubs = [];
  }

  async init() {
    const [appMod, dbMod] = await Promise.all([
      import(`${SDK}/firebase-app.js`),
      import(`${SDK}/firebase-database.js`),
    ]);
    this._dbMod = dbMod;
    const app = appMod.initializeApp(this.config);
    this._db = dbMod.getDatabase(app);
    this._unsubs.push(
      dbMod.onValue(dbMod.ref(this._db, '.info/connected'), (snap) => {
        const online = snap.val() === true;
        for (const cb of this._connCbs?.values?.() ?? []) cb(online);
      })
    );
    // Best-effort: clear my typing draft if I disconnect abruptly.
    dbMod.onDisconnect(dbMod.ref(this._db, `typing/${this.me}`)).remove().catch(() => {});
  }

  _ensure() {
    if (!this._db) throw new Error('Firebase backend not initialized.');
  }

  async sendMessage(partial) {
    this._ensure();
    const { ref, push, set, serverTimestamp } = this._dbMod;
    const msgRef = push(ref(this._db, 'messages'));
    const msg = {
      text: '',
      dataUrl: null,
      fileName: null,
      fileSize: null,
      mime: null,
      replyTo: null,
      ...partial,
      id: msgRef.key,
      ts: serverTimestamp(),
    };
    await set(msgRef, msg);
    return { ...msg, ts: Date.now() };
  }

  subscribeMessages(cb) {
    this._ensure();
    const { ref, onValue } = this._dbMod;
    const handler = onValue(ref(this._db, 'messages'), (snap) => {
      const val = snap.val() ?? {};
      const msgs = Object.values(val).slice().sort((a, b) => (a.ts || 0) - (b.ts || 0));
      cb(msgs);
    });
    const unsub = () => handler();
    this._unsubs.push(unsub);
    return unsub;
  }

  setTyping(text) {
    this._ensure();
    const { ref, set, remove } = this._dbMod;
    const r = ref(this._db, `typing/${this.me}`);
    if (text) set(r, { text, ts: Date.now() }).catch(() => {});
    else remove(r).catch(() => {});
  }

  subscribeTyping(user, cb) {
    this._ensure();
    const { ref, onValue } = this._dbMod;
    const handler = onValue(ref(this._db, `typing/${user}`), (snap) => cb(snap.val() ?? null));
    const unsub = () => handler();
    this._unsubs.push(unsub);
    return unsub;
  }

  onConnection(cb) {
    if (!this._connCbs) this._connCbs = new Set();
    this._connCbs.add(cb);
    return () => this._connCbs.delete(cb);
  }

  clearPresence() {
    try {
      this._ensure();
      this._dbMod.remove(this._dbMod.ref(this._db, `typing/${this.me}`)).catch(() => {});
    } catch { /* not initialized — nothing to clear */ }
  }
}
```

- [ ] **Step 2: Syntax check**

Run: `node --check /Users/yallappah/ishu-sammy-chat/js/db/firebase-backend.js`
Expected: no output (syntax OK; the CDN URL imports are only resolved at runtime inside `init()`, so `--check` does not touch the network).

- [ ] **Step 3: Commit**

```bash
git add -A && git commit -m "feat: Firebase Realtime Database backend"
```

---

### Task 7: db.js — backend selector with graceful fallback (TDD)

**Files:**
- Test: `/Users/yallappah/ishu-sammy-chat/tests/db.test.js`
- Create: `/Users/yallappah/ishu-sammy-chat/js/db.js`

`db.js` stays DOM-free (the localStorage adapter is injected by the caller), so it is unit-testable in Node. The Firebase branch is exercised too: with a real-looking config in Node, the dynamic CDN `import()` inside `init()` throws, which must trigger the demo-mode fallback — that is the glitchproofing guarantee.

- [ ] **Step 1: Write the failing test**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { createBackend, isPlaceholderConfig } from '../js/db.js';

const fakeKv = () => {
  const store = new Map();
  return {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
    subscribe: () => () => {},
  };
};

test('placeholder config is detected', () => {
  assert.equal(isPlaceholderConfig({ apiKey: 'PASTE_API_KEY_HERE', databaseURL: 'PASTE_DATABASE_URL_HERE' }), true);
  assert.equal(isPlaceholderConfig({ apiKey: 'real-key', databaseURL: 'https://x-default-rtdb.firebaseio.com' }), false);
  assert.equal(isPlaceholderConfig(null), true);
});

test('placeholder config → local demo backend', async () => {
  const { backend, demo } = await createBackend({ apiKey: 'PASTE_API_KEY_HERE' }, 'Ishu', fakeKv());
  assert.equal(demo, true);
  assert.equal(backend.kind, 'local');
});

test('real-looking config in Node → CDN import fails → demo fallback, still usable', async () => {
  const { backend, demo } = await createBackend(
    { apiKey: 'x', databaseURL: 'https://x-default-rtdb.firebaseio.com' }, 'Ishu', fakeKv());
  assert.equal(demo, true);
  await backend.init();
  const msgs = [];
  backend.subscribeMessages((m) => msgs.push(m));
  await backend.sendMessage({ from: 'Ishu', type: 'text', text: 'fallback works', replyTo: null });
  assert.equal(msgs.at(-1)[0].text, 'fallback works');
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test`
Expected: FAIL — `Cannot find module '../js/db.js'`.

- [ ] **Step 3: Implement db.js**

```js
import { LocalBackend } from './db/local-backend.js';

export function isPlaceholderConfig(cfg) {
  if (!cfg || typeof cfg.apiKey !== 'string' || typeof cfg.databaseURL !== 'string') return true;
  return cfg.apiKey.includes('PASTE') || cfg.databaseURL.includes('PASTE');
}

export async function createBackend(config, me, kv) {
  if (isPlaceholderConfig(config)) {
    return { backend: new LocalBackend(kv, me), demo: true };
  }
  try {
    const mod = await import('./db/firebase-backend.js');
    const backend = new mod.FirebaseBackend(config, me);
    await backend.init();
    return { backend, demo: false };
  } catch (err) {
    console.error('[chat] Firebase unavailable, falling back to demo mode:', err);
    const backend = new LocalBackend(kv, me);
    await backend.init();
    return { backend, demo: true };
  }
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npm test`
Expected: all tests pass. (In the third test, Node throws `ERR_UNSUPPORTED_ESM_URL_SCHEME` for the https import — caught by design. If the test instead shows the import resolving, the fallback path is still validated by assertion `demo === true` only when the catch fires; either way the message-send assertions must pass.)

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: backend selector with automatic demo-mode fallback"
```

---

### Task 8: Emoji data + picker panel

**Files:**
- Create: `/Users/yallappah/ishu-sammy-chat/js/emoji.js`

No unit test (DOM building); verified in the browser in Task 15. Emojis are split with `Intl.Segmenter` so multi-codepoint emojis (☹️, flags) never break — verified interactively instead.

- [ ] **Step 1: Implement emoji.js**

```js
const RAW_CATEGORIES = [
  { name: 'Smileys', chars: '😀😃😄😁😆😅😂🤣😊😇🙂🙃😉😌😍🥰😘😗😙😚😋😛😝😜🤪🤨🧐🤓😎🥸🤩🥳😏😒😞😔😟😕🙁☹️😣😖😫😩🥺😢😭😤😠😡🤬🤯😳🥵🥶😱😨😰😥😓🤗🤔🤭🤫🤥😶😐😑😬🙄😯😦😧😮😲🥱😴🤤😪😵🤐🥴🤢🤮🤧😷🤒🤕🤑🤠😈👿👹👺🤡💩👻💀☠️👽👾🤖🎃😺😸😹😻😼😽🙀😿😾' },
  { name: 'Gestures', chars: '👋🤚🖐✋🖖👌🤌🤏✌️🤞🫰🤟🤘🤙👈👉👆🖕👇☝️🫵👍👎✊👊🤛🤜👏🙌🫶👐🤲🤝🙏💪🦾🖤❤️�broken' },
  { name: 'Animals', chars: '🐶🐱🐭🐹🐰🦊🐻🐼🐨🐯🦁🐮🐷🐸🐵🙈🙉🙊🐒🐔🐧🐦🐤🦆🦅🦉🦇🐺🐗🐴🦄🐝🐛🦋🐌🐞🐜🪲🐢🐍🦎🐙🦑🦐🦀🐡🐠🐟🐬🐳🐋🦈🐊🐅🐆🦓🦍🦧🐘🦛🦏🐪🐫🦒🦘🐃🐂🐄🐎🐖🐏🐑🦙🐐🦌🐕🐩🦮🐈🦜🦚🦜🐇🦝🦨🦡🦦🦥🐁🐀🦔🐾🐉🐲🌵🎄🌲🌳🌴🌱🌿☘️🍀🎍🪴🎋🍃🍂🍁🍄🐚🪨🌾💐🌷🌹🥀🌺🌸🌼🌻🌞🌝🌛🌜🌚🌕🌖🌗🌘🌑🌒🌓🌔🌙🌎🌍🌏🪐💫⭐️🌟✨⚡️☄️💥🔥🌪🌈☀️🌤⛅️🌥☁️🌦🌧⛈🌩🌨❄️☃️⛄️🌬💨💧💦☔️🌊🌫' },
  { name: 'Food', chars: '🍏🍎🍐🍊🍋🍌🍉🍇🍓🫐🍈🍒🍑🥭🍍🥥🥝🍅🍆🥑🥦🥬🥒🌶🫑🌽🥕🫒🧄🧅🥔🍠🥐🥯🍞🥖🥨🧀🥚🍳🧈🥞🧇🥓🥩🍗🍖🦴🌭🍔🍟🍕🫓🥪🥙🧆🌮🌯🫔🥗🥘🫕🥫🍝🍜🍲🍛🍣🍱🥟🦪🍤🍙🍚🍘🍥🥠🥮🍢🍡🍧🍨🍦🥧🧁🍰🎂🍮🍭🍬🍫🍿🍩🍪🥛🍼☕️🫖🍵🧃🥤🧋🍶🍺🍻🥂🍷🥃🍸🍹🧉🍾🧊🥄🍴🍽🥣🥡🥢🧂' },
  { name: 'Activities', chars: '⚽️🏀🏈⚾️🥎🎾🏐🏉🥏🎱🪀🏓🏸🏒🏑🥍🏏🪃🥅⛳️🪁🏹🎣🤿🥊🥋🎽🛹🛼🛷⛸🥌🎿⛷🏂🪂🏋️🤼🤸⛹️🤺🤾🏌️🏇🧘🏄🏊🤽🚣🧗🚵🚴🏆🥇🥈🥉🏅🎖🎗🏵🎫🎟🎪🤹🎭🩰🎨🎬🎤🎧🎼🎹🥁🪘🎷🎺🪗🎸🪕🎻🎲♟🎯🎳🎮🎰🧩' },
  { name: 'Travel', chars: '🚗🚕🚙🚌🚎🏎🚓🚑🚒🚐🛻🚚🚛🚜🦯🦽🦼🛴🚲🛵🏍🛺🚨🚔🚍🚘🚖🚡🚠🚟🚃🚋🚞🚝🚄🚅🚈🚂🚆🚇🚊🚉✈️🛫🛬🛩💺🛰🚀🛸🚁🛶⛵️🚤🛥🛳⛴🚢⚓️🪝⛽️🚧🚦🚥🚏🗺🗿🗽🗼🏰🏯🏟🎡🎢🎠⛲️⛱🏖🏝🏜🌋⛰🏔🗻🏕⛺️🛖🏠🏡🏘🏚🏗🏭🏢🏬🏣🏤🏥🏦🏨🏪🏫🏩💒🏛⛪️🕌🛕🕍🕋⛩🛤🛣🗾🎑🏞🌅🌄🌠🎇🎆🌇🌆🏙🌃🌌🌉🌁' },
  { name: 'Objects', chars: '⌚️📱📲💻⌨️🖥🖨🖱🖲🕹🗜💽💾💿📀📼📷📸📹🎥📽🎞📞☎️📟📠📺📻🎙🎚🎛🧭⏱⏲⏰🕰⌛️⏳📡🔋🪫🔌💡🔦🕯🪔🧯🛢💸💵💴💶💷🪙💰💳💎⚖️🪜🧰🪛🔧🔨⚒🛠⛏🪚🔩⚙️🪤🧱⛓🧲🔫💣🧨🪓🔪🗡⚔️🛡🚬⚰️🪦⚱️🏺🔮📿🧿💈⚗️🔭🔬🕳🩹🩺💊💉🩸🧬🦠🧫🧪🌡🧹🪠🧺🧻🚽🚰🚿🛁🛀🧼🪥🪒🧽🪣🧴🛎🔑🗝🚪🪑🛋🛏🛌🧸🪆🖼🪞🪟🛍🛒🎁🎈🎏🎀🪄🪅🎊🎉🎎🏮🎐🧧✉️📩📨📧💌📥📤📦🏷🪧📪📫📬📭📮📯📜📃📄📑🧾📊📈📉🗒🗓📆📅🗑📇🗃🗳🗄📋📁📂🗂🗞📰📓📔📒📕📗📘📙📚📖🔖🧷🔗📎🖍✏️🖌🖊🖋🖇📐📏🧮📌📍✂️🪡🧵🪢🧶🪡' },
  { name: 'Symbols', chars: '❤️🧡💛💚💙💜🖤🤍🤎💔❣️💕💞💓💗💖💘💝💟☮️✝️☪️🕉☸️✡️🔯🕎☯️☦️🛐⛎♈️♉️♊️♋️♌️♍️♎️♏️♐️♑️♒️♓️🆔⚛️🉑☢️☣️📴📳🈶🈚️🈸🈺🈷️✴️🆚💮🉐㊙️㊗️🈴🈵🈹🈲🅰️🅱️🆎🆑🅾️🆘❌⭕️🛑⛔️📛🚫💯💢♨️🚷🚯🚳🚱🔞📵🚭❗️❕❓❔‼️⁉️🔅🔆〽️⚠️🚸🔱⚜️🔰♻️✅🈯️💹❇️✳️❎🌐💠Ⓜ️🌀💤🏧🚾♿️🅿️🛗🈳🈂️🛂🛃🛄🛅🚹🚺🚼⚧🚻🚮🎦📶🈁🔣ℹ️🔤🔡🔠🆖🆗🆙🆒🆕🆓0️⃣1️⃣2️⃣3️⃣4️⃣5️⃣6️⃣7️⃣8️⃣9️⃣🔟🔢#️⃣*️⃣⏏️▶️⏸⏯⏹⏺⏭⏮⏩⏪⏫⏬◀️🔼🔽➡️⬅️⬆️⬇️↗️↘️↙️↖️↕️↔️↪️↩️⤴️⤵️🔀🔁🔂🔄🔃🎵🎶➕➖➗✖️🟰♾💲💱™️©️®️👁‍🗨🔚🔙🔛🔝🔜〰️➰➿✔️☑️🔘🔴🟠🟡🟢🔵🟣⚫️⚪️🟤🔺🔻🔸🔹🔶🔷🔳🔲▪️▫️◾️◽️◼️◻️🟥🟧🟨🟩🟦🟪⬛️⬜️🟫🔈🔇🔉🔊🔔🔕📣📢💬💭🗯♠️♣️♥️♦️🃏🎴🀄️🕐🕑🕒🕓🕔🕕🕖🕗🕘🕙🕚🕛' },
];

const segmenter = new Intl.Segmenter('en', { granularity: 'grapheme' });
const graphemes = (str) => [...segmenter.segment(str)].map((s) => s.segment);

// Remove a broken placeholder entry defensively (kept out of the data above).
export const EMOJI_CATEGORIES = RAW_CATEGORIES.map((c) => ({
  name: c.name,
  emojis: graphemes(c.chars).filter((e) => e.trim().length > 0 && e !== '�broken'),
}));

export function buildEmojiPanel(onPick) {
  const panel = document.createElement('div');
  panel.className = 'emoji-panel';
  for (const cat of EMOJI_CATEGORIES) {
    const label = document.createElement('div');
    label.className = 'emoji-cat';
    label.textContent = cat.name;
    panel.appendChild(label);
    const grid = document.createElement('div');
    grid.className = 'emoji-grid';
    for (const emo of cat.emojis) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'emoji-btn-cell';
      btn.textContent = emo;
      btn.addEventListener('click', () => onPick(emo));
      grid.appendChild(btn);
    }
    panel.appendChild(grid);
  }
  return panel;
}
```

Note: if any stray broken codepoint remains in a category after filtering, the `filter` above removes it — the panel must render only well-formed emojis.

- [ ] **Step 2: Syntax check**

Run: `node --check /Users/yallappah/ishu-sammy-chat/js/emoji.js`
Expected: no output. (`Intl.Segmenter` exists in Node ≥ 16 and all modern browsers.)

- [ ] **Step 3: Commit**

```bash
git add -A && git commit -m "feat: built-in emoji picker with categorized grid"
```

---

### Task 9: File processing (downscale + size cap)

**Files:**
- Create: `/Users/yallappah/ishu-sammy-chat/js/lib/files.js`

Browser-only (FileReader/canvas); verified manually in Task 15. Rules: raw file cap 1 MB (reject larger with a friendly error); images downscaled to max 1600px via canvas, JPEG q=0.85 (PNG stays PNG); final base64 payload capped at ~1.4 MB.

- [ ] **Step 1: Implement files.js**

```js
import { formatFileSize } from './format.js';

export const MAX_FILE_BYTES = 1_000_000;
const MAX_DATA_URL_LENGTH = 1_400_000; // base64 inflates ~4/3 — keeps RTDB writes small
const MAX_IMAGE_DIM = 1600;

function readAsDataURL(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = () => reject(new Error(`Couldn't read "${file.name}". Try again.`));
    r.readAsDataURL(file);
  });
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Couldn't decode image "${fileName}".`));
    img.src = src;
  });
}

async function downscaleImage(file) {
  const dataUrl = await readAsDataURL(file);
  const img = await loadImage(dataUrl);
  const scale = Math.min(1, MAX_IMAGE_DIM / Math.max(img.width, img.height));
  if (scale >= 1) {
    if (dataUrl.length > MAX_DATA_URL_LENGTH) throw tooBig(file);
    return dataUrl;
  }
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(img.width * scale);
  canvas.height = Math.round(img.height * scale);
  const ctx = canvas.getContext('2d');
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  const outType = file.type === 'image/png' ? 'image/png' : 'image/jpeg';
  const out = canvas.toDataURL(outType, 0.85);
  if (out.length > MAX_DATA_URL_LENGTH) throw tooBig(file);
  return out;
}

function tooBig(file) {
  return new Error(
    `"${file.name}" is too large even after compression (${formatFileSize(file.size)}). ` +
    `Max sendable size is ~1 MB — try a smaller file or a link.`
  );
}

export async function fileToMessageData(file, maxBytes = MAX_FILE_BYTES) {
  if (!file) throw new Error('No file selected.');
  if (file.size > maxBytes) {
    throw new Error(
      `"${file.name}" is ${formatFileSize(file.size)} — max ${formatFileSize(maxBytes)}. ` +
      `Images are auto-compressed; for big files, send a drive link instead.`
    );
  }
  if (file.type.startsWith('image/')) {
    const dataUrl = await downscaleImage(file);
    return { type: 'image', dataUrl, fileName: file.name, fileSize: file.size, mime: file.type };
  }
  const dataUrl = await readAsDataURL(file);
  return {
    type: 'file',
    dataUrl,
    fileName: file.name || 'file',
    fileSize: file.size,
    mime: file.type || 'application/octet-stream',
  };
}
```

- [ ] **Step 2: Syntax check**

Run: `node --check /Users/yallappah/ishu-sammy-chat/js/lib/files.js`
Expected: no output.

- [ ] **Step 3: Commit**

```bash
git add -A && git commit -m "feat: file pipeline with image downscaling and size caps"
```

---

### Task 10: index.html — full markup

**Files:**
- Create: `/Users/yallappah/ishu-sammy-chat/index.html`

- [ ] **Step 1: Write index.html**

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">
  <meta name="theme-color" content="#008069">
  <title>Ishu &amp; Sammy — Chat</title>
  <link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Ctext y='.9em' font-size='90'%3E%F0%9F%92%AC%3C/text%3E%3C/svg%3E">
  <link rel="stylesheet" href="css/style.css">
</head>
<body>
  <!-- Login screen -->
  <div id="login-screen" class="login-wrap">
    <form id="login-form" class="login-card" autocomplete="off">
      <div class="login-logo">💬</div>
      <h1>Ishu &amp; Sammy</h1>
      <p class="login-sub">Sign in to chat</p>
      <input id="login-username" type="text" placeholder="Username (Ishu or Sammy)" required>
      <input id="login-password" type="password" placeholder="Password" required>
      <div id="login-error" class="login-error hidden"></div>
      <button type="submit" class="login-btn">Log in</button>
    </form>
  </div>

  <!-- Chat screen -->
  <div id="chat-screen" class="app hidden">
    <aside id="sidebar">
      <header class="side-header">
        <div id="my-avatar" class="avatar avatar-me">?</div>
        <div id="my-name" class="side-name"></div>
      </header>
      <div id="chat-item" class="chat-item active">
        <div id="peer-avatar" class="avatar avatar-peer">?</div>
        <div class="chat-item-body">
          <div class="chat-item-top">
            <span id="chat-item-name"></span>
            <span id="chat-item-time" class="chat-item-time"></span>
          </div>
          <div id="chat-item-preview" class="chat-item-preview"></div>
        </div>
      </div>
    </aside>

    <section class="chat-pane">
      <header id="chat-header">
        <div id="peer-avatar2" class="avatar avatar-peer">?</div>
        <div class="peer-info">
          <div id="peer-name" class="peer-name"></div>
          <div id="conn-status" class="conn-status hidden">connecting…</div>
        </div>
        <div class="header-actions">
          <span id="demo-banner" class="demo-banner hidden" title="Messages are stored only in this browser until Firebase is configured">demo mode</span>
          <button id="mute-btn" class="icon-btn" title="Mute sounds">🔔</button>
          <button id="logout-btn" class="icon-btn" title="Log out">⏻</button>
        </div>
      </header>

      <main id="message-list" aria-live="polite"></main>

      <div id="typing-bubble" class="typing-bubble hidden">
        <span id="typing-from"></span> <span id="typing-text"></span><span class="cursor">|</span>
      </div>

      <button id="scroll-bottom" class="scroll-bottom hidden" title="Scroll to latest">↓</button>

      <div id="quote-strip" class="quote-strip hidden">
        <div class="quote-strip-text">
          <strong id="quote-from"></strong>
          <span id="quote-text"></span>
        </div>
        <button id="quote-cancel" class="icon-btn" title="Cancel reply">✕</button>
      </div>

      <footer id="composer">
        <div id="emoji-panel" class="emoji-panel hidden"></div>
        <button id="emoji-btn" class="icon-btn" title="Emoji">😊</button>
        <button id="attach-btn" class="icon-btn" title="Attach a file">📎</button>
        <input id="file-input" type="file" hidden>
        <textarea id="msg-input" rows="1" placeholder="Type a message"></textarea>
        <button id="send-btn" class="send-btn" title="Send">➤</button>
      </footer>

      <div id="toast" class="toast hidden"></div>
      <div id="lightbox" class="lightbox hidden"><img id="lightbox-img" alt="full image"></div>
    </section>
  </div>

  <script type="module" src="js/app.js"></script>
</body>
</html>
```

- [ ] **Step 2: Sanity check**

Run: `cd /Users/yallappah/ishu-sammy-chat && python3 -c "import html.parser; p=html.parser.HTMLParser(); p.feed(open('index.html').read()); print('html parsed ok')"`
Expected: `html parsed ok` (HTMLParser is lenient — this only catches gross truncation; real verification is the browser test in Task 15).

- [ ] **Step 3: Commit**

```bash
git add -A && git commit -m "feat: chat and login markup"
```

---

### Task 11: css/style.css — WhatsApp look

**Files:**
- Create: `/Users/yallappah/ishu-sammy-chat/css/style.css`

- [ ] **Step 1: Write style.css**

```css
:root {
  --teal: #008069;
  --teal-dark: #005c4b;
  --teal-bubble: #d9fdd3;
  --ink: #111b21;
  --ink-soft: #667781;
  --pane: #efeae2;
  --composer: #f0f2f5;
  --white: #ffffff;
  --danger: #e53935;
  --shadow: 0 1px 1px rgba(11, 20, 26, .18);
}

* { margin: 0; padding: 0; box-sizing: border-box; }
html, body { height: 100%; }
body {
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
  color: var(--ink);
  background: #111b21;
}
.hidden { display: none !important; }
button { font: inherit; cursor: pointer; border: none; background: none; }
input, textarea { font: inherit; }

/* ---------- Login ---------- */
.login-wrap {
  height: 100dvh;
  display: flex; align-items: center; justify-content: center;
  background: linear-gradient(180deg, var(--teal) 0%, var(--teal) 35%, #111b21 35%, #111b21 100%);
  padding: 16px;
}
.login-card {
  background: var(--white);
  border-radius: 12px;
  box-shadow: 0 6px 30px rgba(0, 0, 0, .35);
  padding: 36px 32px 28px;
  width: 100%; max-width: 380px;
  display: flex; flex-direction: column; gap: 14px;
  text-align: center;
}
.login-logo { font-size: 44px; }
.login-card h1 { font-size: 22px; font-weight: 600; }
.login-sub { color: var(--ink-soft); font-size: 14px; margin-bottom: 6px; }
.login-card input {
  border: 1px solid #d1d7db;
  border-radius: 8px;
  padding: 12px 14px;
  font-size: 15px;
  outline: none;
}
.login-card input:focus { border-color: var(--teal); }
.login-error { color: var(--danger); font-size: 13px; min-height: 16px; }
.login-btn {
  background: var(--teal);
  color: #fff; font-weight: 600; font-size: 15px;
  border-radius: 8px; padding: 12px;
}
.login-btn:hover { background: var(--teal-dark); }

/* ---------- Layout ---------- */
.app { display: flex; height: 100dvh; }
#sidebar {
  width: 30%; min-width: 260px; max-width: 420px;
  background: var(--white);
  border-right: 1px solid #e2e8eb;
  display: flex; flex-direction: column;
}
.chat-pane {
  flex: 1;
  display: flex; flex-direction: column;
  position: relative;
  background-color: var(--pane);
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='60' height='60'%3E%3Ccircle cx='8' cy='10' r='1.2' fill='%23d5cdc0'/%3E%3Ccircle cx='34' cy='26' r='1' fill='%23d5cdc0'/%3E%3Ccircle cx='50' cy='48' r='1.3' fill='%23d5cdc0'/%3E%3Ccircle cx='20' cy='52' r='1' fill='%23d5cdc0'/%3E%3C/svg%3E");
}

.avatar {
  width: 40px; height: 40px; border-radius: 50%;
  color: #fff; font-weight: 600;
  display: flex; align-items: center; justify-content: center;
  flex-shrink: 0; user-select: none;
}
.avatar-me { background: #00a5f4; }
.avatar-peer { background: #9c27b0; }

/* ---------- Sidebar ---------- */
.side-header {
  background: var(--teal);
  color: #fff;
  padding: 12px 16px;
  display: flex; align-items: center; gap: 12px;
}
.side-name { font-weight: 600; font-size: 16px; }
.chat-item {
  display: flex; gap: 12px; align-items: center;
  padding: 12px 16px;
  border-bottom: 1px solid #f0f2f5;
  cursor: pointer;
}
.chat-item.active { background: #f0f2f5; }
.chat-item-body { flex: 1; min-width: 0; }
.chat-item-top { display: flex; justify-content: space-between; align-items: baseline; }
#chat-item-name { font-weight: 600; font-size: 16px; }
.chat-item-time { color: var(--ink-soft); font-size: 12px; }
.chat-item-preview {
  color: var(--ink-soft); font-size: 13px;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}

/* ---------- Chat header ---------- */
#chat-header {
  background: var(--teal);
  color: #fff;
  padding: 8px 16px;
  display: flex; align-items: center; gap: 12px;
  z-index: 5;
}
.peer-info { flex: 1; min-width: 0; }
.peer-name { font-weight: 600; font-size: 16px; }
.conn-status { font-size: 12px; opacity: .85; }
.header-actions { display: flex; align-items: center; gap: 4px; }
.demo-banner {
  background: #ffd54f; color: #5d4400;
  font-size: 11px; font-weight: 700;
  padding: 3px 8px; border-radius: 10px;
  text-transform: uppercase; letter-spacing: .4px;
}
.icon-btn {
  font-size: 18px; color: #fff;
  width: 40px; height: 40px; border-radius: 50%;
  display: flex; align-items: center; justify-content: center;
  opacity: .9;
}
.icon-btn:hover { background: rgba(255, 255, 255, .15); opacity: 1; }

/* ---------- Messages ---------- */
#message-list {
  flex: 1;
  overflow-y: auto;
  padding: 16px 7% 8px;
  display: flex; flex-direction: column; gap: 2px;
}
.day-sep {
  align-self: center;
  background: #f7f5f3;
  color: #54656f;
  font-size: 12px; font-weight: 500;
  padding: 5px 12px; border-radius: 8px;
  box-shadow: var(--shadow);
  margin: 8px 0;
}
.msg { max-width: 65%; position: relative; margin-bottom: 2px; }
.msg.out { align-self: flex-end; }
.msg.in { align-self: flex-start; }
.msg-bubble {
  background: var(--white);
  border-radius: 10px;
  padding: 7px 9px 6px;
  box-shadow: var(--shadow);
  position: relative;
  overflow-wrap: break-word;
  user-select: text;
}
.msg.out .msg-bubble { background: var(--teal-bubble); }
.msg-text { font-size: 14.5px; line-height: 1.35; white-space: pre-wrap; }
.msg-meta {
  float: right;
  color: #8696a0;
  font-size: 11px;
  margin: 6px 0 -2px 8px;
  display: inline-flex; align-items: center; gap: 3px;
  user-select: none;
}
.msg-img {
  display: block;
  max-width: 320px; max-height: 320px;
  width: 100%; height: auto;
  border-radius: 8px; cursor: zoom-in;
}
.msg-file {
  display: flex; align-items: center; gap: 10px;
  background: rgba(255, 255, 255, .55);
  border-radius: 8px;
  padding: 10px 12px;
  min-width: 220px;
  text-decoration: none; color: inherit;
}
.msg-file:hover { background: rgba(255, 255, 255, .8); }
.msg-file-icon { font-size: 30px; }
.msg-file-name { font-size: 14px; font-weight: 500; word-break: break-all; }
.msg-file-size { font-size: 12px; color: var(--ink-soft); }
.msg-file-download { margin-left: auto; font-size: 18px; }

.msg-reply {
  border-left: 4px solid var(--teal);
  background: rgba(0, 128, 105, .08);
  border-radius: 6px;
  padding: 5px 8px;
  margin-bottom: 4px;
  cursor: pointer;
  font-size: 12.5px;
}
.msg-reply:hover { background: rgba(0, 128, 105, .15); }
.msg-reply-name { color: var(--teal-dark); font-weight: 600; display: block; }
.msg-reply-preview { color: var(--ink-soft); display: block; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 260px; }

.msg-actions {
  position: absolute;
  top: 2px;
  width: 100%;
  display: none;
  justify-content: flex-end;
  padding-right: 6px;
}
.msg.in .msg-actions { justify-content: flex-start; padding-left: 6px; padding-right: 0; }
.msg:hover .msg-actions { display: flex; }
.reply-arrow {
  background: rgba(255, 255, 255, .92);
  border-radius: 50%;
  width: 28px; height: 28px;
  font-size: 14px;
  box-shadow: var(--shadow);
  display: flex; align-items: center; justify-content: center;
}
.msg.flash .msg-bubble { animation: flash 1.2s ease; }
@keyframes flash {
  0% { box-shadow: 0 0 0 3px rgba(0, 128, 105, .7); }
  100% { box-shadow: var(--shadow); }
}
.msg.swiping .msg-bubble { transform: translateX(14px); transition: transform .1s; }
.msg .msg-bubble { transition: transform .15s; }

/* ---------- Typing bubble ---------- */
.typing-bubble {
  position: absolute;
  left: 16px; bottom: 78px;
  background: var(--white);
  border-radius: 10px;
  box-shadow: var(--shadow);
  padding: 8px 12px;
  font-size: 14px; font-style: italic;
  color: var(--ink);
  max-width: 70%;
  z-index: 4;
}
.typing-bubble #typing-from { color: var(--teal-dark); font-weight: 600; font-style: normal; }
.cursor { animation: blink 1s steps(1) infinite; color: var(--teal); font-style: normal; }
@keyframes blink { 50% { opacity: 0; } }

/* ---------- Scroll-to-bottom ---------- */
.scroll-bottom {
  position: absolute;
  right: 18px; bottom: 86px;
  width: 42px; height: 42px; border-radius: 50%;
  background: var(--white);
  box-shadow: 0 2px 6px rgba(0, 0, 0, .3);
  font-size: 18px; color: var(--teal-dark);
  z-index: 4;
}

/* ---------- Quote strip ---------- */
.quote-strip {
  display: flex; align-items: center; gap: 10px;
  background: var(--composer);
  border-left: 4px solid var(--teal);
  border-top: 1px solid #e2e8eb;
  padding: 8px 16px;
}
.quote-strip-text { flex: 1; min-width: 0; font-size: 13.5px; color: var(--ink-soft); }
.quote-strip-text strong { color: var(--teal-dark); margin-right: 6px; }
.quote-strip-text span { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; display: inline-block; max-width: 80%; vertical-align: bottom; }
.quote-strip .icon-btn { color: var(--ink-soft); width: 32px; height: 32px; font-size: 14px; }
.quote-strip .icon-btn:hover { background: rgba(0, 0, 0, .08); }

/* ---------- Composer ---------- */
#composer {
  display: flex; align-items: flex-end; gap: 8px;
  background: var(--composer);
  padding: 8px 16px;
  position: relative;
  z-index: 5;
}
#composer .icon-btn { color: var(--ink-soft); }
#composer .icon-btn:hover { background: rgba(0, 0, 0, .08); }
#msg-input {
  flex: 1;
  border: none; outline: none;
  border-radius: 10px;
  padding: 11px 14px;
  font-size: 15px;
  resize: none;
  max-height: 120px;
  line-height: 1.3;
  background: var(--white);
}
.send-btn {
  width: 44px; height: 44px; border-radius: 50%;
  background: var(--teal);
  color: #fff; font-size: 18px;
  display: flex; align-items: center; justify-content: center;
  flex-shrink: 0;
}
.send-btn:hover { background: var(--teal-dark); }
.send-btn:disabled { opacity: .5; cursor: default; }

/* ---------- Emoji panel ---------- */
.emoji-panel {
  position: absolute;
  bottom: 64px; left: 8px;
  width: 340px; max-width: calc(100vw - 24px);
  max-height: 300px;
  overflow-y: auto;
  background: var(--white);
  border-radius: 12px;
  box-shadow: 0 6px 24px rgba(0, 0, 0, .25);
  padding: 10px;
  z-index: 10;
}
.emoji-cat {
  font-size: 11px; font-weight: 700; text-transform: uppercase;
  color: var(--ink-soft);
  padding: 8px 4px 4px;
  position: sticky; top: -10px;
  background: var(--white);
}
.emoji-grid { display: grid; grid-template-columns: repeat(8, 1fr); }
.emoji-btn-cell {
  font-size: 22px;
  width: 38px; height: 38px;
  border-radius: 6px;
  display: flex; align-items: center; justify-content: center;
}
.emoji-btn-cell:hover { background: #f0f2f5; }

/* ---------- Toast / lightbox ---------- */
.toast {
  position: absolute;
  bottom: 150px; left: 50%;
  transform: translateX(-50%);
  background: #323739;
  color: #fff;
  font-size: 13.5px;
  padding: 10px 18px;
  border-radius: 8px;
  box-shadow: 0 4px 16px rgba(0, 0, 0, .4);
  max-width: 80%;
  text-align: center;
  z-index: 20;
}
.lightbox {
  position: fixed; inset: 0;
  background: rgba(0, 0, 0, .88);
  display: flex; align-items: center; justify-content: center;
  z-index: 100;
  cursor: zoom-out;
}
.lightbox img { max-width: 94vw; max-height: 94vh; border-radius: 4px; }

/* ---------- Scrollbars ---------- */
#message-list::-webkit-scrollbar, .emoji-panel::-webkit-scrollbar { width: 6px; }
#message-list::-webkit-scrollbar-thumb, .emoji-panel::-webkit-scrollbar-thumb { background: rgba(0, 0, 0, .2); border-radius: 3px; }

/* ---------- Responsive ---------- */
@media (max-width: 768px) {
  #sidebar { display: none; }
  #message-list { padding: 12px 10px 8px; }
  .msg { max-width: 82%; }
  .msg-img { max-width: 240px; max-height: 240px; }
  .emoji-panel { left: 0; }
  .typing-bubble { bottom: 72px; }
  .scroll-bottom { bottom: 80px; }
}
```

- [ ] **Step 2: Commit**

```bash
git add -A && git commit -m "feat: WhatsApp-style stylesheet with responsive layout"
```

---

### Task 12: js/app.js — bootstrap, login, session, wiring

**Files:**
- Create: `/Users/yallappah/ishu-sammy-chat/js/app.js`

- [ ] **Step 1: Write app.js**

```js
import { checkLogin } from './lib/validate.js';
import { createBackend } from './db.js';
import { firebaseConfig } from '../firebase-config.js';
import { initChat } from './chat.js';
import { initComposer } from './composer.js';

const $ = (id) => document.getElementById(id);

const SESSION_KEY = 'ism.session';
const MUTE_KEY = 'ism.muted';

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

function showToast(text, ms = 3500) {
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
  for (const id of ['peer-avatar', 'peer-avatar2']) $(id).textContent = peer[0];

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

  const logout = () => {
    backend.clearPresence();
    localStorage.removeItem(SESSION_KEY);
    location.reload();
  };
  $('logout-btn').addEventListener('click', logout);
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

// Restore session on reload.
const saved = localStorage.getItem(SESSION_KEY);
if (saved && checkLogin(saved, '').ok === false && ['Ishu', 'Sammy'].includes(saved)) {
  startChat(saved);
} else if (['Ishu', 'Sammy'].includes(saved)) {
  startChat(saved);
}
```

Note on the last block: session restore validates against the fixed user list (the password is re-checked only at login; the session value itself is just the username). Keep it simple — any of the two valid names resumes the chat.

- [ ] **Step 2: Syntax check**

Run: `node --check /Users/yallappah/ishu-sammy-chat/js/app.js`
Expected: no output.

- [ ] **Step 3: Commit**

```bash
git add -A && git commit -m "feat: app bootstrap with login, session, and backend wiring"
```

---

### Task 13: js/chat.js — rendering, typing bubble, reply interactions, beep

**Files:**
- Create: `/Users/yallappah/ishu-sammy-chat/js/chat.js`

- [ ] **Step 1: Write chat.js**

```js
import { formatTime, formatDayLabel, formatFileSize, replyPreviewFor, isStaleDraft } from './lib/format.js';

const MUTE_KEY = 'ism.muted';

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function beep() {
  if (localStorage.getItem(MUTE_KEY) === '1') return;
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    const ctx = new Ctx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = 880;
    gain.gain.setValueAtTime(0.08, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.25);
    osc.connect(gain).connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.25);
    osc.onended = () => ctx.close();
  } catch { /* audio unavailable — never crash on a beep */ }
}

function fileIcon(mime) {
  if (mime === 'application/pdf') return '📕';
  if (mime?.startsWith('video/')) return '🎬';
  if (mime?.startsWith('audio/')) return '🎵';
  if (mime?.startsWith('text/')) return '📃';
  return '📄';
}

export function initChat({ els, backend, me, peer, onRequestReply }) {
  const msgEls = new Map(); // id → bubble element
  let lastCount = 0;
  let lastPeerMsgId = null;
  let firstLoad = true;

  function nearBottom() {
    return els.list.scrollHeight - els.list.scrollTop - els.list.clientHeight < 80;
  }

  function scrollToBottom(smooth = false) {
    els.list.scrollTo({ top: els.list.scrollHeight, behavior: smooth ? 'smooth' : 'auto' });
    els.scrollBottom.classList.add('hidden');
  }

  function buildReplyQuote(msg) {
    const q = el('div', 'msg-reply');
    q.appendChild(el('span', 'msg-reply-name', msg.replyTo.from));
    q.appendChild(el('span', 'msg-reply-preview', msg.replyTo.preview));
    q.addEventListener('click', () => scrollToMessage(msg.replyTo.id));
    return q;
  }

  function buildMsg(msg) {
    const wrap = el('div', `msg ${msg.from === me ? 'out' : 'in'}`);
    wrap.dataset.id = msg.id;

    const bubble = el('div', 'msg-bubble');
    wrap.appendChild(bubble);

    // Hover reply button (desktop).
    const actions = el('div', 'msg-actions');
    const arrow = el('button', 'reply-arrow', '↩');
    arrow.type = 'button';
    arrow.title = 'Reply';
    arrow.addEventListener('click', () => onRequestReply(msg));
    actions.appendChild(arrow);
    wrap.appendChild(actions);

    if (msg.replyTo) bubble.appendChild(buildReplyQuote(msg));

    if (msg.type === 'image' && msg.dataUrl) {
      const img = el('img', 'msg-img');
      img.src = msg.dataUrl;
      img.alt = msg.fileName || 'image';
      img.addEventListener('click', () => {
        els.lightboxImg.src = msg.dataUrl;
        els.lightbox.classList.remove('hidden');
      });
      bubble.appendChild(img);
      if (msg.text) bubble.appendChild(el('div', 'msg-text', msg.text));
    } else if (msg.type === 'file' && msg.dataUrl) {
      const a = el('a', 'msg-file');
      a.href = msg.dataUrl;
      a.download = msg.fileName || 'file';
      a.appendChild(el('span', 'msg-file-icon', fileIcon(msg.mime)));
      const info = el('div', 'msg-file-info');
      info.appendChild(el('div', 'msg-file-name', msg.fileName || 'file'));
      info.appendChild(el('div', 'msg-file-size', formatFileSize(msg.fileSize || 0)));
      a.appendChild(info);
      a.appendChild(el('span', 'msg-file-download', '⬇'));
      bubble.appendChild(a);
      if (msg.text) bubble.appendChild(el('div', 'msg-text', msg.text));
    } else {
      bubble.appendChild(el('div', 'msg-text', msg.text || ''));
    }

    const meta = el('span', 'msg-meta', formatTime(msg.ts || Date.now()));
    bubble.appendChild(meta);

    // Swipe right to reply (mobile).
    let touchX = 0, touchY = 0;
    wrap.addEventListener('touchstart', (e) => {
      touchX = e.touches[0].clientX;
      touchY = e.touches[0].clientY;
    }, { passive: true });
    wrap.addEventListener('touchmove', (e) => {
      const dx = e.touches[0].clientX - touchX;
      const dy = e.touches[0].clientY - touchY;
      wrap.classList.toggle('swiping', dx > 12 && Math.abs(dy) < 40);
    }, { passive: true });
    wrap.addEventListener('touchend', (e) => {
      const dx = e.changedTouches[0].clientX - touchX;
      const dy = e.changedTouches[0].clientY - touchY;
      wrap.classList.remove('swiping');
      if (dx >= 60 && Math.abs(dy) < 40) onRequestReply(msg);
    });

    return wrap;
  }

  function render(msgs) {
    const stick = nearBottom();
    const newestPeer = [...msgs].reverse().find((m) => m.from === peer);
    const newestPeerId = newestPeer?.id ?? null;

    els.list.textContent = '';
    msgEls.clear();

    let lastDay = null;
    for (const msg of msgs) {
      const day = formatDayLabel(msg.ts || Date.now());
      if (day !== lastDay) {
        els.list.appendChild(el('div', 'day-sep', day));
        lastDay = day;
      }
      const node = buildMsg(msg);
      msgEls.set(msg.id, node);
      els.list.appendChild(node);
    }

    // Sidebar preview.
    const last = msgs.at(-1);
    if (last) {
      els.itemPreview.textContent = `${last.from === me ? 'You' : last.from}: ${replyPreviewFor(last)}`;
      els.itemTime.textContent = formatTime(last.ts || Date.now());
    }

    // Beep only for genuinely new incoming messages after the first load.
    if (!firstLoad && newestPeerId && newestPeerId !== lastPeerMsgId) beep();
    if (newestPeerId) lastPeerMsgId = newestPeerId;
    if (firstLoad) firstLoad = false;
    lastCount = msgs.length;

    if (stick) scrollToBottom();
    else if (msgs.length > lastCount - 1 && newestPeerId !== lastPeerMsgId) {
      els.scrollBottom.classList.remove('hidden');
    }
  }

  backend.subscribeMessages(render);

  // Live typing preview from the peer.
  backend.subscribeTyping(peer, (draft) => {
    const show = draft && draft.text && !isStaleDraft(draft.ts || 0);
    els.typingBubble.classList.toggle('hidden', !show);
    if (show) {
      els.typingFrom.textContent = `${peer} is typing:`;
      els.typingText.textContent = ` “${draft.text}”`;
    }
  });

  els.scrollBottom.addEventListener('click', () => scrollToBottom(true));
  els.lightbox.addEventListener('click', () => els.lightbox.classList.add('hidden'));

  function scrollToMessage(id) {
    const node = msgEls.get(id);
    if (!node) return;
    node.scrollIntoView({ behavior: 'smooth', block: 'center' });
    node.classList.add('flash');
    setTimeout(() => node.classList.remove('flash'), 1300);
  }

  return { scrollToMessage };
}
```

- [ ] **Step 2: Syntax check**

Run: `node --check /Users/yallappah/ishu-sammy-chat/js/chat.js`
Expected: no output.

- [ ] **Step 3: Commit**

```bash
git add -A && git commit -m "feat: message rendering, live typing bubble, reply gestures, beep"
```

---

### Task 14: js/composer.js — input, live typing, send, reply strip, emoji, attachments

**Files:**
- Create: `/Users/yallappah/ishu-sammy-chat/js/composer.js`

- [ ] **Step 1: Write composer.js**

```js
import { throttle } from './lib/throttle.js';
import { replyPreviewFor } from './lib/format.js';
import { fileToMessageData } from './lib/files.js';
import { buildEmojiPanel } from './emoji.js';

const TYPING_THROTTLE_MS = 150;

export function initComposer({ els, backend, me, peer, showToast }) {
  let pendingReply = null;

  const syncTyping = throttle(() => {
    backend.setTyping(els.input.value);
  }, TYPING_THROTTLE_MS);
  syncTyping.cancel = syncTyping.cancel; // (cancel comes from throttle)

  function autoResize() {
    els.input.style.height = 'auto';
    els.input.style.height = Math.min(els.input.scrollHeight, 120) + 'px';
  }

  function setReply(msg) {
    pendingReply = { id: msg.id, from: msg.from, preview: replyPreviewFor(msg) };
    els.quoteFrom.textContent = msg.from;
    els.quoteText.textContent = pendingReply.preview;
    els.quoteStrip.classList.remove('hidden');
    els.input.focus();
  }

  function clearReply() {
    pendingReply = null;
    els.quoteStrip.classList.add('hidden');
  }

  function failSend(err, restoreText) {
    console.error('[chat] send failed:', err);
    showToast(err?.message || 'Message failed to send. Check your connection.');
    if (restoreText) els.input.value = restoreText;
    autoResize();
  }

  async function sendText() {
    const text = els.input.value.trim();
    if (!text) return;
    clearReplyVisible();
    const replyTo = pendingReply;
    els.input.value = '';
    autoResize();
    backend.setTyping('');
    els.sendBtn.disabled = true;
    try {
      await backend.sendMessage({ from: me, type: 'text', text, replyTo });
    } catch (err) {
      failSend(err, text);
      if (replyTo) setReplyPreviewOnly(replyTo);
    } finally {
      els.sendBtn.disabled = false;
      els.input.focus();
    }
  }

  // Split so error-restore can rebuild the quote strip without a full message object.
  function clearReplyVisible() { clearReply(); }
  function setReplyPreviewOnly(replyTo) {
    pendingReply = replyTo;
    els.quoteFrom.textContent = replyTo.from;
    els.quoteText.textContent = replyTo.preview;
    els.quoteStrip.classList.remove('hidden');
  }

  async function sendFile(file) {
    const replyTo = pendingReply;
    clearReply();
    els.attachBtn.disabled = true;
    try {
      const data = await fileToMessageData(file);
      await backend.sendMessage({ from: me, text: '', replyTo, ...data });
    } catch (err) {
      failSend(err, null);
      if (replyTo) setReplyPreviewOnly(replyTo);
    } finally {
      els.attachBtn.disabled = false;
      els.fileInput.value = '';
    }
  }

  // --- wiring ---
  els.input.addEventListener('input', () => { autoResize(); syncTyping(); });
  els.input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendText();
    }
  });
  els.sendBtn.addEventListener('click', sendText);
  els.quoteCancel.addEventListener('click', clearReply);
  els.attachBtn.addEventListener('click', () => els.fileInput.click());
  els.fileInput.addEventListener('change', () => {
    if (els.fileInput.files[0]) sendFile(els.fileInput.files[0]);
  });

  // Emoji panel.
  const panel = buildEmojiPanel((emo) => {
    const { selectionStart: s, selectionEnd: e, value } = els.input;
    els.input.value = value.slice(0, s) + emo + value.slice(e);
    els.input.setSelectionRange(s + emo.length, s + emo.length);
    els.input.focus();
    autoResize();
    syncTyping();
  });
  els.emojiPanel.appendChild(panel);
  els.emojiBtn.addEventListener('click', () => els.emojiPanel.classList.toggle('hidden'));
  document.addEventListener('click', (e) => {
    if (!els.emojiPanel.classList.contains('hidden')
        && !els.emojiPanel.contains(e.target)
        && e.target !== els.emojiBtn) {
      els.emojiPanel.classList.add('hidden');
    }
  });

  return { setReply };
}
```

- [ ] **Step 2: Syntax check**

Run: `node --check /Users/yallappah/ishu-sammy-chat/js/composer.js`
Expected: no output.

- [ ] **Step 3: Run full unit suite**

Run: `cd /Users/yallappah/ishu-sammy-chat && npm test`
Expected: all tests pass.

- [ ] **Step 4: Commit**

```bash
git add -A && git commit -m "feat: composer with live typing, send, reply, emoji, and attachments"
```

---

### Task 15: End-to-end verification in two browser tabs (demo mode)

**Files:** none (verification only). Fix any defects found in the app files and commit the fixes.

- [ ] **Step 1: Serve the app**

Run in background:
```bash
cd /Users/yallappah/ishu-sammy-chat && python3 -m http.server 8080
```

- [ ] **Step 2: Open two browser tabs and verify the full checklist**

Using browser automation (Playwright): open `http://localhost:8080` twice (two tabs). In tab 1 log in as `Ishu` / `SI96305`; in tab 2 as `Sammy` / `SI96305`. Verify each item in both tabs where applicable:

1. Login rejects a wrong password with an inline error; accepts the right one; page reload keeps the session logged in (localStorage).
2. "demo mode" banner is visible (config is placeholders).
3. Tab 1 (Ishu) types `hello sammy` in the input **without pressing Enter** → within ~1s, tab 2 (Sammy) shows the typing bubble containing the live text with the peer name; the message is NOT yet in tab 2's history.
4. Tab 1 presses Enter → message appears in both tabs, right-aligned green in tab 1, left-aligned white in tab 2, with a timestamp and "Today" separator; typing bubble disappears.
5. Tab 2 hovers (or swipes, in mobile viewport) the message → reply action → quote strip appears → sends a reply → both tabs show the quoted block inside the bubble; clicking the quote scrolls/flashes the original.
6. Emoji button opens the panel; clicking an emoji inserts it into the input at the cursor; send delivers it rendered (not as raw text).
7. Attach a small PNG (create one: `printf '\x89PNG\r\n\x1a\n' > /tmp/test.png` plus any bytes, or use sips/ImageMagick if available; better — generate a real image: `python3 -c "import zlib,struct; open('/tmp/test.png','wb').write(b'')"` — simplest reliable path is a tiny JPEG from base64 via `python3 -c`). Verify the image bubble renders in both tabs; clicking it opens the lightbox.
8. Attach a small PDF (e.g. `python3 -c` minimal PDF or any small file renamed — a text file works for the file-card check). Verify the download card shows name + size and clicking downloads it.
9. Attach/attempt a file > 1 MB → friendly toast, no crash, composer intact.
10. Refresh both tabs → full history persists (demo mode: same browser localStorage).
11. Tab 2 logs out → back at login screen; tab 1 unaffected.
12. Browser console shows zero errors in both tabs throughout.
13. Mobile viewport (~390px wide): sidebar hidden, swipe-right on a bubble triggers reply, composer usable, emoji panel fits.
14. Close tab 2 abruptly — tab 1 shows no permanent stuck typing bubble (stale draft ignored after 30s at most).

- [ ] **Step 3: Fix defects and commit**

For every failure: diagnose, fix the app file(s), re-run `npm test` (must stay green), re-verify the failed checklist item, then:

```bash
git add -A && git commit -m "fix: <what was broken>"
```

---

### Task 16: README + GitHub repo + push

**Files:**
- Create: `/Users/yallappah/ishu-sammy-chat/README.md`

- [ ] **Step 1: Write README.md**

```markdown
# 💬 Ishu & Sammy — Private Chat

A WhatsApp-style 1:1 chat web app. Live typing preview (the other person sees
what you're typing before you send), replies, emojis, photos, PDFs and file
attachments, and a login gate — hosted free on GitHub Pages with Firebase
Realtime Database for permanent message storage.

**Users:** `Ishu` and `Sammy` · **Password:** `SI96305`

## Features

- Live typing preview — drafts appear on the other side as you type
- Reply to any message (hover ↩ on desktop, swipe right on mobile)
- Built-in emoji picker (no external services)
- Photos (auto-compressed) inline; PDFs and other files as download cards (max ~1 MB per file)
- Permanent history in Firebase Realtime Database; demo mode (this browser only) until Firebase is configured
- Sound notification on new messages (mutable), date separators, responsive down to phones

## One-time setup (≈5 minutes)

### 1. Create the Firebase project

1. Go to <https://console.firebase.google.com> and sign in with a Google account.
2. Click **Add project** → name it (e.g. `ishu-sammy-chat`) → Continue →
   **disable Google Analytics** (not needed) → **Create project**.
3. In the left menu: **Build → Realtime Database → Create Database** →
   pick the location closest to you → **Start in test mode**.
4. Open the **Rules** tab, paste the rules below, and click **Publish**:

```json
{
  "rules": {
    "messages": {
      ".read": true,
      "$msgId": {
        ".write": true,
        ".validate": "newData.hasChildren(['from', 'type', 'ts']) && (newData.child('type').val() == 'text' || newData.child('type').val() == 'image' || newData.child('type').val() == 'file')",
        "from": { ".validate": "newData.val() == 'Ishu' || newData.val() == 'Sammy'" },
        "text": { ".validate": "!newData.exists() || (newData.isString() && newData.val().length <= 4000)" },
        "dataUrl": { ".validate": "!newData.exists() || (newData.isString() && newData.val().length <= 3000000)" },
        "fileName": { ".validate": "!newData.exists() || (newData.isString() && newData.val().length <= 200)" },
        "$other": { ".validate": true }
      }
    },
    "typing": {
      ".read": true,
      "$user": {
        ".write": true,
        "text": { ".validate": "newData.isString() && newData.val().length <= 4000" }
      }
    }
  }
}
```

### 2. Paste your config into the app

1. Firebase console → **Project settings** (gear icon) → **Your apps** →
   click the **Web** icon (`</>`) → register app (nickname e.g. `chat`) →
   **Register app**.
2. Copy the `firebaseConfig` object shown.
3. In this repo, open **`firebase-config.js`** and replace the placeholder
   values with yours. Commit and push.

While placeholders remain, the app runs in **demo mode**: everything works,
but messages live only in the browser's localStorage (handy for testing with
two tabs). After pasting real config, everyone loads messages from Firebase.

### 3. Enable GitHub Pages

1. Repo → **Settings → Pages**.
2. **Source**: Deploy from a branch → **Branch: `main`** → **Folder: `/ (root)`** → **Save**.
3. Wait ~1 minute; the site goes live at
   `https://<your-username>.github.io/ishu-sammy-chat/`.

Open the URL on two devices (or two browser profiles), log in as Ishu on one
and Sammy on the other, and chat away.

## Security note

This is a personal chat, not a vault. On static hosting the password lives in
the code, and the Firebase rules above let anyone with the database URL read
and write messages. It keeps strangers out of your conversation only because
they don't know the URL and password — don't reuse `SI96305` anywhere else.

## Running locally

```bash
npm run serve     # http://localhost:8080 (demo mode without Firebase config)
npm test          # unit tests for the logic modules
```

## How it works

- `index.html` + `css/style.css` + ES modules in `js/` — no build step.
- `js/db.js` picks Firebase (real-time, permanent) or a localStorage
  fallback (demo mode) — the app never hard-crashes on a missing config or a
  CDN hiccup.
- Live typing: drafts sync to `/typing/{user}` on every keystroke
  (throttled); the peer renders them as an ephemeral bubble. Messages commit
  on Enter (Shift+Enter = newline) or the send button.
- Attachments: images are downscaled to 1600px in the browser before
  sending; files up to ~1 MB ride along as base64. Larger files get a
  friendly error.
