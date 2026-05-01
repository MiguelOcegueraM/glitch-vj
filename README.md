# GlitchVJ

Standalone VJ software for live events. Custom WebGL2 shaders react to music in real time — bass, mids, highs, and beat detection drive every pixel. Control UI inspired by Resolume with clip grid, layer management, MIDI learn, and independent output window for LED screens.

**Built for [Earth Night Colima 2026](https://www.djs4ca.com/)** — to make the public dance, feel the music, and lose themselves in the visuals projected across 3 diamond-shaped LED panels.

## The Stack

- **Runtime:** [Bun](https://bun.sh) (dev & build)
- **App Shell:** [Electron](https://www.electronjs.org/) (macOS + Windows)
- **Render:** WebGL2 with hand-written GLSL fragment shaders — no Three.js, no frameworks, raw GPU
- **Audio:** Web Audio API with FFT analysis and custom beat detection
- **MIDI:** Web MIDI API with manual learn mapping — works with any controller
- **Language:** TypeScript

## Architecture

GlitchVJ runs as two windows:

- **Control window** — Resolume-style interface with clip grid, preview canvas, layer panel, audio meters, transport controls, MIDI mapping, and device selectors
- **Output window** — Independent fullscreen WebGL renderer on a second monitor / LED screen. Has its own audio engine for zero-latency reactivity. No UI, no cursor — pure visuals

Commands flow from control to output via Electron IPC. Both windows render independently so the output never drops frames because of UI interaction.

## Features

- **14 presets** switchable via click, keyboard, or MIDI — generative glitch, plasma, kaleidoscope, particles, tunnel, noise, chromatic aberration, strobe, and more
- **MAGIC! auto-pilot** — lava flow + auto-glitch + bass-triggered strobe. Set it and walk away for the entire night
- **4 live camera presets** — point a camera at the crowd and glitch them in real time with ghost trails, acid warps, motion blur, and strobe silhouettes
- **Overlay system** — drag-drop PNG images and add text overlays. Resize, rotate, and position via sliders or directly on the preview canvas (drag to move, scroll to resize, shift+scroll to rotate)
- **MIDI learn** — right-click any clip, button, or layer, then press a MIDI control to map it. Works with Launchpad, APC, any controller
- **Crossfade transitions** — smooth 0.5s blend between presets with smoothstep easing
- **Speed control** — scale shader time from 0.1x to 4.0x to match set energy
- **Beat detection** — dynamic threshold algorithm analyzes bass energy, every visual reacts to the beat
- **Production stable** — tested for 8+ hour sessions. No memory leaks, minimal GC pressure, audio streams properly cleaned up on device changes

## Quick Start

```bash
# Install dependencies
bun install

# Development mode (with hot reload and DevTools)
bun run dev

# Production mode (no dev server, no DevTools)
bun run build && npx electron .
```

## Build for macOS

```bash
bun run package:mac
```

Output: `release/` folder with `.dmg` installer. On Apple Silicon (M1/M2/M3/M4) it builds native arm64 by default.

## Build for Windows

```bash
bun run package:win
```

Output: `release/GlitchVJ-1.0.0.exe` — portable, no installer needed. Can be cross-compiled from macOS if Wine is installed, or built natively on Windows.

## Running a Live Event

```bash
bun run build && npx electron .
```

1. Select your audio input (or use VB-Cable / BlackHole for system audio loopback)
2. Select your camera if using camera presets
3. Click **OUTPUT** to open the fullscreen output on your second monitor / LED screen
4. Click clips to switch visuals, or use keyboard shortcuts / MIDI

### Tips for long sets

- **Close other apps** — especially Chrome, Spotify, anything GPU-heavy
- **Enable Focus mode** — disable notifications so nothing pops over the output
- **Plug in power** — don't let the laptop sleep or throttle
- **Test beforehand** — run MAGIC! for 30 min on the actual LED screen to verify stability

### Audio Loopback

To capture system audio instead of mic input:

**macOS:** Install [BlackHole](https://existential.audio/blackhole/) and create a Multi-Output Device in Audio MIDI Setup

**Windows:** Install [VB-Cable](https://vb-audio.com/Cable/), set `CABLE Input` as default playback, select `CABLE Output` in GlitchVJ

## Controls

### Clip Grid

Click any clip to activate it. The active clip lights up green (cyan for camera presets, rainbow for MAGIC!).

### Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `0` | Camera Glitch |
| `Q` | Camera Acid |
| `W` | Camera Blur |
| `E` | Camera Strobe |
| `1-9` | Shader presets |
| `Space` | Random preset |
| `S` | Strobe flash |
| `B` | Manual beat |
| `M` | Toggle output window |
| `F` | Toggle fullscreen |
| `+` / `-` | Speed +/- 0.1x |
| `Up` / `Down` | Speed +/- 0.25x |
| `Right` | Reset speed to 1.0x |
| `Shift+1-9` | Toggle overlay layer visibility |
| `Esc` | Exit fullscreen / cancel MIDI learn |

### MIDI Learn

1. Right-click any clip, the STROBE/BEAT button, or a layer row
2. A yellow "Waiting for MIDI..." banner appears
3. Press any button/pad/knob on your MIDI controller
4. That control is now mapped to that action
5. Mapped controls show a badge (e.g., `N36`, `CC1`)

Click **CLEAR** in the MIDI section to reset all mappings.

### Overlay Editing

On the preview canvas:
- **Drag** to move overlays
- **Scroll** to resize
- **Shift+Scroll** to rotate

Or click a layer name in the LAYERS panel and use the PROPERTIES sliders for precise control.

## Adding New Shaders

1. Create a new `.frag` file in `src/renderer/shaders/` (GLSL ES 3.00)
2. Add an entry to the `shaderFiles` array in `src/renderer/presets.ts`
3. Optionally add a custom `key` binding or `special: "magic"` for rainbow styling

Every shader receives these uniforms automatically:

```glsl
uniform vec2  u_resolution;  // canvas size in pixels
uniform float u_time;         // seconds since start (affected by speed control)
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
├── main/main.ts               # Electron main process, IPC relay
├── preload/
│   ├── preload.ts             # Control window bridge
│   └── output-preload.ts     # Output window bridge
└── renderer/
    ├── index.html             # Control UI
    ├── output.html            # Output window (fullscreen canvas)
    ├── main.ts                # Control logic, clip grid, MIDI, overlays
    ├── output.ts              # Output renderer, receives IPC commands
    ├── audio.ts               # FFT analysis, beat detection
    ├── renderer.ts            # WebGL2 engine, crossfade, feedback FBOs
    ├── overlays.ts            # Image/text overlay system
    ├── midi.ts                # MIDI learn engine
    ├── presets.ts             # Preset registry and key mappings
    ├── styles.css             # Control UI styles
    └── shaders/
        ├── 00_camera*.frag    # Live camera effect shaders
        ├── 01_glitch.frag     # Datamosh + RGB shift
        ├── 02_plasma.frag     # Audio-reactive plasma
        ├── 03_kaleidoscope.frag
        ├── 04_particles.frag
        ├── 05_tunnel.frag
        ├── 06_grid.frag
        ├── 07_noise.frag
        ├── 08_chromatic.frag
        ├── 09_strobe.frag
        └── 10_magic.frag     # Auto-pilot: lava + glitch + bass strobe
```

## License

MIT

---

Made with code and bass for Earth Night Colima 2026.
