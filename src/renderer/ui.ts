import type { AudioEngine } from "./audio";
import type { GLRenderer } from "./renderer";
import type { Preset } from "./presets";

export class HUD {
  private el: HTMLElement;
  private presetEl: HTMLElement;
  private fpsEl: HTMLElement;
  private bassBar: HTMLElement;
  private midBar: HTMLElement;
  private highBar: HTMLElement;
  private beatEl: HTMLElement;
  private audioSelect: HTMLSelectElement;
  private videoSelect: HTMLSelectElement;
  private strobeWarning: HTMLElement;
  private visible = true;
  private selectedVideoDeviceId: string | undefined;

  constructor(
    private audio: AudioEngine,
    private renderer: GLRenderer
  ) {
    this.el = document.getElementById("hud")!;
    this.presetEl = document.getElementById("hud-preset")!;
    this.fpsEl = document.getElementById("hud-fps")!;
    this.bassBar = document.getElementById("meter-bass")!;
    this.midBar = document.getElementById("meter-mid")!;
    this.highBar = document.getElementById("meter-high")!;
    this.beatEl = document.getElementById("beat-indicator")!;
    this.audioSelect = document.getElementById("audio-select") as HTMLSelectElement;
    this.videoSelect = document.getElementById("video-select") as HTMLSelectElement;
    this.strobeWarning = document.getElementById("strobe-warning")!;

    this.audioSelect.addEventListener("change", async () => {
      const deviceId = this.audioSelect.value;
      if (deviceId) {
        await this.audio.init(deviceId);
      }
    });

    this.videoSelect.addEventListener("change", async () => {
      this.selectedVideoDeviceId = this.videoSelect.value || undefined;
      // If webcam is currently active, switch device live
      if (this.renderer.needsWebcam) {
        await this.renderer.startWebcam(this.selectedVideoDeviceId);
      }
    });
  }

  getSelectedVideoDeviceId(): string | undefined {
    return this.selectedVideoDeviceId;
  }

  async populateDevices() {
    const allDevices = await navigator.mediaDevices.enumerateDevices();

    // Audio inputs
    const audioDevices = allDevices.filter((d) => d.kind === "audioinput");
    this.audioSelect.innerHTML = "";
    if (audioDevices.length === 0) {
      const opt = document.createElement("option");
      opt.textContent = "No audio devices";
      this.audioSelect.appendChild(opt);
    } else {
      for (const device of audioDevices) {
        const opt = document.createElement("option");
        opt.value = device.deviceId;
        opt.textContent = device.label || `Audio ${device.deviceId.slice(0, 8)}`;
        this.audioSelect.appendChild(opt);
      }
    }

    // Video inputs
    const videoDevices = allDevices.filter((d) => d.kind === "videoinput");
    this.videoSelect.innerHTML = "";
    if (videoDevices.length === 0) {
      const opt = document.createElement("option");
      opt.textContent = "No video devices";
      this.videoSelect.appendChild(opt);
    } else {
      for (const device of videoDevices) {
        const opt = document.createElement("option");
        opt.value = device.deviceId;
        opt.textContent = device.label || `Camera ${device.deviceId.slice(0, 8)}`;
        this.videoSelect.appendChild(opt);
      }
    }
  }

  toggle() {
    this.visible = !this.visible;
    this.el.classList.toggle("hidden", !this.visible);
  }

  updatePreset(_index: number, preset: Preset) {
    const keyLabels: Record<string, string> = {
      "00_camera": "0",
      "00_camera_acid": "Q",
      "00_camera_blur": "W",
      "00_camera_strobe": "E",
    };
    const label = keyLabels[preset.id] ?? preset.id.split("_")[0].replace(/^0/, "");
    this.presetEl.textContent = `[${label}] ${preset.name}`;
    const isStrobe = preset.id === "09_strobe" || preset.id === "00_camera_strobe";
    this.strobeWarning.classList.toggle("hidden", !isStrobe);
  }

  update() {
    const data = this.audio.data;
    this.fpsEl.textContent = `${this.renderer.fps} FPS`;
    this.bassBar.style.width = `${data.bass * 100}%`;
    this.midBar.style.width = `${data.mid * 100}%`;
    this.highBar.style.width = `${data.high * 100}%`;
    this.beatEl.className = data.beat > 0.5 ? "beat-on" : "beat-off";
  }
}
