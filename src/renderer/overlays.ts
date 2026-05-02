// Overlay system: render PNG images and text on top of shader output
// All overlays render as WebGL textured quads so Resolume captures them

export const OVERLAY_EFFECTS = [
  "none", "wobble", "glitch", "pulse", "chromatic", "pixelate", "wave", "shake", "invert",
] as const;

export type OverlayEffect = typeof OVERLAY_EFFECTS[number];

export interface OverlayItem {
  id: number;
  type: "image" | "text";
  texture: WebGLTexture;
  // Normalized position (0-1 range, center of overlay)
  x: number;
  y: number;
  // Scale (1.0 = original size relative to canvas)
  scale: number;
  // Rotation in radians
  rotation: number;
  // Source dimensions (pixels) for aspect ratio
  srcWidth: number;
  srcHeight: number;
  // Text-specific
  text?: string;
  color?: string;
  fontSize?: number;
  // Image-specific: stored for re-sending to output
  dataUrl?: string;
  // Visibility
  visible: boolean;
  // Effect
  effect: OverlayEffect;
}

interface OverlayShader {
  program: WebGLProgram;
  u_texture: WebGLUniformLocation | null;
  u_transform: WebGLUniformLocation | null;
  u_resolution: WebGLUniformLocation | null;
  u_opacity: WebGLUniformLocation | null;
  u_effect: WebGLUniformLocation | null;
  u_time: WebGLUniformLocation | null;
  u_bass: WebGLUniformLocation | null;
  u_mid: WebGLUniformLocation | null;
  u_high: WebGLUniformLocation | null;
  u_beat: WebGLUniformLocation | null;
  u_beatTime: WebGLUniformLocation | null;
}

const RENDER_WIDTH = 1280;
const RENDER_HEIGHT = 720;

export class OverlayManager {
  private gl: WebGL2RenderingContext;
  private items: OverlayItem[] = [];
  private nextId = 1;
  private selectedId: number | null = null;
  private shader: OverlayShader | null = null;
  private quadVao: WebGLVertexArrayObject | null = null;
  private dragging = false;
  private dragOffsetX = 0;
  private dragOffsetY = 0;
  private editMode = false;
  private textCanvas: HTMLCanvasElement;
  private textCtx: CanvasRenderingContext2D;
  private transformBuf = new Float32Array(9); // reused each frame

  // Vertex shader: transforms a unit quad with a 2D transform matrix
  private vertSrc = `#version 300 es
in vec2 a_position;
out vec2 v_uv;
uniform mat3 u_transform;
void main() {
  v_uv = a_position * 0.5 + 0.5;
  v_uv.y = 1.0 - v_uv.y; // flip Y for texture
  vec3 pos = u_transform * vec3(a_position, 1.0);
  gl_Position = vec4(pos.xy, 0.0, 1.0);
}`;

