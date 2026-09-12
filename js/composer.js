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

  function autoResize() {
    els.input.style.height = 'auto';
    els.input.style.height = Math.min(els.input.scrollHeight, 120) + 'px';
  }

  function showReplyStrip(replyTo) {
    els.quoteFrom.textContent = replyTo.from;
    els.quoteText.textContent = replyTo.preview;
    els.quoteStrip.classList.remove('hidden');
  }

  function setReply(msg) {
    pendingReply = { id: msg.id, from: msg.from, preview: replyPreviewFor(msg) };
    showReplyStrip(pendingReply);
    els.input.focus();
  }

  function clearReply() {
    pendingReply = null;
    els.quoteStrip.classList.add('hidden');
  }

  function failSend(err, restoreText, restoreReply) {
    console.error('[chat] send failed:', err);
    showToast(err?.message || 'Message failed to send. Check your connection.');
    if (restoreText) {
      els.input.value = restoreText;
      autoResize();
    }
    if (restoreReply) {
      pendingReply = restoreReply;
      showReplyStrip(restoreReply);
    }
  }

  async function sendText() {
    const text = els.input.value.trim();
    if (!text) return;
    const replyTo = pendingReply;
    clearReply();
    els.input.value = '';
    autoResize();
    backend.setTyping('');
    els.sendBtn.disabled = true;
    try {
      await backend.sendMessage({ from: me, type: 'text', text, replyTo });
    } catch (err) {
      failSend(err, text, replyTo);
    } finally {
      els.sendBtn.disabled = false;
      els.input.focus();
    }
  }

  async function sendFile(file) {
    const replyTo = pendingReply;
    clearReply();
    els.attachBtn.disabled = true;
    try {
      const data = await fileToMessageData(file);
      await backend.sendMessage({ from: me, text: '', replyTo, ...data });
    } catch (err) {
      failSend(err, null, replyTo);
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

  // Emoji panel: build once, toggle on button, close on outside click.
  els.emojiPanel.appendChild(buildEmojiPanel((emo) => {
    const { selectionStart: s, selectionEnd: e, value } = els.input;
    els.input.value = value.slice(0, s) + emo + value.slice(e);
    els.input.setSelectionRange(s + emo.length, s + emo.length);
    els.input.focus();
    autoResize();
    syncTyping();
  }));
  els.emojiBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    els.emojiPanel.classList.toggle('hidden');
  });
  document.addEventListener('click', (e) => {
    if (els.emojiPanel.classList.contains('hidden')) return;
    if (!els.emojiPanel.contains(e.target) && e.target !== els.emojiBtn) {
      els.emojiPanel.classList.add('hidden');
    }
  });

  return { setReply };
}
