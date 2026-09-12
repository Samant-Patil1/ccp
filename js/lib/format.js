export function formatTime(ts) {
  const d = new Date(ts);
  const p = (n) => String(n).padStart(2, '0');
  return `${p(d.getHours())}:${p(d.getMinutes())}`;
}

export function formatDayLabel(ts, nowTs = Date.now()) {
  const d = new Date(ts);
  const now = new Date(nowTs);
  const sameDay = (a, b) =>
    a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
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