  // Fragment shader: textured quad with effects
  private fragSrc = `#version 300 es
precision highp float;
in vec2 v_uv;
uniform sampler2D u_texture;
uniform float u_opacity;
uniform int u_effect;
uniform float u_time;
uniform float u_bass;
uniform float u_mid;
uniform float u_high;
uniform float u_beat;
uniform float u_beatTime;
out vec4 fragColor;

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

void main() {
  vec2 uv = v_uv;
  float beatDecay = exp(-u_beatTime * 5.0);

  // === Effect 1: WOBBLE ===
  if (u_effect == 1) {
    float strength = 0.03 + u_bass * 0.04;
    uv.x += sin(uv.y * 12.0 + u_time * 4.0) * strength;
    uv.y += cos(uv.x * 10.0 + u_time * 3.0) * strength * 0.7;
  }

  // === Effect 2: GLITCH ===
  else if (u_effect == 2) {
    float intensity = 0.3 + u_bass * 0.7;
    float blockY = floor(uv.y * 15.0);
    float blockHash = hash(vec2(blockY, floor(u_time * 6.0)));
    if (blockHash > (1.0 - intensity * 0.4)) {
      uv.x += (hash(vec2(blockY, floor(u_time * 8.0) + 1.0)) - 0.5) * 0.15 * intensity;
    }
    // RGB split
    float shift = intensity * 0.015 + beatDecay * 0.03;
    vec4 texR = texture(u_texture, uv + vec2(shift, 0.0));
    vec4 texG = texture(u_texture, uv);
    vec4 texB = texture(u_texture, uv - vec2(shift, 0.0));
    float a = max(max(texR.a, texG.a), texB.a);
    // Random invert on beat
    vec3 col = vec3(texR.r, texG.g, texB.b);
    if (u_beat > 0.5 && hash(vec2(blockY, floor(u_time * 20.0))) > 0.6) {
      col = vec3(1.0) - col;
    }
    fragColor = vec4(col, a * u_opacity);
    return;
  }

  // === Effect 3: PULSE ===
  else if (u_effect == 3) {
    // Scale from center based on bass
    float pulse = 1.0 + u_bass * 0.12 + beatDecay * 0.08;
    uv = (uv - 0.5) * (1.0 / pulse) + 0.5;
  }

  // === Effect 4: CHROMATIC ===
  else if (u_effect == 4) {
    float shift = 0.008 + u_bass * 0.015 + beatDecay * 0.02;
    float angle = u_time * 0.5;
    vec2 dir = vec2(cos(angle), sin(angle)) * shift;
    vec4 texR = texture(u_texture, uv + dir);
    vec4 texG = texture(u_texture, uv);
    vec4 texB = texture(u_texture, uv - dir);
    float a = max(max(texR.a, texG.a), texB.a);
    fragColor = vec4(texR.r, texG.g, texB.b, a * u_opacity);
    return;
  }

  // === Effect 5: PIXELATE ===
  else if (u_effect == 5) {
    float pixels = mix(80.0, 8.0, u_bass);
    uv = floor(uv * pixels) / pixels;
  }

  // === Effect 6: WAVE ===
  else if (u_effect == 6) {
    float amp = 0.04 + u_mid * 0.06;
    uv.x += sin(uv.y * 20.0 + u_time * 5.0) * amp;
    uv.y += sin(uv.x * 15.0 + u_time * 3.0) * amp * 0.3;
  }

  // === Effect 7: SHAKE ===
  else if (u_effect == 7) {
    float shakeAmt = u_bass * 0.04 + beatDecay * 0.06;
    float sx = hash(vec2(floor(u_time * 30.0), 0.0)) - 0.5;
    float sy = hash(vec2(0.0, floor(u_time * 30.0))) - 0.5;
    uv += vec2(sx, sy) * shakeAmt;
  }

  // === Effect 8: INVERT ===
  // (handled after sampling below)

  vec4 tex = texture(u_texture, uv);

  if (u_effect == 8) {
    tex.rgb = vec3(1.0) - tex.rgb;
    // Pulse inversion intensity with beat
    float inv = 0.7 + beatDecay * 0.3;
    tex.rgb = mix(texture(u_texture, uv).rgb, tex.rgb, inv);
  }

  fragColor = vec4(tex.rgb, tex.a * u_opacity);
}`;

  constructor(private canvas: HTMLCanvasElement) {
    const gl = canvas.getContext("webgl2")!;
    this.gl = gl;
    this.textCanvas = document.createElement("canvas");
    this.textCtx = this.textCanvas.getContext("2d")!;
    this.compileShader();
    this.setupQuad();
    this.setupEvents();
  }

  get isEditMode(): boolean {
    return this.editMode;
  }

  get selected(): OverlayItem | null {
    if (this.selectedId === null) return null;
    return this.items.find((i) => i.id === this.selectedId) ?? null;
  }

  get overlayCount(): number {
    return this.items.length;
  }

  setEditMode(enabled: boolean) {
    this.editMode = enabled;
    if (!enabled) this.selectedId = null;
  }

