# Firebase Setup for ccp — Step by Step

This is the **only manual setup** the app needs. Once done, messages are
stored permanently and sync in real time between Ishu and Sammy on any
device. Total time: ~5 minutes. No credit card required (Spark plan is free).

---

## Step 1 — Create a Firebase project

1. Go to **https://console.firebase.google.com** and sign in with any Google account.
2. Click **Add project** (or "Create a project" / "Add project" — wording varies).
3. **Project name:** type `ccp` (any name works — it doesn't have to match).
4. Click **Continue**.
5. **Google Analytics:** switch it **OFF** (the app doesn't use it).
6. Click **Create project**.
7. Wait for the spinner to finish, then click **Continue**.

You are now on the Firebase project dashboard.

---

## Step 2 — Create the Realtime Database

1. In the **left-hand menu**, click **Build** to expand it, then click
   **Realtime Database**.
   - (If you see a "Get started" button on the dashboard instead, you can click
     that — same destination.)
2. Click **Create Database**.
3. **Location:** pick the region closest to you (e.g. `asia-south1` for India,
   `us-central1` for the US). Click **Next**.
4. **Security rules:** choose **Start in test mode** → click **Enable**.
   - Test mode is fine here — we replace the rules with stricter ones in
     Step 3.

The database is created. You should see an empty data tree with a URL like
`https://ccp-default-rtdb.asia-south1.firebasedatabase.app` shown at the top.

---

## Step 3 — Set the database rules

1. In the Realtime Database page, click the **Rules** tab (top of the data panel).
2. **Delete everything** in the rules editor and **paste this** in its place:

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

3. Click **Publish**.
4. You should see a green "Rules published successfully" confirmation.

> These rules say: anyone who knows the database URL can read/write, but
> messages must come from "Ishu" or "Sammy" and stay within size limits. That
> matches the app's client-side login gate. This is a personal chat, not a
> vault — keep the URL and password private.

---

## Step 4 — Get your config keys

1. Click the **gear icon ⚙️** next to "Project Overview" in the left menu →
   select **Project settings**.
2. Scroll to the **Your apps** section.
3. Click the **Web icon** — it looks like `</>` (hover text: "Add app to get
   started" / "Add a web app").
4. **App nickname:** type `ccp-web` (anything works). Leave "Firebase Hosting"
   **unchecked**. Click **Register app**.
5. Firebase shows a block of code like this:

```js
const firebaseConfig = {
  apiKey: "AIzaSyB...",
  authDomain: "ccp-xxxx.firebaseapp.com",
  databaseURL: "https://ccp-xxxx-default-rtdb.asia-south1.firebasedatabase.app",
  projectId: "ccp-xxxx",
  storageBucket: "ccp-xxxx.appspot.com",
  messagingSenderId: "1234567890",
  appId: "1:123:web:abc"
};
```

6. Click **Copy** (or select the object and copy it).

---

## Step 5 — Paste the config into the repo

1. Open **`firebase-config.js`** in this repo.
2. Replace the placeholder values with yours, so it looks like:

```js
export const firebaseConfig = {
  apiKey: "AIzaSyB...",
  authDomain: "ccp-xxxx.firebaseapp.com",
  databaseURL: "https://ccp-xxxx-default-rtdb.asia-south1.firebasedatabase.app",
  projectId: "ccp-xxxx",
  storageBucket: "ccp-xxxx.appspot.com",
  messagingSenderId: "1234567890",
  appId: "1:123:web:abc"
};
```

3. Save, commit, and push:

```bash
git add firebase-config.js
git commit -m "Configure Firebase"
git push
```

> ⚠️ The **yellow "demo mode" badge** in the chat header tells you which mode
> you're in. If it still shows after deploying, one of the values (usually
> `databaseURL`) is still a placeholder — double-check Step 5.

---

## Step 6 — Done

Next: enable GitHub Pages (see **README.md → Step 3**) and open
`https://Samant-Patil1.github.io/ccp/`. Log in as **Ishu** on one device and
**Sammy** on another — messages now sync permanently, and each side sees the
other's typing live.

---

## Troubleshooting

| Symptom | Fix |
|---|---|
| Chat header still shows **"demo mode"** | A placeholder remains in `firebase-config.js` — most often `databaseURL`. Copy it exactly from the config snippet (Step 4). |
| "Permission denied" in browser console | Rules from Step 3 weren't published. Re-open the **Rules** tab, paste, **Publish**. |
| "Database not found" / wrong URL | `databaseURL` must match the URL shown at the top of your Realtime Database page (Step 2). |
| Messages don't appear on the other device | Both sides must be using the deployed site (same `databaseURL`). Hard-refresh (Ctrl/Cmd+Shift+R) to clear the old cached page. |
| Rules editor rejects the JSON | Make sure you copied the whole block including the outer `{ }` braces, and that nothing else is left in the editor. |

### Reset demo-mode data

If you tried the app in demo mode (localStorage) and want a clean start after
switching to Firebase: while on the chat page, open the browser console
(F12) and run `localStorage.clear()`, then refresh.
