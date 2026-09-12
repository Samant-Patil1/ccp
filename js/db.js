import { LocalBackend } from './db/local-backend.js';

export function isPlaceholderConfig(cfg) {
  if (!cfg || typeof cfg.apiKey !== 'string' || typeof cfg.databaseURL !== 'string') return true;
  return cfg.apiKey.includes('PASTE') || cfg.databaseURL.includes('PASTE');
}

// Picks Firebase with a localStorage demo-mode fallback. Never throws:
// any failure to load/initialize Firebase degrades to demo mode so the app
// always comes up.
export async function createBackend(config, me, kv) {
  if (isPlaceholderConfig(config)) {
    const backend = new LocalBackend(kv, me);
    await backend.init();
    return { backend, demo: true };
  }
  try {
    const mod = await import('./db/firebase-backend.js');
    const backend = new mod.FirebaseBackend(config, me);
    await backend.init();
    return { backend, demo: false };
  } catch (err) {
    console.error('[chat] Firebase unavailable, falling back to demo mode:', err);
    const backend = new LocalBackend(kv, me);
    await backend.init();
    return { backend, demo: true };
  }
}
