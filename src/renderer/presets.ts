export interface Preset {
  id: string;
  name: string;
  fragmentShader: string;
}

export interface PresetDef {
  id: string;
  name: string;
  key?: string; // custom key binding (for non-numeric presets)
  special?: string; // special clip styling (e.g., "magic")
}

export const shaderFiles: PresetDef[] = [
  { id: "00_camera", name: "CAMERA GLITCH", key: "0" },
  { id: "00_camera_acid", name: "CAMERA ACID", key: "q" },
  { id: "00_camera_blur", name: "CAMERA BLUR", key: "w" },
  { id: "00_camera_strobe", name: "CAMERA STROBE", key: "e" },
  { id: "01_glitch", name: "GLITCH" },
  { id: "02_plasma", name: "PLASMA" },
  { id: "03_kaleidoscope", name: "KALEIDOSCOPE" },
  { id: "04_particles", name: "PARTICLES" },
  { id: "05_tunnel", name: "TUNNEL" },
  { id: "06_grid", name: "GRID" },
  { id: "07_noise", name: "NOISE" },
  { id: "08_chromatic", name: "CHROMATIC" },
  { id: "09_strobe", name: "STROBE" },
  { id: "10_magic", name: "MAGIC!", special: "magic" },
  { id: "11_melt", name: "MELT" },
  { id: "12_fractal", name: "FRACTAL" },
  { id: "13_matrix", name: "MATRIX" },
  { id: "14_void", name: "VOID" },
  { id: "15_acid", name: "ACID" },
  { id: "16_shatter", name: "SHATTER" },
  { id: "17_warp", name: "WARP" },
];

export function getKeyMap(): Map<string, number> {
  const map = new Map<string, number>();
  shaderFiles.forEach((sf, i) => {
    if (sf.key) map.set(sf.key, i);
  });
  // 1-9 map to the numbered presets (index 4..12)
  for (let n = 1; n <= 9; n++) {
    const idx = shaderFiles.findIndex((s) => s.id === `0${n}_` || s.id.startsWith(`0${n}_`));
    if (idx >= 0) map.set(String(n), idx);
  }
  return map;
}

export async function loadPresets(): Promise<Preset[]> {
  const presets: Preset[] = [];

  for (const sf of shaderFiles) {
    const resp = await fetch(`shaders/${sf.id}.frag`);
    const fragmentShader = await resp.text();
    presets.push({ id: sf.id, name: sf.name, fragmentShader });
  }

  return presets;
}
