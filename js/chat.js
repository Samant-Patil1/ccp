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
    arrow.addEventListener('click', (e) => {
      e.stopPropagation();
      onRequestReply(msg);
    });
    actions.appendChild(arrow);
    wrap.appendChild(actions);

    if (msg.replyTo) bubble.appendChild(buildReplyQuote(msg));

    const meta = el('span', 'msg-meta', formatTime(msg.ts || Date.now()));

    if (msg.type === 'image' && msg.dataUrl) {
      const img = el('img', 'msg-img');
      img.src = msg.dataUrl;
      img.alt = msg.fileName || 'image';
      img.addEventListener('click', () => {
        els.lightboxImg.src = msg.dataUrl;
        els.lightbox.classList.remove('hidden');
      });
      bubble.appendChild(img);
      const row = el('div', 'msg-row');
      if (msg.text) row.appendChild(el('span', 'msg-text', msg.text));
      row.appendChild(meta);
      bubble.appendChild(row);
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
      const row = el('div', 'msg-row');
      if (msg.text) row.appendChild(el('span', 'msg-text', msg.text));
      row.appendChild(meta);
      bubble.appendChild(row);
    } else {
      const row = el('div', 'msg-row');
      row.appendChild(el('span', 'msg-text', msg.text || ''));
      row.appendChild(meta);
      bubble.appendChild(row);
    }

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
    // Decide "is new" BEFORE updating lastPeerMsgId, or the comparison
    // against itself is always false (and the beep never fires).
    const isNewPeerMsg = Boolean(newestPeerId) && newestPeerId !== lastPeerMsgId;

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

    // Beep only for genuinely new incoming messages after the first snapshot.
    if (firstLoad) {
      firstLoad = false;
    } else if (isNewPeerMsg) {
      beep();
    }
    if (newestPeerId) lastPeerMsgId = newestPeerId;

    if (stick) {
      scrollToBottom();
    } else if (isNewPeerMsg) {
      els.scrollBottom.classList.remove('hidden');
    }
  }

  backend.subscribeMessages(render);

  // Live typing preview from the peer.
  backend.subscribeTyping(peer, (draft) => {
    const show = Boolean(draft && draft.text && !isStaleDraft(draft.ts || 0));
    els.typingBubble.classList.toggle('hidden', !show);
    if (show) {
      els.typingFrom.textContent = `${peer} is typing: `;
      els.typingText.textContent = `“${draft.text}”`;
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
