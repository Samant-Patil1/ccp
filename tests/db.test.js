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
  assert.equal(isPlaceholderConfig({}), true);
});

test('placeholder config → local demo backend', async () => {
  const { backend, demo } = await createBackend({ apiKey: 'PASTE_API_KEY_HERE' }, 'Ishu', fakeKv());
  assert.equal(demo, true);
  assert.equal(backend.kind, 'local');
});

test('real-looking config in Node → CDN import fails → demo fallback, still usable', async () => {
  const { backend, demo } = await createBackend(
    { apiKey: 'x', databaseURL: 'https://x-default-rtdb.firebaseio.com' }, 'Ishu', fakeKv());
  assert.equal(demo, true); // https: module import unsupported in Node → caught → fallback
  const msgs = [];
  backend.subscribeMessages((m) => msgs.push(m));
  await backend.sendMessage({ from: 'Ishu', type: 'text', text: 'fallback works', replyTo: null });
  assert.equal(msgs.at(-1)[0].text, 'fallback works');
});
