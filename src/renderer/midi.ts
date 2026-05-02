// MIDI engine with manual MIDI Learn mapping
// Works with any MIDI controller — no hardcoded layouts

export interface MIDIMapping {
  type: "note" | "cc";
  channel: number;
  number: number;  // note number or CC number
}

// Serializable key for the mapping map
function mappingKey(m: MIDIMapping): string {
  return `${m.type}:${m.channel}:${m.number}`;
}

// Launchpad LED colors (velocity values) for devices that support it
const LP_COLOR = {
  OFF: 0,
  RED: 5,
  GREEN: 21,
  YELLOW: 13,
  CYAN: 37,
  WHITE: 3,
  DIM_GREEN: 19,
  ORANGE: 9,
};

export class MIDIEngine {
  private access: MIDIAccess | null = null;
  private input: MIDIInput | null = null;
  private output: MIDIOutput | null = null;

  // Manual mappings: MIDI message -> action string
  // Actions: "preset:0", "preset:1", ..., "strobe", "beat", "layer:0", "layer:1", ..., "speed"
  private mappings = new Map<string, string>();

  // MIDI Learn state
  private learnTarget: string | null = null; // action to map next incoming message to

  // Callbacks
  onDevicesChanged: ((devices: [string, string][]) => void) | null = null;
  onAction: ((action: string, value: number) => void) | null = null;
  onLearnComplete: ((action: string, mapping: MIDIMapping) => void) | null = null;
  onMIDIActivity: ((mapping: MIDIMapping, value: number) => void) | null = null;

  async init() {
    try {
      this.access = await navigator.requestMIDIAccess({ sysex: false });
      this.access.onstatechange = () => this.updateDeviceList();
      this.updateDeviceList();
    } catch (e) {
      console.warn("MIDI not available:", e);
    }
  }

  private updateDeviceList() {
    if (!this.access) return;
    const devices: [string, string][] = [];
    this.access.inputs.forEach((input) => {
      devices.push([input.id, input.name ?? `MIDI ${input.id.slice(0, 8)}`]);
    });
    this.onDevicesChanged?.(devices);
  }

  connect(deviceId: string) {
    this.disconnect();
    if (!this.access) return;

    const input = this.access.inputs.get(deviceId);
    if (!input) return;

    this.input = input;
    this.input.onmidimessage = (e) => this.handleMessage(e);

    // Find matching output (same name) for LED feedback
    this.access.outputs.forEach((output) => {
      if (output.name === input.name) {
        this.output = output;
      }
    });
  }

  disconnect() {
    if (this.input) {
      this.input.onmidimessage = null;
      this.input = null;
    }
    this.output = null;
  }

  // Start MIDI learn for a specific action
  startLearn(action: string) {
    this.learnTarget = action;
  }

  cancelLearn() {
    this.learnTarget = null;
  }

  get isLearning(): boolean {
    return this.learnTarget !== null;
  }

  get learningAction(): string | null {
    return this.learnTarget;
  }

  // Remove mapping for an action
  unmapAction(action: string) {
    for (const [key, act] of this.mappings) {
      if (act === action) {
        this.mappings.delete(key);
        break;
      }
    }
  }

  // Get the MIDI mapping for an action (if any)
  getMappingForAction(action: string): MIDIMapping | null {
    for (const [key, act] of this.mappings) {
      if (act === action) {
        const [type, ch, num] = key.split(":");
        return { type: type as "note" | "cc", channel: parseInt(ch), number: parseInt(num) };
      }
    }
    return null;
  }

  // Get a short label for a mapping (e.g., "N36" for note 36, "CC1" for CC 1)
  static mappingLabel(m: MIDIMapping): string {
    return m.type === "note" ? `N${m.number}` : `CC${m.number}`;
  }

  // Export all mappings for persistence
  exportMappings(): Record<string, string> {
    const out: Record<string, string> = {};
    for (const [key, action] of this.mappings) {
      out[key] = action;
    }
    return out;
  }

  // Import mappings
  importMappings(data: Record<string, string>) {
    this.mappings.clear();
    for (const [key, action] of Object.entries(data)) {
      this.mappings.set(key, action);
    }
  }

  private handleMessage(e: MIDIMessageEvent) {
    if (!e.data || e.data.length < 3) return;
    const [status, data1, data2] = e.data;
    const type = status & 0xf0;
    const channel = status & 0x0f;

    let mapping: MIDIMapping | null = null;

    if (type === 0x90 && data2 > 0) {
      // Note On
      mapping = { type: "note", channel, number: data1 };
    } else if (type === 0x80 || (type === 0x90 && data2 === 0)) {
      // Note Off — don't learn from note offs, but do fire action with value 0
      mapping = { type: "note", channel, number: data1 };
      const key = mappingKey(mapping);
      const action = this.mappings.get(key);
      if (action) this.onAction?.(action, 0);
      this.onMIDIActivity?.(mapping, 0);
      return;
    } else if (type === 0xb0) {
      // CC
      mapping = { type: "cc", channel, number: data1 };
    }

    if (!mapping) return;

    this.onMIDIActivity?.(mapping, data2);

    // MIDI Learn mode
    if (this.learnTarget) {
      const action = this.learnTarget;
      this.learnTarget = null;

      // Remove any existing mapping for this action
      this.unmapAction(action);
      // Remove any existing mapping for this MIDI message
      const key = mappingKey(mapping);
      this.mappings.set(key, action);

      this.onLearnComplete?.(action, mapping);
      // Also fire the action immediately
      this.onAction?.(action, mapping.type === "cc" ? data2 : data2);
      return;
    }

    // Look up mapping
    const key = mappingKey(mapping);
    const action = this.mappings.get(key);
    if (action) {
      const value = mapping.type === "cc" ? data2 : data2; // velocity or CC value
      this.onAction?.(action, value);
    }
  }

  // Safe send — handles disconnected controllers without throwing
  private safeSend(data: number[]) {
    if (!this.output) return;
    try {
      this.output.send(data);
    } catch {
      this.output = null; // controller disconnected, stop trying
    }
  }

  // Send LED feedback to controller (Note On on channel 1)
  setLED(note: number, color: number) {
    this.safeSend([0x90, note, color]);
  }

  // Update LEDs for active preset (if mappings use notes)
  updatePresetLEDs(activePresetIndex: number, presetCount: number) {
    if (!this.output) return;
    for (let i = 0; i < presetCount; i++) {
      const m = this.getMappingForAction(`preset:${i}`);
      if (m && m.type === "note") {
        const color = i === activePresetIndex ? LP_COLOR.GREEN : LP_COLOR.DIM_GREEN;
        this.safeSend([0x90 | m.channel, m.number, color]);
      }
    }
  }
}
