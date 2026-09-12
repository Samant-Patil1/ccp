# Ishu ↔ Sammy Chat — Design Spec

Date: 2026-09-12
Status: Approved by user

## Overview

A WhatsApp-replica web chat app for exactly two users, **Ishu** and **Sammy**.
Static single-page app hosted on GitHub Pages, backed by Firebase Realtime
Database for permanent storage and real-time sync. No build step, no framework.

## Goals

- Username + password login (Ishu / Sammy, password `SI96305`)
- 1:1 chat with permanent message history
- **Live typing preview**: the other user sees the draft text as it is typed,
  before it is sent. Message commits on Enter (Shift+Enter = newline) or send
  button tap.
- Reply-to-message (quote) for text, images, and files
- Emoji picker
- Attachments: pictures (inline), PDFs and other files (download card)
- Glitchless: never hard-crashes; graceful handling of missing config,
  offline state, oversized files

## Non-goals (YAGNI)

- Group chats, multiple conversations, user registration, read receipts/ticks,
  message edit/delete, voice messages, stickers, end-to-end encryption,
  real security (impossible on static hosting — the password is a gate only)

## Architecture

Plain `index.html` + `style.css` + ES-module JS, no bundler.

```
ishu-sammy-chat/
├── index.html            # markup: login screen + chat screen
├── css/style.css         # WhatsApp look, responsive
├── js/
│   ├── app.js            # bootstrap, login/session, screen switching
│   ├── db.js             # storage abstraction: Firebase | localStorage demo
│   ├── firebase-backend.js  # RTDB implementation of db.js interface
│   ├── local-backend.js     # demo-mode implementation (localStorage +
│   │                        storage-event sync across tabs)
│   ├── chat.js           # message rendering, reply, date separators
│   ├── composer.js       # input, live-typing sync, send, emoji, attachments
│   └── emoji.js          # emoji data + picker panel
├── firebase-config.js    # user pastes their Firebase config here
└── README.md             # Firebase setup + GitHub Pages setup, click-by-click
```

`db.js` exposes one interface (subscribe to messages, subscribe to a typing
draft, send message, publish/clear typing draft) with two interchangeable
implementations. `app.js` picks Firebase when `firebase-config.js` contains
real values, otherwise demo mode with a visible "Demo mode — Firebase not
configured" banner. Demo mode makes the app fully testable (two tabs = two
users) before Firebase exists, and guarantees the app never hard-crashes.

Firebase SDK v10.x (pinned) loaded as ES modules from the gstatic CDN.

## Data model (Firebase Realtime Database)

```
/messages/{pushId} : {
  from:     "Ishu" | "Sammy",
  type:     "text" | "image" | "file",
  text:     string,            // for text; caption-less otherwise
  dataUrl:  string,            // base64 data URL, image/file only
  fileName: string,            // file/image only
  fileSize: number,            // bytes, file/image only
  mime:     string,            // file/image only
  replyTo:  { id, from, preview } | null,   // preview = text snippet or
                                            // "📷 Photo" / file name
  ts:       server timestamp
}
/typing/{user} : { text: string, ts: number } | null
```

Messages are append-only → permanent history. Database rules (given to user
to paste): public read/write, `.validate` on `from` ∈ {Ishu, Sammy} and
`text`/`dataUrl` length caps. Documented security caveat in README: anyone
with the database URL can read/write; the login screen is a gate, not
security; acceptable for a personal chat.

## Feature details

### Login
- Case-insensitive username, must be `ishu` or `sammy`; password `SI96305`.
- Wrong credentials → inline error, no crash.
- Session persisted in `localStorage`; header avatar shows initial + name;
  logout returns to login screen and clears the typing draft.

### Live typing
- Composer `input` events → throttle 150ms → write `{text, ts}` to
  `/typing/{me}`; cleared when input empties, on send, on logout, and on
  `beforeunload`.
- Other side subscribes to `/typing/{other}`: shows an italic preview bubble
  above the message list with the partial text and a blinking cursor
  ("Sammy is typing…" label). Preview hides on commit (message arrives) or
  draft cleared. Draft older than 30s is ignored (stale-tab protection).

### Messages
- Enter sends (Shift+Enter newline); send button as alternative, per user
  decision (live preview + Enter/send to commit).
- Outgoing bubbles green/right, incoming white/left; HH:MM timestamp; day
  separators ("Today", "Yesterday", or date).
- All user text rendered via `textContent` (never `innerHTML`) → no injection.
- Auto-scroll to newest; scroll-to-bottom button when scrolled up.
- Soft beep on incoming message (WebAudio oscillator, no asset), mutable via
  header toggle, preference persisted.

### Reply
- Desktop: hover a bubble → reply arrow button. Mobile: horizontal swipe
  right on a bubble (≥ 60px) triggers reply.
- Composer shows a quote strip (sender + preview) with an ✕ to cancel.
- Rendered reply: quoted block at top of bubble; tapping a reply scrolls to
  the original message (best effort; flash highlight if found).

### Emoji
- Built-in picker: no external emoji assets/CDN. Categorized grid (~300
  common emojis, plain unicode). Click inserts at cursor position in the
  composer. Same emoji set usable in captions.

### Attachments
- Paperclip → native file picker, any file.
- Images: downscaled via canvas to max 1600px, JPEG q=0.85 → almost always
  < 500KB, stored as base64 data URL; rendered inline, tap opens full-size
  overlay.
- PDF/other files: stored as base64 data URL if ≤ 1MB raw; rendered as a
  download card (icon, name, size). Larger → friendly inline error, no send.
- All sends get a small "Sending…" state that resolves/clears on ack/error.

### Resilience
- Connection-state banner ("Connecting…" / "Offline — retrying") driven by
  `.info/connected` in Firebase mode; `navigator.onLine` + `storage` events
  in demo mode.
- Oversize file, unreadable file, or Firebase write error → inline toast,
  composer keeps its content, nothing crashes.

## Testing plan

- Two browser tabs side by side (Ishu in one, Sammy in the other) in demo
  mode: login gate (right/wrong password), message send/receive both
  directions, live-typing preview visibility before commit, reply flow,
  emoji insert, image + PDF attach, refresh → history persists (localStorage
  for demo; Firebase once configured), logout/login as other user.
- Mobile viewport checks (responsive layout, swipe-to-reply).
- Static-file sanity: no console errors on load with placeholder config.

## Deployment

- Public GitHub repo `ishu-sammy-chat` created via GitHub API, code pushed.
- README: 5-step Firebase setup (create project → Realtime Database in test
  mode → paste rules → copy web config → paste into `firebase-config.js`),
  then enable GitHub Pages (branch `main`, root). User does both manually.
- No secrets in the repo beyond the Firebase client config (by design public
  on Firebase's model; protected only by the client-side login gate).
