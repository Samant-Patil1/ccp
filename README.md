# 💬 ccp — Ishu & Sammy's Chat

A WhatsApp-style 1:1 chat web app. **Live typing preview** (the other person
sees what you're typing before you send), replies, emojis, photos, PDFs and
file attachments, and a login gate — hosted free on GitHub Pages with Firebase
Realtime Database for permanent message storage.

**Users:** `Ishu` and `Sammy` · **Password:** `SI96305`

## Features

- **Live typing preview** — your draft appears on the other side, keystroke by
  keystroke, before you hit Enter. Messages commit on Enter (Shift+Enter =
  newline) or the send button.
- **Reply** to any message — hover ↩ on desktop, swipe right on mobile.
  Tapping a quoted block jumps to the original message.
- **Built-in emoji picker** — ~1,100 emojis across 8 categories, no external
  services. Click to insert at the cursor.
- **Attachments** — photos render inline (auto-compressed to 1600px), PDFs and
  other files show as download cards (max ~1 MB per file; bigger files get a
  friendly error instead of a crash).
- **Permanent history** in Firebase Realtime Database. Until Firebase is
  configured, the app runs in **demo mode** (localStorage, this browser only)
  so everything works out of the box — including two users in two tabs.
- **Sound notification** on new messages (mutable 🔕), date separators,
  connection indicator, responsive down to phones.
- **Glitchproof** — missing Firebase config, CDN hiccups, oversize files, and
  dropped connections all degrade gracefully; the app never hard-crashes.

## One-time setup (≈5 minutes)

> 📖 A beginner-friendly, click-by-click version of these steps — with exact
> button names and a troubleshooting table — lives in
> **[FIREBASE_SETUP.md](FIREBASE_SETUP.md)**.

### 1. Create the Firebase project

1. Go to <https://console.firebase.google.com> and sign in with a Google account.
2. Click **Add project** → name it (e.g. `ccp`) → Continue →
   **disable Google Analytics** (not needed) → **Create project**.
3. Left menu: **Build → Realtime Database → Create Database** →
   pick the location closest to you → **Start in test mode**.
4. Open the **Rules** tab, paste the rules below, and click **Publish**:

```json
{
  "rules": {
    "messages": {
      ".read": true,
      "$msgId": {
        ".write": true,
        ".validate": "newData.hasChildren(['from', 'type', 'ts']) && (newData.child('type').val() == 'text' || newData.child('type').val() == 'image' || newData.child('type').val() == 'file')",
        "from": { ".validate": "newData.val() == 'Ishu' || newData.val() == 'Sammy'" },
        "text": { ".validate": "!newData.exists() || (newData.isString() && newData.val().length <= 4000)" },
        "dataUrl": { ".validate": "!newData.exists() || (newData.isString() && newData.val().length <= 3000000)" },
        "fileName": { ".validate": "!newData.exists() || (newData.isString() && newData.val().length <= 200)" },
        "$other": { ".validate": true }
      }
    },
    "typing": {
      ".read": true,
      "$user": {
        ".write": true,
        "text": { ".validate": "newData.isString() && newData.val().length <= 4000" }
      }
    }
  }
}
```

### 2. Paste your config into the app

1. Firebase console → **Project settings** (gear icon) → **Your apps** →
   click the **Web** icon (`</>`) → register app (nickname e.g. `chat`) →
   **Register app**.
2. Copy the `firebaseConfig` object shown.
3. In this repo, open **`firebase-config.js`** and replace the placeholder
   values with yours. Commit and push.

While placeholders remain, the app runs in **demo mode**: everything works,
but messages live only in the browser's localStorage — handy for trying it
with two tabs (log in as Ishu in one, Sammy in the other). After pasting real
config, messages sync permanently through Firebase across devices.

### 3. Enable GitHub Pages

1. Repo → **Settings → Pages**.
2. **Source**: Deploy from a branch → **Branch: `main`** → **Folder: `/ (root)`** → **Save**.
3. Wait ~1 minute; the site goes live at
   `https://<your-username>.github.io/ccp/`.

Open the URL on two devices (or two browser windows), log in as Ishu on one
and Sammy on the other, and chat away.

## Security note

This is a personal chat, not a vault. On static hosting the password lives in
the code, and the Firebase rules above let anyone with the database URL read
and write messages. It keeps strangers out only because they don't know the
URL and password — don't reuse `SI96305` anywhere else.

## Running locally

```bash
npm run serve     # http://localhost:8080 (demo mode without Firebase config)
npm test          # unit tests for the logic modules
```

No dependencies to install — tests use Node's built-in runner.

## How it works

- `index.html` + `css/style.css` + ES modules in `js/` — no build step.
- `js/db.js` picks Firebase (real-time, permanent) or a localStorage
  fallback (demo mode). The Firebase SDK loads dynamically, so a CDN failure
  degrades to demo mode instead of crashing the app.
- Live typing: drafts sync to `/typing/{user}` on every keystroke (throttled
  150 ms); the peer renders them as an ephemeral bubble that also respects a
  30-second staleness guard.
- Attachments: images are downscaled to 1600px in the browser before sending;
  files up to ~1 MB ride along as base64 data URLs. Larger files get a
  friendly inline error.
- All user text is rendered via `textContent` — no HTML injection possible.
