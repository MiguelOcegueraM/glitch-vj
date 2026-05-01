# GlitchVJ

Real-time audio-reactive glitch visuals generator built for live events. Custom WebGL2 shaders react to music in real time — bass, mids, highs, and beat detection drive every pixel on screen.

**Built for [Earth Night Colima 2026](https://www.djs4ca.com/)** — to make the public dance, feel the music, and lose themselves in the visuals projected across 3 diamond-shaped LED panels.


## The Stack

- **Runtime:** [Bun](https://bun.sh) (dev & build)
- **App Shell:** [Electron](https://www.electronjs.org/) (cross-platform, portable .exe for Windows)
- **Render:** WebGL2 with hand-written GLSL fragment shaders — no Three.js, no frameworks, raw GPU
- **Audio:** Web Audio API with FFT analysis and custom beat detection
- **Language:** TypeScript
- **VJ Integration:** Designed for capture by [Resolume Arena](https://resolume.com/) for LED mapping

## Features

- **13 presets** switchable via hotkeys — generative glitch, plasma, kaleidoscope, particles, tunnel, noise, chromatic aberration, strobe, and more
- **4 live camera presets** — point a camera at the crowd and glitch them in real time with ghost trails, acid warps, motion blur, and strobe silhouettes
- **Beat detection** — dynamic threshold algorithm analyzes bass energy in real time, every visual reacts to the beat
- **Audio-reactive uniforms** — bass, mid, high, volume, beat, and beat decay are passed to every shader every frame
- **HUD overlay** — FPS, audio levels, beat indicator, audio/video device selectors, hotkey reference
- **Portable .exe** — single file, no installer, double-click and go

## Quick Start

```bash
# Install dependencies
bun install

# Run in development mode
bun run dev
```

This starts a dev server on `:5173` and opens an Electron window pointing to it.

## Build Windows .exe

```bash
bun run package:win
```

Output: `release/GlitchVJ-1.0.0.exe` — portable, no installer needed. First build downloads Electron Windows binaries (~150MB).

## Running on Windows

1. Copy `GlitchVJ-1.0.0.exe` to the target machine
2. Double-click to run
3. Allow microphone/camera access when prompted

### Audio Loopback with VB-Cable

To capture system audio instead of mic input, install [VB-Cable](https://vb-audio.com/Cable/):

1. Download and install VB-Cable
2. Set `CABLE Input` as default playback device (Settings > Sound > Output)
3. In GlitchVJ, select `CABLE Output` from the audio input dropdown
4. System audio now routes through VB-Cable into GlitchVJ

## Hotkeys

| Key | Action |
|-----|--------|
| `0` | Camera Glitch (webcam + datamosh + ghost trails) |
| `Q` | Camera Acid (psychedelic warp + rainbow ghosts) |
| `W` | Camera Blur (dreamy motion blur + smoke trails) |
| `E` | Camera Strobe (silhouette flash + neon colors) |
| `1` | Glitch (datamosh + RGB shift + scanlines) |
| `2` | Plasma (audio-reactive plasma) |
| `3` | Kaleidoscope (dynamic segments + glitch overlay) |
| `4` | Particles (200-particle field, fragment shader) |
| `5` | Tunnel (infinite zoom, bass = speed) |
| `6` | Grid (distortion glitch per cell) |
| `7` | Noise (VHS static, no signal) |
| `8` | Chromatic (extreme chromatic aberration) |
| `9` | Strobe (beat-synced flash — photosensitivity warning) |
| `Space` | Random preset |
| `B` | Manual beat trigger |
| `H` | Toggle HUD |
| `F` | Toggle fullscreen |
| `Esc` | Exit fullscreen |

## Resolume Arena Integration

1. In Resolume, go to **Sources > Screen Capture**
2. Select the GlitchVJ window
3. For the LED panels: keep GlitchVJ at 1920x1080, do slicing and mapping in Resolume's Advanced Output

## Adding New Shaders

1. Create a new `.frag` file in `src/renderer/shaders/` (GLSL ES 3.00)
2. Add an entry to the `shaderFiles` array in `src/renderer/presets.ts`
3. Optionally add a custom `key` binding in the preset definition

Every shader receives these uniforms automatically:

```glsl
uniform vec2  u_resolution;  // canvas size in pixels
uniform float u_time;         // seconds since start
uniform float u_bass;         // 0-1, low frequency energy
uniform float u_mid;          // 0-1, mid frequency energy
uniform float u_high;         // 0-1, high frequency energy
uniform float u_volume;       // 0-1, overall RMS volume
uniform float u_beat;         // 0 or 1, beat detected this frame
uniform float u_beatTime;     // seconds since last beat (use for decay)
```

Camera shaders also receive:

```glsl
uniform sampler2D u_webcam;   // live camera feed
uniform sampler2D u_feedback;  // previous frame (for ghost trails)
```

## Project Structure

```
src/
├── main/main.ts           # Electron main process
├── preload/preload.ts     # Context bridge
└── renderer/
    ├── index.html         # App shell
    ├── main.ts            # Entry point, render loop, hotkeys
    ├── audio.ts           # FFT analysis, beat detection
    ├── renderer.ts        # WebGL2 setup, shader programs, webcam, feedback FBOs
    ├── presets.ts          # Preset registry and key mappings
    ├── ui.ts              # HUD overlay
    ├── styles.css
    └── shaders/
        ├── 00_camera.frag
        ├── 00_camera_acid.frag
        ├── 00_camera_blur.frag
        ├── 00_camera_strobe.frag
        ├── 01_glitch.frag
        ├── 02_plasma.frag
        ├── 03_kaleidoscope.frag
        ├── 04_particles.frag
        ├── 05_tunnel.frag
        ├── 06_grid.frag
        ├── 07_noise.frag
        ├── 08_chromatic.frag
        └── 09_strobe.frag
```

## License

MIT

---

Made with code and bass for Earth Night Colima 2026.
