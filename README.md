# Retro PVM Simulator

![Screenshot_20251112_014444_Chrome](https://github.com/user-attachments/assets/2ef5ad13-296f-44ee-a1af-95bd50c297bb)

![Screenshot_20251112_014701_Chrome](https://github.com/user-attachments/assets/ce5f57eb-a5cd-46de-a487-5f1a80735be3)

**[▶ Live Demo](https://xero00000.github.io/)**

A comprehensive, browser-based WebGL2 simulation of a Professional Video Monitor (PVM) and retro signal types. Built as a three-file app (`index.html` + `style.css` + `app.js`) using a two-pass shader pipeline, Tone.js for synthesized audio, and an interactive HTML/CSS control panel.

---

## ⚠️ How to Run

The app **cannot** be opened directly from `file://` — it must be served by a local web server due to browser security policies required for video textures and screen capture.

**VS Code (easiest):** Install the [Live Server](https://marketplace.visualstudio.com/items?itemName=ritwickdey.LiveServer) extension → right-click `index.html` → *Open with Live Server*

**Node.js / npx:**
```bash
npx serve . -p 8080
```

**Python:**
```bash
python -m http.server 8080
```
Then open `http://localhost:8080`.

---

## Features

### 🖥️ Screen Overlay Mode *(new)*
Turn the entire CRT effect pipeline into a **fullscreen overlay** over your desktop or any window:
1. Power on the PVM.
2. Click the **⊡ monitor icon** in the transport bar (or press **`O`**).
3. A screen-capture picker appears — choose your screen or window.
4. The browser goes fullscreen and applies all CRT effects (scanlines, phosphor mask, curvature, signal degradation, bloom) live to your screen.
5. Move the mouse (or touch on mobile) to reveal the floating **HUD** — quick controls to cycle signal type, toggle CRT effects, toggle phosphor persistence, and exit.
6. Press **`Esc`** or **`O`** to exit.

### 📺 Visual Simulation
- **WebGL 2.0 Two-Pass Pipeline** — phosphor persistence pass + display post-processing pass
- **Phosphor Masks** — Aperture Grille, Shadow Mask, Slot Mask
- **Signal Degradation Modes:**
  - **RGB** — clean digital
  - **S-Video** — chroma blur
  - **Composite** — dot crawl, color bleed
  - **RF (Antenna)** — heavy composite + moving interference bars
- **H-Sync Jitter** — per-scanline horizontal instability
- **Ghosting, Compression Artifacts, Signal Strength** sliders
- **Convergence** — misalign R/G/B channels
- **Scanlines** — 240p progressive and 480i interlaced
- **Screen Curvature** (barrel distortion)
- **Vignette** — realistic corner darkening
- **Phosphor Bloom** — overbright pixel glow
- **CRT Warmup** — brightness & saturation ramp up over 30 seconds on power-on
- **Power Animations:**
  - *Power ON:* white dot fade-in
  - *Power OFF:* image collapses to a bright raster line → white dot → black

### 🎛️ Hardware Faults & Quirks
| Fault | Effect |
|---|---|
| Vertical Hold | Rolling picture |
| Tint (H-Hold) | Color hue shift |
| Failing Color Guns | Weaken R, G, or B independently |
| VCR Mode | Head-switching noise at bottom of frame |
| VCR Tracking | Injects a tracking error band |
| Screen Burn-In | Upload an image as a permanent faint overlay |
| Degauss | Wobble animation + authentic "thwung" sound |

### 🔄 Black Frame Insertion (BFI)
Optimized for **180 Hz monitors**:
- **60 Hz** — standard, no BFI
- **120 Hz BFI** — every other frame is black (reduces motion blur)
- **180 Hz BFI** — 2 of every 3 frames are black (maximum motion clarity)
- **Auto** — detects your monitor's actual refresh rate at startup
- **Duty Cycle slider** — fine-tune the ratio of lit vs black frames (10–100%)

### 🎬 Input Sources
| Source | Notes |
|---|---|
| Local video file | mp4, webm, etc. |
| Direct video URL | Must be CORS-accessible |
| Screen Share | Live capture with optional 4:3 crop |
| Webcam | Live capture |
| Image / GIF | Static images and animated GIFs |
| Test Patterns | SMPTE Color Bars, Multiburst, Crosshatch, Grayscale Ramp |
| Preset Channels | 3 built-in sample video channels |

### 🔊 Audio Simulation (Tone.js)
- **15.7 kHz power whine** — synthesized CRT flyback frequency
- **Static hiss** — on no-signal / power-on
- **Degauss sound** — synthesized harmonic "thwung"
- **UI sounds** — click, thunk, fader zipper
- **Speaker EQ** — EQ3 filter makes video audio sound like built-in TV speakers

### 🖥️ OSD (On-Screen Display)
A PVM-authentic on-screen menu for Brightness, Contrast, Saturation, Tint, Sharpness. Navigate with arrow keys or channel buttons.

### 💾 Preset System
- Save/load named presets to **localStorage**
- **Export** all presets as a `.json` file
- **Import** presets from a `.json` file

### 🌐 Environment Themes
- **Studio** — neutral dark grid
- **80s Den** — warm wood-paneled ambient light
- **Arcade** — deep checkerboard colored ambience

---

## Keyboard Shortcuts

| Key | Action |
|---|---|
| `P` | Toggle Power |
| `O` | Toggle Screen Overlay Mode |
| `M` | Toggle OSD Menu |
| `Space` | Play / Pause (or OSD Select) |
| `F` | Theatre Mode (fullscreen with controls) |
| `C` | CRT-Only Fullscreen |
| `T` | Test Pattern |
| `D` | Degauss |
| `1` / `2` / `3` | Load preset channel |
| `↑` / `↓` | Navigate OSD menu items |
| `←` / `→` | Adjust OSD value |
| `Tab` | Next OSD menu |
| `Esc` | Close OSD / Exit Overlay |

---

## Tech Stack
- **Rendering:** WebGL 2.0 (GLSL ES 3.00), two-pass FBO ping-pong
- **Audio:** [Tone.js](https://tonejs.github.io/) v14.7.77
- **UI Styling:** [Tailwind CSS](https://tailwindcss.com/) (CDN) + custom `style.css`
- **Structure:** Vanilla HTML5 + ES2020 JS (`app.js`) — zero build step required
