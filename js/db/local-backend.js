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
