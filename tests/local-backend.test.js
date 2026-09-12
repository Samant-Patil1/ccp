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
  const snapshots = [];
  a.subscribeMessages((m) => snapshots.push([...m]));
  await a.init();
  assert.deepEqual(conn, [true]);
  assert.deepEqual(snapshots.at(-1), []);
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
  await a.init();
  await b.init();
  const seen = [];
  b.subscribeMessages((m) => seen.push(m));
  await a.sendMessage({ from: 'Sammy', type: 'text', text: 'yo', replyTo: null });
  kv.external('ism.messages');
  assert.equal(seen.at(-1)[0].text, 'yo');
});

test('messages persist across re-instantiation (same kv)', async () => {
  const kv = makeKv();
  const a = new LocalBackend(kv);
  await a.init();
  await a.sendMessage({ from: 'Ishu', type: 'text', text: 'still here', replyTo: null });
  const b = new LocalBackend(kv); // "reopen the browser"
  await b.init();
  const seen = [];
  b.subscribeMessages((m) => seen.push(m));
  assert.equal(seen.at(-1)[0].text, 'still here');
});

test('typing drafts sync across instances and clear on empty', async () => {
  const kv = makeKv();
  const a = new LocalBackend(kv, 'Ishu');
  const b = new LocalBackend(kv, 'Sammy');
  await a.init();
  await b.init();
  const drafts = [];
  b.subscribeTyping('Ishu', (d) => drafts.push(d));
  a.setTyping('hello wor');
  kv.external('ism.typing.Ishu');
  assert.equal(drafts.at(-1).text, 'hello wor');
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
