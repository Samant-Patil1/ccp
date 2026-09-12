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

test('formatFileSize gives B / KB / MB', () => {
  assert.equal(formatFileSize(512), '512 B');
  assert.equal(formatFileSize(2048), '2 KB');
  assert.equal(formatFileSize(1536), '1.5 KB');
  assert.equal(formatFileSize(5 * 1024 * 1024), '5.0 MB');
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
