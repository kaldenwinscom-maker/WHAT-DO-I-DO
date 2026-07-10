# Voice Recorder

Record, save, and manage voice notes. One shared codebase (`web/`) runs
three ways: as a plain web page, as a desktop app (Electron), and as a
mobile app (Capacitor, for Android/iOS).

## Features

- Start / pause / resume / stop recording (MediaRecorder API)
- Live waveform meter while recording (Web Audio `AnalyserNode`)
- mm:ss timer, spacebar shortcut to start/stop
- Recordings list: play/pause with seek bar, rename, download as
  `.webm`/`.wav`, delete
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

To package installers for distribution, add
[`electron-builder`](https://www.electron.build/) and a `build` script —
not included here to keep the base install light.

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
