# PlayGround

<!-- omgithub:readme:start -->
## 🚀 Build, play, and remix with OMGithub

**Created using [OMGithub.com](https://go.ondev.store/).**

[![OMGithub](https://img.shields.io/badge/OMGithub-Open%20project-orange?style=for-the-badge)](https://go.ondev.store/ity1040-art/PlayGround)
[![GitHub](https://img.shields.io/badge/GitHub-Source-181717?logo=github&style=for-the-badge)](https://github.com/ity1040-art/PlayGround)

- 🎮 [Open the project](https://go.ondev.store/ity1040-art/PlayGround).
- ✨ [Remix this project](https://go.ondev.store/ity1040-art/PlayGround?remix=1).
- 💻 [Explore the source](https://github.com/ity1040-art/PlayGround).
- 🛠️ [Check build runs](https://github.com/ity1040-art/PlayGround/actions).
- 🐛 [Report an issue](https://github.com/ity1040-art/PlayGround/issues).
- 👤 [Explore the creator's projects](https://go.ondev.store/ity1040-art).
- 🌍 [Create with OMGithub](https://go.ondev.store/).
<!-- omgithub:readme:end -->

## 🕯️ Hollow House — Escape the Ghost

A short first-person 3D horror game built with Three.js. Find all **three black candles** inside the mansion, then escape through the sealed foyer door while a ghost hunts you. Works on phones, tablets, and desktop — no build step.

### Play

```bash
./start.sh
```

Then open the printed local URL. On desktop, click the canvas to capture the mouse; on mobile, use the on-screen joystick and buttons.

### Controls

| Action | Desktop | Touch |
| --- | --- | --- |
| Move | `W A S D` / arrow keys | Left joystick |
| Look | Mouse (pointer lock) | Drag on the canvas |
| Sprint | `Shift` | `RUN` button |
| Use / pick up / hide | `E` or `Space` | `USE` |
| Flashlight | `F` | `LIGHT` |
| Pause | `Esc` / pause button | Auto-pauses when the tab is hidden |

### Rules

- Collecting candles wakes the ghost; each one makes it more aggressive.
- Hiding in a wardrobe breaks line of sight, but the ghost can search nearby.
- The flashlight makes the dark manageable — and makes you easier to spot.
- All three candles open the foyer door. Cross the threshold to win.
- Getting caught ends the run; use **Enter Again** to restart.

### Notes / assumptions

- Everything is procedural: geometry, textures, audio, and the jumpscare face. No external assets are fetched at runtime.
- Three.js r170 and `BufferGeometryUtils` are vendored locally, so the game runs offline.
- Static geometry is merged by material at startup to keep the draw-call count low; adaptive resolution drops internal render scale on slow devices.
- The game assumes a WebGL-capable browser with pointer/touch events. Portrait and landscape are both supported.
