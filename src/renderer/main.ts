import { AudioEngine } from "./audio";
import { GLRenderer } from "./renderer";
import { loadPresets, getKeyMap, shaderFiles, type Preset } from "./presets";
import { OverlayManager } from "./overlays";
import { MIDIEngine } from "./midi";

declare global {
  interface Window {
    electronAPI?: {
      toggleFullscreen: () => void;
      exitFullscreen: () => void;
      toggleAlwaysOnTop: () => void;
      toggleOutput: () => Promise<boolean>;
      onOutputClosed: (callback: () => void) => void;
      onOutputReady: (callback: () => void) => void;
      sendToOutput: (cmd: string, data?: any) => void;
    };
  }
}

async function main() {
  const canvas = document.getElementById("glcanvas") as HTMLCanvasElement;
  const glRenderer = new GLRenderer(canvas);
  const audioEngine = new AudioEngine();
  const overlays = new OverlayManager(canvas);
  const midi = new MIDIEngine();

  // Enable edit mode permanently in control UI so preview canvas is interactive
  overlays.setEditMode(true);

  let outputActive = false;
  let currentPresetIndex = 0;
  let selectedLayerIndex = -1;

  // Load shaders
  const presets = await loadPresets();
  for (const preset of presets) {
    glRenderer.compileShader(preset.id, preset.fragmentShader);
  }

  const keyMap = getKeyMap();

  // ── Send command to output window ──
  function sendOutput(cmd: string, data?: any) {
    if (outputActive && window.electronAPI) {
      window.electronAPI.sendToOutput(cmd, data);
    }
  }

  // ── Set preset ──
  function setPreset(index: number) {
    if (index < 0 || index >= presets.length) return;
    currentPresetIndex = index;
    const preset = presets[index];

    // Preview
    glRenderer.useProgram(preset.id);
    if (glRenderer.needsWebcam) {
      glRenderer.startWebcam(getSelectedVideoDeviceId()).catch(() => {});
    } else if (!glRenderer.isCrossfading) {
      glRenderer.stopWebcam();
    }

    // Output
    sendOutput("set-preset", {
      presetId: preset.id,
      videoDeviceId: getSelectedVideoDeviceId(),
    });

    updateClipGrid();
    midi.updatePresetLEDs(currentPresetIndex, presets.length);
  }

  function getSelectedVideoDeviceId(): string | undefined {
    const sel = document.getElementById("video-select") as HTMLSelectElement;
    return sel.value || undefined;
  }

  // ── Init audio ──
  try {
    await audioEngine.init();
  } catch (e) {
    console.warn("Audio init failed:", e);
  }

  // ── Populate devices (preserves current selection) ──
  async function populateDevices() {
    const allDevices = await navigator.mediaDevices.enumerateDevices();

    const audioSelect = document.getElementById("audio-select") as HTMLSelectElement;
    const prevAudio = audioSelect.value;
    const audioDevices = allDevices.filter((d) => d.kind === "audioinput");
    audioSelect.innerHTML = "";
    for (const device of audioDevices) {
      const opt = document.createElement("option");
      opt.value = device.deviceId;
      opt.textContent = device.label || `Audio ${device.deviceId.slice(0, 8)}`;
      audioSelect.appendChild(opt);
    }
    if (prevAudio && [...audioSelect.options].some((o) => o.value === prevAudio)) {
      audioSelect.value = prevAudio;
    }

    const videoSelect = document.getElementById("video-select") as HTMLSelectElement;
    const prevVideo = videoSelect.value;
    const videoDevices = allDevices.filter((d) => d.kind === "videoinput");
    videoSelect.innerHTML = '<option value="">None</option>';
    for (const device of videoDevices) {
      const opt = document.createElement("option");
      opt.value = device.deviceId;
      opt.textContent = device.label || `Camera ${device.deviceId.slice(0, 8)}`;
      videoSelect.appendChild(opt);
    }
    if (prevVideo && [...videoSelect.options].some((o) => o.value === prevVideo)) {
      videoSelect.value = prevVideo;
    }
  }

  await populateDevices();

  // Re-populate on device change (e.g., plugging in a new mic/camera)
  navigator.mediaDevices.addEventListener("devicechange", () => populateDevices());

  // Audio device change
  document.getElementById("audio-select")!.addEventListener("change", async (e) => {
    const deviceId = (e.target as HTMLSelectElement).value;
    if (deviceId) {
      await audioEngine.init(deviceId);
      sendOutput("set-audio-device", { deviceId });
    }
  });

  // Video device change
  document.getElementById("video-select")!.addEventListener("change", async () => {
    if (glRenderer.needsWebcam) {
      await glRenderer.startWebcam(getSelectedVideoDeviceId());
    }
    sendOutput("set-preset", {
      presetId: presets[currentPresetIndex].id,
      videoDeviceId: getSelectedVideoDeviceId(),
    });
  });

  // ── Build clip grid ──
  const clipGrid = document.getElementById("clip-grid")!;

  const keyLabels: Record<string, string> = {
    "00_camera": "0",
    "00_camera_acid": "Q",
    "00_camera_blur": "W",
    "00_camera_strobe": "E",
  };

  function buildClipGrid() {
    clipGrid.innerHTML = "";

    presets.forEach((preset, idx) => {
      const cell = document.createElement("div");
      cell.className = "clip-cell";
      if (preset.id.startsWith("00_camera")) cell.classList.add("camera");
      const def = shaderFiles[idx];
      if (def?.special === "magic") cell.classList.add("magic");
      if (idx === currentPresetIndex) cell.classList.add("active");
      cell.dataset.index = String(idx);

      const label = keyLabels[preset.id] ?? preset.id.split("_")[0].replace(/^0/, "");

      // MIDI badge
      const mapping = midi.getMappingForAction(`preset:${idx}`);
      const badge = mapping ? `<span class="clip-midi-badge">${MIDIEngine.mappingLabel(mapping)}</span>` : "";

      cell.innerHTML = `
        <span class="clip-key">${label}</span>
        <span class="clip-name">${preset.name}</span>
        ${badge}
      `;

      // Left click = activate preset
      cell.addEventListener("click", () => setPreset(idx));

      // Right click = MIDI learn
      cell.addEventListener("contextmenu", (e) => {
        e.preventDefault();
        startMIDILearn(`preset:${idx}`, cell);
      });

      clipGrid.appendChild(cell);
    });
  }

  function updateClipGrid() {
    const cells = clipGrid.querySelectorAll(".clip-cell");
    cells.forEach((cell, idx) => {
      cell.classList.toggle("active", idx === currentPresetIndex);
    });
  }

  function refreshClipBadges() {
    const cells = clipGrid.querySelectorAll(".clip-cell");
    cells.forEach((cell, idx) => {
      let badge = cell.querySelector(".clip-midi-badge");
      const mapping = midi.getMappingForAction(`preset:${idx}`);
      if (mapping) {
        if (!badge) {
          badge = document.createElement("span");
          badge.className = "clip-midi-badge";
          cell.appendChild(badge);
        }
        badge.textContent = MIDIEngine.mappingLabel(mapping);
      } else if (badge) {
        badge.remove();
      }
    });
  }

  buildClipGrid();

  // ── MIDI Learn UI ──
  const learnBanner = document.getElementById("midi-learn-banner")!;
  const learnText = document.getElementById("midi-learn-text")!;
  let learningCell: HTMLElement | null = null;

  function startMIDILearn(action: string, element?: HTMLElement) {
    midi.startLearn(action);
    learnBanner.classList.remove("hidden");
    learnText.textContent = `Waiting for MIDI... (${action})`;

    // Highlight the learning element
    if (learningCell) learningCell.classList.remove("learning");
    learningCell = element ?? null;
    if (learningCell) learningCell.classList.add("learning");
  }

  function endMIDILearn() {
    midi.cancelLearn();
    learnBanner.classList.add("hidden");
    if (learningCell) learningCell.classList.remove("learning");
    learningCell = null;
  }

  document.getElementById("btn-midi-learn-cancel")!.addEventListener("click", endMIDILearn);

  document.getElementById("btn-midi-clear")!.addEventListener("click", () => {
    midi.importMappings({});
    refreshClipBadges();
    updateLayerList();
  });

  // Right-click on transport buttons for MIDI learn
  document.getElementById("btn-strobe")!.addEventListener("contextmenu", (e) => {
    e.preventDefault();
    startMIDILearn("strobe", e.currentTarget as HTMLElement);
  });
  document.getElementById("btn-beat")!.addEventListener("contextmenu", (e) => {
    e.preventDefault();
    startMIDILearn("beat", e.currentTarget as HTMLElement);
  });

  // ── Output toggle ──
  const btnOutput = document.getElementById("btn-output")!;
  const outputStatus = document.getElementById("output-status")!;

  if (window.electronAPI) {
    window.electronAPI.onOutputClosed(() => {
      outputActive = false;
      btnOutput.classList.remove("live");
      outputStatus.textContent = "OFF";
      outputStatus.className = "output-off";
    });

    window.electronAPI.onOutputReady(() => {
      sendOutput("set-preset", {
        presetId: presets[currentPresetIndex].id,
        videoDeviceId: getSelectedVideoDeviceId(),
      });
      sendOutput("set-speed", { speed: glRenderer.speed });
      const [cr, cg, cb] = glRenderer.getRGB();
      sendOutput("set-color-grade", { brightness: glRenderer.getBrightness(), r: cr, g: cg, b: cb });
      syncOverlaysToOutput();
    });
  }

  btnOutput.addEventListener("click", async () => {
    if (window.electronAPI) {
      const opened = await window.electronAPI.toggleOutput();
      outputActive = opened;
      btnOutput.classList.toggle("live", opened);
      outputStatus.textContent = opened ? "LIVE" : "OFF";
      outputStatus.className = opened ? "output-on" : "output-off";
    }
  });

  // ── Overlay management ──
  function syncOverlaysToOutput() {
    const layers = overlays.getLayerInfo();
    layers.forEach((_, idx) => {
      const item = overlays.getItemByIndex(idx);
      if (!item) return;
      if (item.type === "text") {
        sendOutput("add-overlay-text", { text: item.text, color: item.color, fontSize: item.fontSize });
      } else if (item.type === "image" && item.dataUrl) {
        sendOutput("add-overlay-image", { dataUrl: item.dataUrl });
      }
      // Sync transform and visibility
      sendOutput("set-overlay-transform", {
        index: idx, x: item.x, y: item.y, scale: item.scale, rotation: item.rotation,
      });
      sendOutput("set-overlay-visible", { index: idx, visible: item.visible });
      sendOutput("set-overlay-effect", { index: idx, effect: item.effect ?? "none" });
    });
  }

  function syncOverlayTransform(index: number) {
    const item = overlays.getItemByIndex(index);
    if (!item) return;
    sendOutput("set-overlay-transform", {
      index,
      x: item.x,
      y: item.y,
      scale: item.scale,
      rotation: item.rotation,
    });
  }

  function selectLayer(index: number) {
    selectedLayerIndex = index;
    overlays.selectByIndex(index);
    updateLayerList();
    updateLayerProps();
  }

  function updateLayerList() {
    const layerList = document.getElementById("layer-list")!;
    const layers = overlays.getLayerInfo();

    if (layers.length === 0) {
      layerList.innerHTML = '<div style="padding:10px;color:#333;font-size:10px;">No layers — drop an image or add text</div>';
      document.getElementById("layer-props")!.classList.add("hidden");
      selectedLayerIndex = -1;
      return;
    }

    layerList.innerHTML = layers.map((l, idx) => {
      const midiMapping = midi.getMappingForAction(`layer:${idx}`);
      const midiBadge = midiMapping ? ` <span style="color:#666;font-size:8px">${MIDIEngine.mappingLabel(midiMapping)}</span>` : "";
      return `
      <div class="layer-row ${idx === selectedLayerIndex ? 'selected' : ''}" data-index="${idx}">
        <button class="layer-vis-btn ${l.visible ? '' : 'off'}" data-action="toggle" data-index="${idx}">
          ${l.visible ? '\u25CF' : '\u25CB'}
        </button>
        <span class="layer-name ${l.visible ? '' : 'off'}" data-action="select" data-index="${idx}">${l.name}${midiBadge}</span>
        <button class="layer-del-btn" data-action="delete" data-index="${idx}">\u2715</button>
      </div>
    `;
    }).join("");
  }

  function updateLayerProps() {
    const propsEl = document.getElementById("layer-props")!;
    const item = overlays.getItemByIndex(selectedLayerIndex);
    if (!item) {
      propsEl.classList.add("hidden");
      return;
    }

    propsEl.classList.remove("hidden");
    (document.getElementById("prop-effect") as HTMLSelectElement).value = item.effect ?? "none";
    (document.getElementById("prop-scale") as HTMLInputElement).value = String(Math.round(item.scale * 100));
    document.getElementById("prop-scale-val")!.textContent = item.scale.toFixed(2);

    const degVal = Math.round(item.rotation * 180 / Math.PI);
    (document.getElementById("prop-rotation") as HTMLInputElement).value = String(degVal);
    document.getElementById("prop-rotation-val")!.innerHTML = `${degVal}&deg;`;

    (document.getElementById("prop-x") as HTMLInputElement).value = String(Math.round(item.x * 100));
    document.getElementById("prop-x-val")!.textContent = item.x.toFixed(2);

    (document.getElementById("prop-y") as HTMLInputElement).value = String(Math.round(item.y * 100));
    document.getElementById("prop-y-val")!.textContent = item.y.toFixed(2);
  }

  // Layer list click handlers
  document.getElementById("layer-list")!.addEventListener("click", (e) => {
    const btn = (e.target as HTMLElement).closest("[data-action]") as HTMLElement;
    if (!btn) return;
    const action = btn.dataset.action;
    const index = parseInt(btn.dataset.index!);

    if (action === "toggle") {
      overlays.toggleByIndex(index);
      const info = overlays.getLayerInfo()[index];
      if (info) sendOutput("set-overlay-visible", { index, visible: info.visible });
      updateLayerList();
    } else if (action === "delete") {
      overlays.removeByIndex(index);
      sendOutput("remove-overlay", { index });
      if (selectedLayerIndex === index) selectedLayerIndex = -1;
      else if (selectedLayerIndex > index) selectedLayerIndex--;
      updateLayerList();
      updateLayerProps();
    } else if (action === "select") {
      selectLayer(index);
    }
  });

  // Right-click on layer for MIDI learn
  document.getElementById("layer-list")!.addEventListener("contextmenu", (e) => {
    const row = (e.target as HTMLElement).closest(".layer-row") as HTMLElement;
    if (!row) return;
    e.preventDefault();
    const index = parseInt(row.dataset.index!);
    startMIDILearn(`layer:${index}`, row);
  });

  // Layer effect dropdown
  document.getElementById("prop-effect")!.addEventListener("change", (e) => {
    if (selectedLayerIndex < 0) return;
    const effect = (e.target as HTMLSelectElement).value;
    overlays.setEffectByIndex(selectedLayerIndex, effect as any);
    sendOutput("set-overlay-effect", { index: selectedLayerIndex, effect });
  });

  // Layer property sliders
  document.getElementById("prop-scale")!.addEventListener("input", (e) => {
    if (selectedLayerIndex < 0) return;
    const val = parseInt((e.target as HTMLInputElement).value) / 100;
    overlays.setScaleByIndex(selectedLayerIndex, val);
    document.getElementById("prop-scale-val")!.textContent = val.toFixed(2);
    syncOverlayTransform(selectedLayerIndex);
  });

  document.getElementById("prop-rotation")!.addEventListener("input", (e) => {
    if (selectedLayerIndex < 0) return;
    const deg = parseInt((e.target as HTMLInputElement).value);
    const rad = deg * Math.PI / 180;
    overlays.setRotationByIndex(selectedLayerIndex, rad);
    document.getElementById("prop-rotation-val")!.innerHTML = `${deg}&deg;`;
    syncOverlayTransform(selectedLayerIndex);
  });

  document.getElementById("prop-x")!.addEventListener("input", (e) => {
    if (selectedLayerIndex < 0) return;
    const val = parseInt((e.target as HTMLInputElement).value) / 100;
    const item = overlays.getItemByIndex(selectedLayerIndex);
    if (item) {
      overlays.setPositionByIndex(selectedLayerIndex, val, item.y);
      document.getElementById("prop-x-val")!.textContent = val.toFixed(2);
      syncOverlayTransform(selectedLayerIndex);
    }
  });

  document.getElementById("prop-y")!.addEventListener("input", (e) => {
    if (selectedLayerIndex < 0) return;
    const val = parseInt((e.target as HTMLInputElement).value) / 100;
    const item = overlays.getItemByIndex(selectedLayerIndex);
    if (item) {
      overlays.setPositionByIndex(selectedLayerIndex, item.x, val);
      document.getElementById("prop-y-val")!.textContent = val.toFixed(2);
      syncOverlayTransform(selectedLayerIndex);
    }
  });

  // Track last-sent overlay transforms (4 floats per overlay: x, y, scale, rotation)
  let lastOverlayXYSR: Float64Array = new Float64Array(0);

  function syncAllOverlayTransforms() {
    const count = overlays.overlayCount;
    // Grow buffer if needed
    if (lastOverlayXYSR.length < count * 4) {
      const newBuf = new Float64Array(count * 4);
      newBuf.set(lastOverlayXYSR);
      // Fill new slots with NaN so they always mismatch on first check
      for (let j = lastOverlayXYSR.length; j < newBuf.length; j++) newBuf[j] = NaN;
      lastOverlayXYSR = newBuf;
    }
    for (let i = 0; i < count; i++) {
      const item = overlays.getItemByIndex(i);
      if (!item) continue;
      const off = i * 4;
      if (item.x !== lastOverlayXYSR[off] || item.y !== lastOverlayXYSR[off + 1] ||
          item.scale !== lastOverlayXYSR[off + 2] || item.rotation !== lastOverlayXYSR[off + 3]) {
        lastOverlayXYSR[off] = item.x;
        lastOverlayXYSR[off + 1] = item.y;
        lastOverlayXYSR[off + 2] = item.scale;
        lastOverlayXYSR[off + 3] = item.rotation;
        sendOutput("set-overlay-transform", {
          index: i, x: item.x, y: item.y, scale: item.scale, rotation: item.rotation,
        });
      }
    }
  }

  // Update property sliders when interacting on the preview canvas
  canvas.addEventListener("mouseup", () => {
    if (selectedLayerIndex >= 0) updateLayerProps();
  });
  canvas.addEventListener("wheel", () => {
    if (selectedLayerIndex >= 0) setTimeout(updateLayerProps, 0);
  });

  // Add text overlay
  document.getElementById("btn-add-text")!.addEventListener("click", () => {
    const dialog = document.getElementById("text-dialog")!;
    const input = document.getElementById("text-input") as HTMLInputElement;
    dialog.classList.remove("hidden");
    input.value = "";
    input.focus();
  });

  function submitText() {
    const input = document.getElementById("text-input") as HTMLInputElement;
    const text = input.value.trim();
    if (text) {
      const colorInput = document.getElementById("text-color") as HTMLInputElement;
      overlays.addText(text, colorInput.value, 72);
      sendOutput("add-overlay-text", { text, color: colorInput.value, fontSize: 72 });
      updateLayerList();
    }
    document.getElementById("text-dialog")!.classList.add("hidden");
  }

  document.getElementById("text-input")!.addEventListener("keydown", (e) => {
    if (e.key === "Enter") { e.preventDefault(); submitText(); }
    else if (e.key === "Escape") document.getElementById("text-dialog")!.classList.add("hidden");
  });
  document.getElementById("text-submit")!.addEventListener("click", submitText);

  // Add image overlay
  const fileInput = document.getElementById("file-input") as HTMLInputElement;
  document.getElementById("btn-add-img")!.addEventListener("click", () => {
    fileInput.click();
  });

  fileInput.addEventListener("change", () => {
    const file = fileInput.files?.[0];
    if (!file) return;
    overlays.addImage(file).then((item) => {
      updateLayerList();
      if (item.dataUrl) {
        sendOutput("add-overlay-image", { dataUrl: item.dataUrl });
      }
    });
    fileInput.value = "";
  });

  // Drag-drop images
  document.body.addEventListener("dragover", (e) => {
    e.preventDefault();
    e.dataTransfer!.dropEffect = "copy";
  });
  document.body.addEventListener("drop", (e) => {
    e.preventDefault();
    const files = e.dataTransfer?.files;
    if (!files) return;
    for (const file of files) {
      if (file.type.startsWith("image/")) {
        overlays.addImage(file).then(() => {
          updateLayerList();
          const reader = new FileReader();
          reader.onload = () => {
            sendOutput("add-overlay-image", { dataUrl: reader.result });
          };
          reader.readAsDataURL(file);
        });
      }
    }
  });

  // ── Transport controls ──
  document.getElementById("btn-strobe")!.addEventListener("click", () => {
    glRenderer.triggerStrobe();
    sendOutput("trigger-strobe");
  });

  document.getElementById("btn-beat")!.addEventListener("click", () => {
    audioEngine.triggerManualBeat();
  });

  const speedDisplay = document.getElementById("speed-display")!;
  document.querySelectorAll(".speed-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const val = (btn as HTMLElement).dataset.speed!;
      if (val === "reset") {
        glRenderer.setSpeed(1.0);
      } else {
        glRenderer.setSpeed(glRenderer.speed + parseFloat(val));
      }
      speedDisplay.textContent = `${glRenderer.speed.toFixed(1)}x`;
      sendOutput("set-speed", { speed: glRenderer.speed });
    });
  });

  // ── Color grade controls ──
  function syncColorGrade() {
    const b = parseInt((document.getElementById("ctrl-brightness") as HTMLInputElement).value) / 100;
    const r = parseInt((document.getElementById("ctrl-r") as HTMLInputElement).value) / 100;
    const g = parseInt((document.getElementById("ctrl-g") as HTMLInputElement).value) / 100;
    const bl = parseInt((document.getElementById("ctrl-b") as HTMLInputElement).value) / 100;
    glRenderer.setBrightness(b);
    glRenderer.setRGB(r, g, bl);
    sendOutput("set-color-grade", { brightness: b, r, g, b: bl });
  }

  document.getElementById("ctrl-brightness")!.addEventListener("input", (e) => {
    const v = (e.target as HTMLInputElement).value;
    document.getElementById("ctrl-brightness-val")!.textContent = `${v}%`;
    syncColorGrade();
  });

  for (const ch of ["r", "g", "b"]) {
    document.getElementById(`ctrl-${ch}`)!.addEventListener("input", (e) => {
      const v = (e.target as HTMLInputElement).value;
      document.getElementById(`ctrl-${ch}-val`)!.textContent = `${v}%`;
      syncColorGrade();
    });
  }

  // ── MIDI ──
  const midiSelect = document.getElementById("midi-select") as HTMLSelectElement;
  const midiStatus = document.getElementById("midi-status")!;

  midi.onDevicesChanged = (devices) => {
    const prevMidi = midiSelect.value;
    midiSelect.innerHTML = '<option value="">No MIDI</option>';
    for (const [id, name] of devices) {
      const opt = document.createElement("option");
      opt.value = id;
      opt.textContent = name;
      midiSelect.appendChild(opt);
    }
    if (prevMidi && [...midiSelect.options].some((o) => o.value === prevMidi)) {
      midiSelect.value = prevMidi;
    }
  };

  // MIDI learn complete callback
  midi.onLearnComplete = (action, mapping) => {
    endMIDILearn();
    refreshClipBadges();
    updateLayerList();
  };

  // MIDI action callback (fires when a mapped control is used)
  midi.onAction = (action, value) => {
    if (action.startsWith("preset:")) {
      const idx = parseInt(action.split(":")[1]);
      if (value > 0) setPreset(idx);
    } else if (action === "strobe") {
      if (value > 0) {
        glRenderer.triggerStrobe();
        sendOutput("trigger-strobe");
      }
    } else if (action === "beat") {
      if (value > 0) audioEngine.triggerManualBeat();
    } else if (action.startsWith("layer:")) {
      if (value > 0) {
        const idx = parseInt(action.split(":")[1]);
        overlays.toggleByIndex(idx);
        const info = overlays.getLayerInfo()[idx];
        if (info) sendOutput("set-overlay-visible", { index: idx, visible: info.visible });
        updateLayerList();
      }
    } else if (action === "speed") {
      // CC value 0-127 -> speed 0.1-4.0
      const speed = 0.1 + (value / 127) * 3.9;
      glRenderer.setSpeed(speed);
      speedDisplay.textContent = `${glRenderer.speed.toFixed(1)}x`;
      sendOutput("set-speed", { speed: glRenderer.speed });
    }
  };

  await midi.init();

  midiSelect.addEventListener("change", () => {
    const deviceId = midiSelect.value;
    if (deviceId) {
      midi.connect(deviceId);
      midiStatus.textContent = "Connected";
      midiStatus.className = "midi-status connected";
    } else {
      midi.disconnect();
      midiStatus.textContent = "Disconnected";
      midiStatus.className = "midi-status";
    }
  });

  // ── Keyboard shortcuts ──
  window.addEventListener("keydown", (e) => {
    const dialog = document.getElementById("text-dialog");
    if (dialog && !dialog.classList.contains("hidden")) return;
    if ((e.target as HTMLElement).tagName === "INPUT" || (e.target as HTMLElement).tagName === "SELECT") return;

    const key = e.key.toLowerCase();

    // Shift+digit: toggle overlay layer
    const shiftDigitMap: Record<string, number> = {
      "!": 1, "@": 2, "#": 3, "$": 4, "%": 5,
      "^": 6, "&": 7, "*": 8, "(": 9,
    };
    const layerNum = shiftDigitMap[e.key];
    if (e.shiftKey && layerNum) {
      const idx = layerNum - 1;
      overlays.toggleByIndex(idx);
      const info = overlays.getLayerInfo()[idx];
      if (info) sendOutput("set-overlay-visible", { index: idx, visible: info.visible });
      updateLayerList();
      e.preventDefault();
      return;
    }

    if (key === "s") {
      glRenderer.triggerStrobe();
      sendOutput("trigger-strobe");
      return;
    }

    if (key === "b") {
      audioEngine.triggerManualBeat();
      return;
    }

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
      case "m":
        btnOutput.click();
        break;
      case "f":
        if (window.electronAPI) window.electronAPI.toggleFullscreen();
        break;
      case "+":
      case "=":
        glRenderer.setSpeed(glRenderer.speed + 0.1);
        speedDisplay.textContent = `${glRenderer.speed.toFixed(1)}x`;
        sendOutput("set-speed", { speed: glRenderer.speed });
        break;
      case "-":
        glRenderer.setSpeed(glRenderer.speed - 0.1);
        speedDisplay.textContent = `${glRenderer.speed.toFixed(1)}x`;
        sendOutput("set-speed", { speed: glRenderer.speed });
        break;
      case "arrowup":
        glRenderer.setSpeed(glRenderer.speed + 0.25);
        speedDisplay.textContent = `${glRenderer.speed.toFixed(1)}x`;
        sendOutput("set-speed", { speed: glRenderer.speed });
        break;
      case "arrowdown":
        glRenderer.setSpeed(glRenderer.speed - 0.25);
        speedDisplay.textContent = `${glRenderer.speed.toFixed(1)}x`;
        sendOutput("set-speed", { speed: glRenderer.speed });
        break;
      case "arrowright":
        glRenderer.setSpeed(1.0);
        speedDisplay.textContent = "1.0x";
        sendOutput("set-speed", { speed: 1.0 });
        break;
      case "escape":
        if (midi.isLearning) {
          endMIDILearn();
        } else if (window.electronAPI) {
          window.electronAPI.exitFullscreen();
        }
        break;
    }
  });

  // ── Start on first non-camera preset ──
  const defaultIdx = keyMap.get("1") ?? 0;
  setPreset(defaultIdx);

  // ── Resize ──
  window.addEventListener("resize", () => glRenderer.resize());

  // ── Render loop ──
  const fpsEl = document.getElementById("fps-display")!;
  const beatDot = document.getElementById("beat-dot")!;
  const meterBass = document.getElementById("meter-bass") as HTMLElement;
  const meterMid = document.getElementById("meter-mid") as HTMLElement;
  const meterHigh = document.getElementById("meter-high") as HTMLElement;

  function loop() {
    try {
      const now = performance.now() / 1000;
      audioEngine.update(now);

      // Always update audio meters even if WebGL rendering fails
      const data = audioEngine.data;
      meterBass.style.width = `${data.bass * 100}%`;
      meterMid.style.width = `${data.mid * 100}%`;
      meterHigh.style.width = `${data.high * 100}%`;
      beatDot.className = data.beat > 0.5 ? "on" : "";

      if (!glRenderer.isContextLost) {
        glRenderer.render(data);
        overlays.render({ time: glRenderer.time, bass: data.bass, mid: data.mid, high: data.high, beat: data.beat, beatTime: data.beatTime });
      }

      // Sync overlay transforms to output every frame (only sends when changed)
      if (outputActive) syncAllOverlayTransforms();

      fpsEl.textContent = `${glRenderer.fps} FPS`;
    } catch (e) {
      console.error("Render loop error:", e);
    }

    requestAnimationFrame(loop);
  }

  requestAnimationFrame(loop);
}

main();
