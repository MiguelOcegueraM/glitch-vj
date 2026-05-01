import { AudioEngine } from "./audio";
import { GLRenderer } from "./renderer";
import { loadPresets, getKeyMap, type Preset } from "./presets";
import { HUD } from "./ui";
import { OverlayManager } from "./overlays";

declare global {
  interface Window {
    electronAPI?: {
      toggleFullscreen: () => void;
      exitFullscreen: () => void;
      toggleAlwaysOnTop: () => void;
      toggleOutput: () => Promise<boolean>;
      onOutputClosed: (callback: () => void) => void;
    };
  }
}

async function main() {
  const canvas = document.getElementById("glcanvas") as HTMLCanvasElement;
  const glRenderer = new GLRenderer(canvas);
  const audioEngine = new AudioEngine();
  const overlays = new OverlayManager(canvas);
  let outputActive = false;

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

  // Listen for output window closing
  if (window.electronAPI) {
    window.electronAPI.onOutputClosed(() => {
      outputActive = false;
      hud.setOutputMode(false);
    });
  }

  // Start on GLITCH (first non-camera preset)
  const defaultIdx = keyMap.get("1") ?? 0;
  await setPreset(defaultIdx);

  // Text input dialog
  function promptAddText() {
    const input = document.getElementById("text-input") as HTMLInputElement;
    const dialog = document.getElementById("text-dialog") as HTMLElement;
    dialog.classList.remove("hidden");
    input.value = "";
    input.focus();

    const submit = () => {
      const text = input.value.trim();
      if (text) {
        const colorInput = document.getElementById("text-color") as HTMLInputElement;
        overlays.addText(text, colorInput.value, 72);
        hud.flashMessage("TEXT ADDED");
      }
      dialog.classList.add("hidden");
      canvas.focus();
    };

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Enter") {
        e.preventDefault();
        submit();
        cleanup();
      } else if (e.key === "Escape") {
        dialog.classList.add("hidden");
        canvas.focus();
        cleanup();
      }
    };

    const onBtn = () => {
      submit();
      cleanup();
    };

    const cleanup = () => {
      input.removeEventListener("keydown", onKey);
      document.getElementById("text-submit")?.removeEventListener("click", onBtn);
    };

    input.addEventListener("keydown", onKey);
    document.getElementById("text-submit")?.addEventListener("click", onBtn);
  }

  // Keyboard controls
  window.addEventListener("keydown", (e) => {
    // Don't intercept keys when text dialog is open
    const dialog = document.getElementById("text-dialog");
    if (dialog && !dialog.classList.contains("hidden")) return;

    const key = e.key.toLowerCase();

    // Shift+1 through Shift+9: toggle overlay layer visibility
    if (e.shiftKey && key >= "1" && key <= "9") {
      const idx = parseInt(key) - 1;
      const result = overlays.toggleByIndex(idx);
      if (result) {
        hud.flashMessage(`${result.name} ${result.visible ? "ON" : "OFF"}`);
      }
      e.preventDefault();
      return;
    }

    // Manual strobe — S key
    if (key === "s") {
      glRenderer.triggerStrobe();
      return;
    }

    // Let overlay manager handle keys first in edit mode
    if (overlays.handleKey(key, e.shiftKey)) {
      e.preventDefault();
      return;
    }

    // Toggle overlay edit mode
    if (key === "o") {
      const isEdit = overlays.toggleEditMode();
      hud.flashMessage(isEdit ? "OVERLAY EDIT ON" : "OVERLAY EDIT OFF");
      return;
    }

    // Add text overlay (only in edit mode)
    if (key === "a" && overlays.isEditMode) {
      promptAddText();
      return;
    }

    // Check key map for preset bindings (0-9, q, w, e)
    // Skip preset keys in overlay edit mode to avoid accidental switches
    if (!overlays.isEditMode) {
      const presetIdx = keyMap.get(key);
      if (presetIdx !== undefined) {
        setPreset(presetIdx);
        return;
      }
    }

    switch (key) {
      case " ":
        if (overlays.isEditMode) return;
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
        if (!overlays.isEditMode && window.electronAPI) {
          window.electronAPI.toggleAlwaysOnTop();
          hud.flashMessage("ALWAYS ON TOP");
        }
        break;
      case "m":
        // Toggle output to second monitor
        if (window.electronAPI) {
          window.electronAPI.toggleOutput().then((opened) => {
            outputActive = opened;
            hud.setOutputMode(opened);
            hud.flashMessage(opened ? "OUTPUT ON" : "OUTPUT OFF");
          });
        }
        break;
      case "escape":
        if (overlays.isEditMode) {
          overlays.toggleEditMode();
          hud.flashMessage("OVERLAY EDIT OFF");
        } else if (window.electronAPI) {
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
    overlays.render(); // Overlay pass — after shader, before HUD
    hud.update(overlays.getLayerInfo());
    requestAnimationFrame(loop);
  }

  requestAnimationFrame(loop);
}

main();
