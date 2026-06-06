# gittercamExtension

Freeze, loop, filter, schedule, or fake a bad connection on your webcam during video calls. Works with **Google Meet, Zoom (web), Microsoft Teams (web), Slack huddles, and Discord**. A cross-browser (Chrome / Edge / Firefox) Manifest V3 extension.

GitterCam intercepts the camera stream the meeting page requests and routes it through a canvas pipeline, so you can step away, loop a clip of yourself, or simulate a laggy connection with one click or a keyboard shortcut.

## Features

| Mode | What it does | Shortcut |
|------|--------------|----------|
| Live | Normal pass-through camera | (set manually) |
| Freeze | Holds the current frame | `Alt+F` |
| Loop | Records a short clip, replays it on a loop | `Alt+L` |
| Bad Connection | Stutters / drops frames like a poor network | `Alt+S` |
| Panic (go live) | Reverts camera + mic to live, cancels schedule | `Alt+P` |

Chrome allows at most 4 extension shortcuts with default keys, so "Live" has no default binding (Panic also returns you to live); you can assign one at `chrome://extensions/shortcuts`.

### Additional features

- **Color filters** - B&W, Sepia, Warm, Cool, Vivid, applied live to the camera.
- **Schedule freeze** - free-form "freeze in N sec/min for N sec/min" (sub-minute uses `setTimeout`, longer uses `chrome.alarms` so it survives a service-worker restart).
- **Auto-disable on screen share** - video and audio effects automatically revert to live while you present (and the floating overlay hides so it isn't captured), then restore when you stop sharing.
- **Floating overlay** - a draggable, collapsible in-page pill to switch modes without opening the popup.
- **Panic button** - one click in the popup or `Alt+P` instantly reverts camera and mic to live and cancels any schedule.

### Audio manipulation

| Mode | What it does |
|------|--------------|
| Normal | Real mic, untouched |
| Mute + Ambient | Mutes your mic and plays generated room tone + occasional keyboard/mouse clicks |
| Voice | Runs your voice through an effect: Deep, High, Robot, Echo, Whisper, Chipmunk |
| Typing | Keeps your live mic and mixes in random fake keystrokes |

Audio runs through a Web Audio graph in the page context; the processed track replaces your real mic on the stream handed to the meeting app.

Loop length is configurable (3 / 5 / 10 seconds) from the popup.

## Supported Platforms

| Platform | URL |
|----------|-----|
| Google Meet | `meet.google.com` |
| Zoom (web client) | `*.zoom.us` |
| Microsoft Teams (web) | `teams.microsoft.com`, `teams.live.com` |
| Slack huddles | `app.slack.com` |
| Discord | `discord.com` |

## How It Works

```
Real camera ─▶ inject.js (patches getUserMedia)
                    │
                    ▼
            pipeline.js (canvas engine: freeze / loop / stutter / filters)
                    │  canvas.captureStream()
                    ▼
            Meeting app (sees GitterCam as the camera)
```

- `content.js` (isolated world) injects `pipeline.js` + `audio-pipeline.js` + `inject.js` into the page at `document_start` and bridges messages.
- `inject.js` (page world) monkey-patches `navigator.mediaDevices.getUserMedia` and `getDisplayMedia`.
- `pipeline.js` (page world) wraps the real video `MediaStream` in a canvas-backed stream and applies the active effect.
- `audio-pipeline.js` (page world) intercepts the audio track and applies voice effects via Web Audio.
- `service-worker.js` routes popup/keyboard commands to the active tab and tracks per-tab state + toolbar badge.
- The popup is a Svelte app.

## Project Structure

```
src/
  content/
    content.js          # isolated-world bridge + injector + overlay
    inject.js           # page-world getUserMedia/getDisplayMedia patch
    pipeline.js         # canvas video effects engine
    audio-pipeline.js   # Web Audio effects engine
  background/
    service-worker.js   # message routing, state, badge, shortcuts, alarms
  popup/
    App.svelte          # popup UI
    main.js
    popup.html
  shared/
    constants.js        # modes, commands, defaults
    messages.js         # message type names
  manifest.config.js    # generates the per-browser manifest
scripts/
  build.js              # builds popup + copies scripts + writes manifest
  gen-icons.js          # generates PNG icons
  gen-audio.js          # generates audio samples
public/
  icons/                # generated extension icons
  audio/                # generated audio samples (typing, clicks)
test/
  pipeline-test.html    # standalone engine test (no extension needed)
```

## Build

Requires **Node 18+**.

```bash
npm install
node scripts/gen-icons.js   # one-time: generate icons into public/icons
node scripts/gen-audio.js   # one-time: generate audio samples into public/audio
npm run build:chrome        # -> dist/chrome
npm run build:firefox       # -> dist/firefox
npm run build:all           # both
```

`npm run dev` builds Chrome in watch mode.

## Load the Extension

**Chrome / Edge**
1. Go to `chrome://extensions` (or `edge://extensions`).
2. Enable Developer mode.
3. "Load unpacked" -> select `dist/chrome`.

**Firefox**
1. Go to `about:debugging#/runtime/this-firefox`.
2. "Load Temporary Add-on" -> select `dist/firefox/manifest.json`.

Then open a supported meeting platform, turn your camera on, and use the popup or shortcuts.

## Testing Without a Meeting

Open `test/pipeline-test.html` over a local web server (camera APIs need a secure context):

```bash
npx serve .
# then open http://localhost:3000/test/pipeline-test.html
```

Click "Start camera" and switch modes to verify freeze / loop / stutter / audio against your real webcam + mic.

## Cross-Platform

Works on **Windows, macOS, and Linux** — anywhere Chrome, Edge, or Firefox runs. No native dependencies.

## Known Limitations

- Works only with **browser-based** meetings (not native desktop apps).
- Color filters apply to Live / Loop / Bad Connection; changing a filter while already Frozen won't repaint the held frame.
- `requestAnimationFrame` throttles in fully backgrounded tabs; the output keeps emitting the last frame while the Meet tab is hidden.
- Frozen/loop frames are generated client-side; this is for stepping away, not for defeating any anti-cheat / proctoring system.

## Contributing

Contributions are welcome! Feel free to open issues or submit pull requests.

## License

MIT License - see [LICENSE](LICENSE) for details.

## Creator

**Karan Veer Thakur**
- Email: karanveerthakur122@gmail.com
- Website: [www.karanveerthakur.com.np](https://www.karanveerthakur.com.np)
