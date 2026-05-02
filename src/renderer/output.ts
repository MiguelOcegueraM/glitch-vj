// Output window: independent WebGL renderer that receives commands from the control UI
import { AudioEngine } from "./audio";
import { GLRenderer } from "./renderer";
import { loadPresets, type Preset } from "./presets";
import { OverlayManager } from "./overlays";

declare global {
  interface Window {
    outputAPI?: {
      onCommand: (callback: (cmd: string, data: any) => void) => void;
      sendReady: () => void;
    };
  }
}

async function main() {
  const canvas = document.getElementById("glcanvas") as HTMLCanvasElement;
  const glRenderer = new GLRenderer(canvas);
  const audioEngine = new AudioEngine();
  const overlays = new OverlayManager(canvas);

  // Load all shaders
  const presets = await loadPresets();
  for (const preset of presets) {
    glRenderer.compileShader(preset.id, preset.fragmentShader);
  }

  // Default preset
  let currentPresetId = presets[4]?.id ?? presets[0].id; // default to first non-camera
  glRenderer.useProgram(currentPresetId);

  // Init audio (output has its own audio engine for zero-latency reactivity)
  try {
    await audioEngine.init();
  } catch (e) {
    console.warn("Output audio init failed:", e);
  }

  // Listen for commands from control UI
  if (window.outputAPI) {
    window.outputAPI.onCommand((cmd, data) => {
      switch (cmd) {
        case "set-preset": {
          const preset = presets.find((p) => p.id === data.presetId);
          if (preset) {
            currentPresetId = preset.id;
            glRenderer.useProgram(preset.id);
            // Handle webcam lifecycle
            if (glRenderer.needsWebcam) {
              glRenderer.startWebcam(data.videoDeviceId).catch(() => {});
            } else if (!glRenderer.isCrossfading) {
              glRenderer.stopWebcam();
            }
          }
          break;
        }
        case "set-speed":
          glRenderer.setSpeed(data.speed);
          break;
        case "trigger-strobe":
          glRenderer.triggerStrobe();
          break;
        case "set-audio-device":
          audioEngine.init(data.deviceId).catch(() => {});
          break;
        case "toggle-layer": {
          overlays.toggleByIndex(data.index);
          break;
        }
        case "add-overlay-image": {
          if (data.dataUrl) {
            // Load the image then free the dataUrl — output doesn't need to retain it
            overlays.addImageFromDataUrl(data.dataUrl).then((item) => {
              item.dataUrl = undefined;
            });
          }
          break;
        }
        case "add-overlay-text": {
          overlays.addText(data.text, data.color, data.fontSize);
          break;
        }
        case "remove-overlay": {
          overlays.removeByIndex(data.index);
          break;
        }
        case "set-overlay-visible": {
          overlays.setVisibleByIndex(data.index, data.visible);
          break;
        }
        case "set-overlay-transform": {
          overlays.setPositionByIndex(data.index, data.x, data.y);
          overlays.setScaleByIndex(data.index, data.scale);
          overlays.setRotationByIndex(data.index, data.rotation);
          break;
        }
        case "set-overlay-effect": {
          overlays.setEffectByIndex(data.index, data.effect);
          break;
        }
        case "set-color-grade": {
          glRenderer.setBrightness(data.brightness);
          glRenderer.setRGB(data.r, data.g, data.b);
          break;
        }
      }
    });

    window.outputAPI.sendReady();
  }

  // Resize handler
  window.addEventListener("resize", () => {
    glRenderer.resize();
  });

  // Render loop (protected — never let a single error kill the loop)
  function loop() {
    try {
      const now = performance.now() / 1000;
      audioEngine.update(now);
      if (!glRenderer.isContextLost) {
        glRenderer.render(audioEngine.data);
        const ad = audioEngine.data;
        overlays.render({ time: glRenderer.time, bass: ad.bass, mid: ad.mid, high: ad.high, beat: ad.beat, beatTime: ad.beatTime });
      }
    } catch (e) {
      console.error("Output render loop error:", e);
    }
    requestAnimationFrame(loop);
  }

  requestAnimationFrame(loop);
}

main();
