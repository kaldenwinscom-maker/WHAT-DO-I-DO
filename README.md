# Voice Recorder

Record, save, and manage voice notes. One shared codebase (`web/`) runs
three ways: as a plain web page, as a desktop app (Electron), and as a
mobile app (Capacitor, for Android/iOS).

## Features

- Start / pause / resume / stop recording (MediaRecorder API)
- Live waveform meter while recording (Web Audio `AnalyserNode`)
- mm:ss timer, spacebar shortcut to start/stop
- Recordings list: play/pause, static waveform thumbnail (click to seek),
  0.5x/1x/1.5x/2x playback speed, rename, download as `.webm`/`.wav`
- Per-recording notes as a bullet list, or auto-fill them by
  transcribing the recording (OpenAI Whisper API, bring your own key)
- Search box filters recordings by name and notes text
- Color tags (Work/Personal/Idea) with a filter bar to show only one tag
- Delete moves a recording to Trash instead of wiping it; restore it or
  let it auto-purge after 7 days
- Recordings persist across restarts via IndexedDB
- Friendly error message if microphone access is denied or unavailable
- Ask Claude or ChatGPT questions about a recording's notes/transcript
- Warm, Claude-inspired light/dark theme (🌙/☀️ toggle in the header,
  saved locally; defaults to your OS preference)
- Export/import a full backup (recordings, notes, tags, chat history)
  as a `.zip` — everything is stored locally in the browser, so this is
  the only way to move data between devices or survive clearing your
  browser data

### Transcription

Click **🗨️ Transcribe** on a recording to send it to OpenAI's Whisper
API and drop the result into that recording's notes as bullets (one
sentence per line). The first time you use it, it'll ask for an OpenAI
API key (get one at platform.openai.com) — the key is stored only in
your browser's `localStorage` and is sent solely to `api.openai.com`
when you transcribe. Click **🔑 Set OpenAI API key** in the header any
time to change or clear it. This feature needs your own key and
internet access; it does nothing without one.

### Ask AI (Claude / ChatGPT)

Click **🤖 Ask AI** on a recording to open a small chat panel scoped to
that recording — it answers using that recording's name and notes as
context. Toggle between **Claude** and **ChatGPT** per message. Claude
calls use the official `@anthropic-ai/sdk` (see `web-src/claude-client.js`,
bundled into `web/claude-client.bundle.js` — rebuild with
`npm run build:claude-client` if you edit the source); ChatGPT calls use
OpenAI's Chat Completions API directly. Claude needs its own API key
(**🔑 Set Anthropic API key** in the header, from console.anthropic.com);
ChatGPT reuses the OpenAI key from Transcription above. Both keys live
only in `localStorage` and are sent only to their own provider's API —
chat history is saved per recording in IndexedDB.

### Global chat

Click **💬 Chat** in the header for a chat panel that isn't tied to any
one recording — it works as a general assistant, and automatically
includes every non-trashed recording's name and notes as context, so
you can ask things like "what do I need to buy?" or "summarize my
recordings from this week." Same Claude/ChatGPT toggle and API keys as
the per-recording chat; history is saved to `localStorage` (not tied
to a specific recording, so it survives even if you delete one).

### Backup (export / import)

Everything in this app — recordings, notes, tags, chat history — lives
only in that browser's IndexedDB. There's no server, so there's no
automatic backup: clearing browser data, switching browsers, or moving
to a new device loses everything unless you export first.

Click **⭳ Export All Data** to download a `.zip` containing every
recording's audio file plus a `manifest.json` with names, notes, tags,
and chat history (a real, standard zip — openable with any zip tool,
not just this app). Click **⭱ Import Backup** and pick that file to
restore it — on any device or browser, including the desktop/mobile
builds, since they each have separate storage. Importing is additive
and skips recordings that already exist (by ID), so re-importing the
same backup twice won't create duplicates.

## Project layout

```
web/                  Shared app: index.html, style.css, app.js, db.js,
                       zip.js (export/import), claude-client.bundle.js (built, see below)
web-src/               Claude client source (bundled, not loaded directly)
main.js, preload.js   Electron entry point (desktop app)
capacitor.config.json Capacitor config (mobile app)
android/              Generated native Android project
ios/                  Generated native iOS project
```

## Run it as a web page

No build step needed — open `web/index.html` directly, or serve it:

```
npm run web
```

Then visit the printed `http://localhost:8080` URL. (Microphone access
requires `https://` or `localhost`.)

## Run it as a desktop app (Electron)

```
npm install
npm start
```

This opens a native window loading `web/index.html`. `main.js` grants the
mic permission Electron would otherwise deny by default (there's no
browser chrome to show a permission prompt).

### Install it as a real Mac app

To get an actual `Voice Recorder.app` you can drag into `/Applications`
and launch from Spotlight/Dock (instead of running `npm start` from a
terminal every time), build it with `electron-builder` on a Mac:

```
npm install
npm run dist:mac
```

This produces `dist/Voice Recorder-1.0.0.dmg` (and a `.zip`). Open the
`.dmg` and drag `Voice Recorder.app` into `Applications`. The build is
unsigned, so on first launch macOS Gatekeeper will block it — right-click
the app → **Open** → **Open** to approve it once (or System Settings →
Privacy & Security → "Open Anyway" if it was blocked outright).

## Run it as a mobile app (Capacitor)

The native Android and iOS projects are already generated and configured
(`android/`, `ios/`) with microphone permissions declared
(`RECORD_AUDIO` on Android, `NSMicrophoneUsageDescription` on iOS).

**Android** (needs Android Studio / the Android SDK):

```
npm install
npx cap open android
```

Then build & run from Android Studio, or from the command line with
`cd android && ./gradlew assembleDebug`.

**iOS** (needs a Mac with Xcode + CocoaPods):

```
npm install
cd ios/App && pod install && cd ../..
npx cap open ios
```

Then build & run from Xcode onto a simulator or device.

After changing anything under `web/`, re-copy it into the native
projects with:

```
npx cap sync
```

## Notes

- Recordings are stored per-platform: browser/Electron IndexedDB is
  scoped to that app's profile; the Android/iOS apps each get their own
  IndexedDB inside the app's WebView, separate from the browser.
- iOS `WKWebView` only supports `getUserMedia`/`MediaRecorder` on iOS
  14.3+.
