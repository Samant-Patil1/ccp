const SDK = 'https://www.gstatic.com/firebasejs/10.12.2';

// Firebase Realtime Database backend.
// The SDK is imported dynamically inside init() so a CDN failure is a
// catchable error (db.js falls back to demo mode) rather than a module-load
// crash that would take the whole app down.
export class FirebaseBackend {
  constructor(config, me) {
    this.config = config;
    this.me = me;
    this.kind = 'firebase';
    this._unsubs = [];
    this._connCbs = new Set();
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
        for (const cb of this._connCbs) cb(online);
      })
    );
    // Best-effort: clear my typing draft if my connection drops abruptly.
    try {
      dbMod.onDisconnect(dbMod.ref(this._db, `typing/${this.me}`)).remove();
    } catch { /* older SDKs — ignore */ }
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
