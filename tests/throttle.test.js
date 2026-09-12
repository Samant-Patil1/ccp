import test from 'node:test';
import assert from 'node:assert/strict';
import { throttle } from '../js/lib/throttle.js';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

test('leading edge runs immediately, trailing edge flushes the last call', async () => {
  let t = 0;
  const calls = [];
  const fn = throttle((v) => calls.push(v), 50, () => t);

  fn('a'); // leading run
  assert.deepEqual(calls, ['a']);

  t = 10;
  fn('b'); // suppressed, trailing scheduled (~40ms real time)
  assert.deepEqual(calls, ['a']);
  await sleep(90);
  assert.deepEqual(calls, ['a', 'b']); // trailing flushed even with no further calls

  t = 200;
  fn('c'); // window long past → leading run again
  t = 210;
  fn('d'); // suppressed → trailing
  await sleep(90);
  assert.deepEqual(calls, ['a', 'b', 'c', 'd']);
});

test('rapid burst only fires leading + one trailing', async () => {
  const calls = [];
  const fn = throttle((v) => calls.push(v), 60);
  fn(1); fn(2); fn(3); fn(4);
  await sleep(120);
  assert.deepEqual(calls, [1, 4]);
});

test('cancel drops a pending trailing call', async () => {
  const calls = [];
  const fn = throttle((v) => calls.push(v), 60);
  fn('a');
  fn('b');
  fn.cancel();
  await sleep(100);
  assert.deepEqual(calls, ['a']);
});
