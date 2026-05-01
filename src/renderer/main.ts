import { AudioEngine } from "./audio";
import { GLRenderer } from "./renderer";
import { loadPresets, getKeyMap, type Preset } from "./presets";
import { HUD } from "./ui";

declare global {
  interface Window {
    electronAPI?: {
      toggleFullscreen: () => void;
      exitFullscreen: () => void;
      toggleAlwaysOnTop: () => void;
    };
  }
}

async function main() {
  const canvas = document.getElementById("glcanvas") as HTMLCanvasElement;
  const glRenderer = new GLRenderer(canvas);
  const audioEngine = new AudioEngine();

  // Load shaders
  const presets = await loadPresets();
  for (const preset of presets) {
    glRenderer.compileShader(preset.id, preset.fragmentShader);
  }

  const keyMap = getKeyMap();
  let currentPresetIndex = 0;

  async function setPreset(index: number) {
    currentPresetIndex = index;
    const preset = presets[index];
    glRenderer.useProgram(preset.id);
    hud.updatePreset(index, preset);

    // Manage webcam lifecycle
    if (glRenderer.needsWebcam) {
      try {
        await glRenderer.startWebcam(hud.getSelectedVideoDeviceId());
      } catch (e) {
        console.warn("Webcam failed:", e);
      }
    } else if (!glRenderer.isCrossfading) {
      glRenderer.stopWebcam();
    }
  }

  // Init audio
  try {
    await audioEngine.init();
  } catch (e) {
    console.warn("Audio init failed, continuing without audio:", e);
  }

  const hud = new HUD(audioEngine, glRenderer);
  await hud.populateDevices();

  // Start on GLITCH (first non-camera preset)
  const defaultIdx = keyMap.get("1") ?? 0;
  await setPreset(defaultIdx);

  // Keyboard controls
  window.addEventListener("keydown", (e) => {
    const key = e.key.toLowerCase();

    // Check key map for preset bindings (0-9, q, w, e)
    const presetIdx = keyMap.get(key);
    if (presetIdx !== undefined) {
      setPreset(presetIdx);
      return;
    }

    switch (key) {
      case " ":
        e.preventDefault();
        setPreset(Math.floor(Math.random() * presets.length));
        break;
      case "b":
        audioEngine.triggerManualBeat();
        break;
      case "h":
        hud.toggle();
        break;
      case "f":
        if (window.electronAPI) {
          window.electronAPI.toggleFullscreen();
        } else {
          if (!document.fullscreenElement) {
            document.documentElement.requestFullscreen();
          } else {
            document.exitFullscreen();
          }
        }
        break;
      case "t":
        if (window.electronAPI) {
          window.electronAPI.toggleAlwaysOnTop();
          hud.flashMessage("ALWAYS ON TOP");
        }
        break;
      case "escape":
        if (window.electronAPI) {
          window.electronAPI.exitFullscreen();
        }
        break;
      case "+":
      case "=":
        glRenderer.setSpeed(glRenderer.speed + 0.1);
        hud.flashMessage(`SPEED ${glRenderer.speed.toFixed(1)}x`);
        break;
      case "-":
        glRenderer.setSpeed(glRenderer.speed - 0.1);
        hud.flashMessage(`SPEED ${glRenderer.speed.toFixed(1)}x`);
        break;
      case "arrowup":
        glRenderer.setSpeed(glRenderer.speed + 0.25);
        hud.flashMessage(`SPEED ${glRenderer.speed.toFixed(1)}x`);
        break;
      case "arrowdown":
        glRenderer.setSpeed(glRenderer.speed - 0.25);
        hud.flashMessage(`SPEED ${glRenderer.speed.toFixed(1)}x`);
        break;
      case "arrowright":
        glRenderer.setSpeed(1.0);
        hud.flashMessage("SPEED RESET 1.0x");
        break;
    }
  });

  // Resize handler
  window.addEventListener("resize", () => {
    glRenderer.resize();
  });

  // Render loop
  function loop() {
    const now = performance.now() / 1000;
    audioEngine.update(now);
    glRenderer.render(audioEngine.data);
    hud.update();
    requestAnimationFrame(loop);
  }

  requestAnimationFrame(loop);
}

main();
