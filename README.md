Retro PVM Simulator

![Screenshot_20251112_014444_Chrome](https://github.com/user-attachments/assets/2ef5ad13-296f-44ee-a1af-95bd50c297bb)

![Screenshot_20251112_014701_Chrome](https://github.com/user-attachments/assets/ce5f57eb-a5cd-46de-a487-5f1a80735be3)

![Screenshot_20251112_014949_Chrome](https://github.com/user-attachments/assets/96854ea2-7993-455d-b03d-b7e9f0f5ecd5)

![Screenshot_20251112_014915_Chrome](https://github.com/user-attachments/assets/3c7c169b-abc6-4f66-9e00-099a3b313df5)

try it--> (https://crtemu.netlify.app/)

This is a comprehensive, browser-based WebGL simulation of a Professional Video Monitor (PVM) and various retro signal types. It is built as a single, self-contained HTML file that uses a two-pass shader pipeline, Tone.js for audio synthesis, and an interactive HTML/CSS overlay for the UI.

⚠️ How to Run

This project is a single .html file but cannot be run by opening the file directly in your browser (e.g., from a file:///... path).

It must be served by a local web server due to browser security policies (CORS) that are required for loading video textures and other cross-origin resources.

The Easiest Way (Using VS Code):

Install the "Live Server" extension in Visual Studio Code.

Open the project folder in VS Code.

Right-click the crt_simulator_v2.html file and select "Open with Live Server".

The Python Way:

Open your terminal or command prompt.

Navigate to the folder containing the project.

Run one of the following commands:

python -m http.server (for Python 3)

python -m SimpleHTTPServer (for Python 2)

Open your browser and go to http://localhost:8000/crt_simulator_v2.html.

Features

This simulator includes a deep set of features to replicate the look, feel, and quirks of retro hardware:

Visual Simulation

WebGL 2.0 Shader Pipeline: A two-pass system simulates phosphor persistence and final display output.

Accurate Phosphor Masks: Selectable Aperture Grille, Shadow Mask, and Slot Mask patterns.

Signal Degradation:

Signal Type: RGB (Clean), S-Video (Chroma Blur), Composite (Dot Crawl/Bleed), and RF (Heavy Noise).

Ghosting: Simulates poor cable reception.

Noise: "Signal Strength" fader adds procedural snow.

Compression: Fader to simulate MPEG block artifacts.

Advanced Physics:

Scanlines: 240p (progressive) and 480i (interlaced) modes.

Convergence: Fader to misalign R/G/B channels.

Degauss: An interactive degauss button with sound and wobble animation.

Power: Full power-on (dot fade-in) and power-off (dot collapse) animation.

Environment:

Selectable room themes (Studio, 80s Den, Arcade).

Dynamic screen glare that reacts to mouse position.

Audio Simulation (via Tone.js)

Hardware Sounds: Synthesized 15kHz power-on whine, static hiss, and degauss "thwung".

UI Sounds: Clicks, thunks, and fader "zipper" sounds for all controls.

Speaker Simulation: A master EQ processes video audio to sound "tinny" like built-in TV speakers.

Hardware Faults & Quirks

Vertical Hold: Fader to make the picture roll.

Tint (H-Hold): Fader to adjust color tint.

Failing Guns: Toggles to weaken the R, G, or B color channels.

VCR Mode: Simulates VCR head-switching noise.

Tracking: "Adjust" button injects a VCR tracking error bar.

Screen Burn-In: Upload any image to use as a faint, persistent burn-in layer.

UI & Functionality

PVM-Style UI: All controls are housed in a physical-style side panel.

Interactive OSD: A fully functional On-Screen Display to control Brightness, Contrast, Saturation, Tint, and Sharpness.

Input Sources:

Local Video File

Direct Video URL

Screen Share (with 4:3 crop toggle)

Webcam

SMPTE Test Pattern

Preset System: Save and load all settings to/from localStorage.

Fullscreen Modes:

Theatre Mode: Fullscreens the entire application (screen + controls).

CRT-Only Mode: Fullscreens only the 4:3 viewport for an immersive experience.
