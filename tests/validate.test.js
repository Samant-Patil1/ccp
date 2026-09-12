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
