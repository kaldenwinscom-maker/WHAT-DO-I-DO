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
- Per-recording notes as a bullet list
- Color tags (Work/Personal/Idea) with a filter bar to show only one tag
- Delete moves a recording to Trash instead of wiping it; restore it or
  let it auto-purge after 7 days
- Recordings persist across restarts via IndexedDB
- Friendly error message if microphone access is denied or unavailable

## Project layout

```
web/                  Shared app: index.html, style.css, app.js, db.js
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