  toggleEditMode(): boolean {
    this.setEditMode(!this.editMode);
    // Only change cursor if we're in the output window (not control UI)
    if (document.body.id === "output-body") {
      document.body.style.cursor = this.editMode ? "default" : "none";
    }
    return this.editMode;
  }

  selectByIndex(index: number): boolean {
    if (index < 0 || index >= this.items.length) return false;
    this.selectedId = this.items[index].id;
    return true;
  }

  getSelectedIndex(): number {
    if (this.selectedId === null) return -1;
    return this.items.findIndex((i) => i.id === this.selectedId);
  }

  // Update scale/rotation/position of item by index
  setScaleByIndex(index: number, scale: number) {
    const item = this.items[index];
    if (item) item.scale = Math.max(0.02, Math.min(5.0, scale));
  }

  setRotationByIndex(index: number, rotation: number) {
    const item = this.items[index];
    if (item) item.rotation = rotation;
  }

  setPositionByIndex(index: number, x: number, y: number) {
    const item = this.items[index];
    if (item) { item.x = x; item.y = y; }
  }

  setEffectByIndex(index: number, effect: OverlayEffect) {
    const item = this.items[index];
    if (item) item.effect = effect;
  }

  private compileShader() {
    const gl = this.gl;

    const vs = gl.createShader(gl.VERTEX_SHADER)!;
    gl.shaderSource(vs, this.vertSrc);
    gl.compileShader(vs);
    if (!gl.getShaderParameter(vs, gl.COMPILE_STATUS)) {
      console.error("Overlay VS error:", gl.getShaderInfoLog(vs));
      return;
    }

    const fs = gl.createShader(gl.FRAGMENT_SHADER)!;
    gl.shaderSource(fs, this.fragSrc);
    gl.compileShader(fs);
    if (!gl.getShaderParameter(fs, gl.COMPILE_STATUS)) {
      console.error("Overlay FS error:", gl.getShaderInfoLog(fs));
      return;
    }

    const program = gl.createProgram()!;
    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.bindAttribLocation(program, 0, "a_position");
    gl.linkProgram(program);

    gl.deleteShader(vs);
    gl.deleteShader(fs);

    this.shader = {
      program,
      u_texture: gl.getUniformLocation(program, "u_texture"),
      u_transform: gl.getUniformLocation(program, "u_transform"),
      u_resolution: gl.getUniformLocation(program, "u_resolution"),
      u_opacity: gl.getUniformLocation(program, "u_opacity"),
      u_effect: gl.getUniformLocation(program, "u_effect"),
      u_time: gl.getUniformLocation(program, "u_time"),
      u_bass: gl.getUniformLocation(program, "u_bass"),
      u_mid: gl.getUniformLocation(program, "u_mid"),
      u_high: gl.getUniformLocation(program, "u_high"),
      u_beat: gl.getUniformLocation(program, "u_beat"),
      u_beatTime: gl.getUniformLocation(program, "u_beatTime"),
    };
  }

  private setupQuad() {
    const gl = this.gl;
    // Unit quad: -1 to 1
    const verts = new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]);
    const vbo = gl.createBuffer()!;
    this.quadVao = gl.createVertexArray()!;
    gl.bindVertexArray(this.quadVao);
    gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
    gl.bufferData(gl.ARRAY_BUFFER, verts, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.bindVertexArray(null);
  }

  private createGLTexture(source: TexImageSource): WebGLTexture {
    const gl = this.gl;
    const tex = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.bindTexture(gl.TEXTURE_2D, null);
    return tex;
  }

  addImage(file: File): Promise<OverlayItem> {
    return new Promise((resolve, reject) => {
      // Read as data URL so we can store it for output sync
      const reader = new FileReader();
      reader.onload = () => {
        const dataUrl = reader.result as string;
        const img = new Image();
        img.onload = () => {
          const texture = this.createGLTexture(img);
          const item: OverlayItem = {
            id: this.nextId++,
            type: "image",
            texture,
            x: 0.5,
            y: 0.5,
            scale: 0.3,
            rotation: 0,
            srcWidth: img.width,
            srcHeight: img.height,
            dataUrl,
            visible: true,
            effect: "none",
          };
          this.items.push(item);
          this.selectedId = item.id;
          resolve(item);
        };
        img.onerror = reject;
        img.src = dataUrl;
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  addText(text: string, color = "#ffffff", fontSize = 72): OverlayItem {
    const ctx = this.textCtx;
    const canvas = this.textCanvas;
    const font = `bold ${fontSize}px "Courier New", monospace`;

    // Measure text
    ctx.font = font;
    const metrics = ctx.measureText(text);
    const w = Math.ceil(metrics.width) + 20;
    const h = Math.ceil(fontSize * 1.4) + 20;

    canvas.width = w;
    canvas.height = h;

    // Render text to canvas
    ctx.clearRect(0, 0, w, h);
    ctx.font = font;
    ctx.fillStyle = color;
    ctx.textBaseline = "middle";
    ctx.textAlign = "center";
    ctx.fillText(text, w / 2, h / 2);

    const texture = this.createGLTexture(canvas);
    const item: OverlayItem = {
      id: this.nextId++,
      type: "text",
      texture,
      x: 0.5,
      y: 0.5,
      scale: 0.4,
      rotation: 0,
      srcWidth: w,
      srcHeight: h,
      text,
      color,
      fontSize,
      visible: true,
      effect: "none",
    };
    this.items.push(item);
    this.selectedId = item.id;
    return item;
  }

  removeSelected(): boolean {
    if (this.selectedId === null) return false;
    const idx = this.items.findIndex((i) => i.id === this.selectedId);
    if (idx === -1) return false;

    this.gl.deleteTexture(this.items[idx].texture);
    this.items.splice(idx, 1);
    this.selectedId = null;
    return true;
  }

  removeByIndex(index: number): boolean {
    if (index < 0 || index >= this.items.length) return false;
    this.gl.deleteTexture(this.items[index].texture);
    this.items.splice(index, 1);
    if (this.selectedId !== null) {
      const sel = this.items.find((i) => i.id === this.selectedId);
      if (!sel) this.selectedId = null;
    }
    return true;
  }

  setVisibleByIndex(index: number, visible: boolean): boolean {
    if (index < 0 || index >= this.items.length) return false;
    this.items[index].visible = visible;
    return true;
  }

  addImageFromDataUrl(dataUrl: string): Promise<OverlayItem> {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        const texture = this.createGLTexture(img);
        const item: OverlayItem = {
          id: this.nextId++,
          type: "image",
          texture,
          x: 0.5,
          y: 0.5,
          scale: 0.3,
          rotation: 0,
          srcWidth: img.width,
          srcHeight: img.height,
          dataUrl,
          visible: true,
          effect: "none",
        };
        this.items.push(item);
        this.selectedId = item.id;
        resolve(item);
      };
      img.onerror = reject;
      img.src = dataUrl;
    });
  }

  toggleSelectedVisibility() {
    const sel = this.selected;
    if (sel) sel.visible = !sel.visible;
  }

  // Toggle overlay visibility by index (0-based). Returns name/info or null.
  toggleByIndex(index: number): { name: string; visible: boolean } | null {
    if (index < 0 || index >= this.items.length) return null;
    const item = this.items[index];
    item.visible = !item.visible;
    const name = item.type === "text" ? `"${item.text}"` : `IMG #${item.id}`;
    return { name, visible: item.visible };
  }

  getItemByIndex(index: number): OverlayItem | null {
    return this.items[index] ?? null;
  }

  // Get layer info for HUD display
  getLayerInfo(): { id: number; name: string; visible: boolean }[] {
    return this.items.map((item, idx) => ({
      id: item.id,
      name: item.type === "text"
        ? `${idx + 1}: "${(item.text ?? "").slice(0, 12)}"`
        : `${idx + 1}: IMG #${item.id}`,
      visible: item.visible,
    }));
  }

  // Convert screen pixel coords to normalized 0-1 coords
  private screenToNorm(clientX: number, clientY: number): { nx: number; ny: number } {
    const rect = this.canvas.getBoundingClientRect();
    return {
      nx: (clientX - rect.left) / rect.width,
      ny: (clientY - rect.top) / rect.height,
    };
  }

  // Hit test: check if a point is inside an overlay's bounding box
  private hitTest(nx: number, ny: number): OverlayItem | null {
    // Check in reverse order (top-most first)
    for (let i = this.items.length - 1; i >= 0; i--) {
      const item = this.items[i];
      if (!item.visible) continue;

      const aspect = item.srcWidth / item.srcHeight;
      const canvasAspect = RENDER_WIDTH / RENDER_HEIGHT;

      // Half-size in normalized coords
      const hw = (item.scale * aspect) / canvasAspect * 0.5;
      const hh = item.scale * 0.5;

      // Rotate the test point around the item center
      const dx = nx - item.x;
      const dy = ny - item.y;
      const cos = Math.cos(-item.rotation);
      const sin = Math.sin(-item.rotation);
      const rx = dx * cos - dy * sin;
      const ry = dx * sin + dy * cos;

      if (Math.abs(rx) <= hw && Math.abs(ry) <= hh) {
        return item;
      }
    }
    return null;
  }

  private setupEvents() {
    const canvas = this.canvas;

    // Drag-and-drop files
    canvas.addEventListener("dragover", (e) => {
      e.preventDefault();
      e.dataTransfer!.dropEffect = "copy";
    });

    canvas.addEventListener("drop", (e) => {
      e.preventDefault();
      const files = e.dataTransfer?.files;
      if (!files) return;
      for (const file of files) {
        if (file.type.startsWith("image/")) {
          this.addImage(file);
          if (!this.editMode) this.toggleEditMode();
        }
      }
    });

    // Mouse interactions (only in edit mode)
    canvas.addEventListener("mousedown", (e) => {
      if (!this.editMode) return;
      const { nx, ny } = this.screenToNorm(e.clientX, e.clientY);
      const hit = this.hitTest(nx, ny);

      if (hit) {
        this.selectedId = hit.id;
        this.dragging = true;
        this.dragOffsetX = nx - hit.x;
        this.dragOffsetY = ny - hit.y;
      } else {
        this.selectedId = null;
      }
    });

    window.addEventListener("mousemove", (e) => {
      if (!this.editMode || !this.dragging) return;
      const sel = this.selected;
      if (!sel) return;

      const { nx, ny } = this.screenToNorm(e.clientX, e.clientY);
      sel.x = nx - this.dragOffsetX;
      sel.y = ny - this.dragOffsetY;
    });

    window.addEventListener("mouseup", () => {
      this.dragging = false;
    });

    // Scroll to resize, Shift+scroll to rotate
    canvas.addEventListener("wheel", (e) => {
      if (!this.editMode) return;
      const sel = this.selected;
      if (!sel) return;

      e.preventDefault();
      if (e.shiftKey) {
        // Rotate: ~5 degrees per scroll tick
        const rotDelta = e.deltaY > 0 ? -0.087 : 0.087;
        sel.rotation += rotDelta;
      } else {
        // Resize
        const delta = e.deltaY > 0 ? -0.02 : 0.02;
        sel.scale = Math.max(0.05, Math.min(3.0, sel.scale + delta));
      }
    }, { passive: false });
  }

  // Handle keyboard events — returns true if consumed
  handleKey(key: string, shiftKey: boolean): boolean {
    if (!this.editMode) return false;

    const sel = this.selected;

    switch (key) {
      case "delete":
      case "backspace":
        return this.removeSelected();
      case "r":
        // Rotate selected (R + arrow or just R to rotate by 15 degrees)
        if (sel) {
          sel.rotation += shiftKey ? -0.2618 : 0.2618; // 15 degrees
          return true;
        }
        return false;
      case "v":
        if (sel) {
          this.toggleSelectedVisibility();
          return true;
        }
        return false;
      default:
        return false;
    }
  }

  // Build a 3x3 transform matrix into reusable buffer
  private buildTransform(item: OverlayItem): Float32Array {
    const aspect = item.srcWidth / item.srcHeight;
    const canvasAspect = RENDER_WIDTH / RENDER_HEIGHT;
    const sx = item.scale * aspect / canvasAspect;
    const sy = item.scale;
    const tx = item.x * 2.0 - 1.0;
    const ty = -(item.y * 2.0 - 1.0);
    const cos = Math.cos(item.rotation);
    const sin = Math.sin(item.rotation);
    const m = this.transformBuf;
    m[0] = sx * cos; m[1] = sx * sin; m[2] = 0;
    m[3] = -sy * sin; m[4] = sy * cos; m[5] = 0;
    m[6] = tx; m[7] = ty; m[8] = 1;
    return m;
  }

  // Build into a NEW array (for selection border which needs two transforms in one frame)
  private buildTransformNew(item: OverlayItem): Float32Array {
    const aspect = item.srcWidth / item.srcHeight;
    const canvasAspect = RENDER_WIDTH / RENDER_HEIGHT;
    const sx = item.scale * aspect / canvasAspect;
    const sy = item.scale;
    const tx = item.x * 2.0 - 1.0;
    const ty = -(item.y * 2.0 - 1.0);
    const cos = Math.cos(item.rotation);
    const sin = Math.sin(item.rotation);
    return new Float32Array([
      sx * cos, sx * sin, 0,
      -sy * sin, sy * cos, 0,
      tx, ty, 1,
    ]);
  }

  render(audio?: { time: number; bass: number; mid: number; high: number; beat: number; beatTime: number }) {
    if (this.items.length === 0) return;

    const gl = this.gl;
    const shader = this.shader;
    if (!shader) return;

    // Enable alpha blending
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

    gl.useProgram(shader.program);
    gl.bindVertexArray(this.quadVao);

    // Set audio uniforms once per frame
    const t = audio?.time ?? 0;
    gl.uniform1f(shader.u_time, t);
    gl.uniform1f(shader.u_bass, audio?.bass ?? 0);
    gl.uniform1f(shader.u_mid, audio?.mid ?? 0);
    gl.uniform1f(shader.u_high, audio?.high ?? 0);
    gl.uniform1f(shader.u_beat, audio?.beat ?? 0);
    gl.uniform1f(shader.u_beatTime, audio?.beatTime ?? 999);

    for (const item of this.items) {
      if (!item.visible) continue;

      const transform = this.buildTransform(item);
      const effectIdx = OVERLAY_EFFECTS.indexOf(item.effect);

      gl.uniformMatrix3fv(shader.u_transform, false, transform);
      gl.uniform1f(shader.u_opacity, 1.0);
      gl.uniform2f(shader.u_resolution, RENDER_WIDTH, RENDER_HEIGHT);
      gl.uniform1i(shader.u_effect, effectIdx);

      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, item.texture);
      gl.uniform1i(shader.u_texture, 0);

      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

      // Draw selection border when in edit mode
      if (this.editMode && item.id === this.selectedId) {
        // Re-render with slight scale increase and low opacity for border effect
        const borderItem = { ...item, scale: item.scale * 1.06 };
        const borderTransform = this.buildTransformNew(borderItem);
        gl.uniformMatrix3fv(shader.u_transform, false, borderTransform);
        gl.uniform1f(shader.u_opacity, 0.3);
        gl.uniform1i(shader.u_effect, 0); // no effect on border
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      }
    }

    gl.bindVertexArray(null);
    gl.disable(gl.BLEND);
  }
}
