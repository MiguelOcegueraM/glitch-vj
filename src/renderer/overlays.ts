// Overlay system: render PNG images and text on top of shader output
// All overlays render as WebGL textured quads so Resolume captures them

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
  // Visibility
  visible: boolean;
}

interface OverlayShader {
  program: WebGLProgram;
  u_texture: WebGLUniformLocation | null;
  u_transform: WebGLUniformLocation | null;
  u_resolution: WebGLUniformLocation | null;
  u_opacity: WebGLUniformLocation | null;
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

  // Fragment shader: textured quad with alpha
  private fragSrc = `#version 300 es
precision mediump float;
in vec2 v_uv;
uniform sampler2D u_texture;
uniform float u_opacity;
out vec4 fragColor;
void main() {
  vec4 tex = texture(u_texture, v_uv);
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

  toggleEditMode(): boolean {
    this.editMode = !this.editMode;
    document.body.style.cursor = this.editMode ? "default" : "none";
    if (!this.editMode) {
      this.selectedId = null;
    }
    return this.editMode;
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
          visible: true,
        };
        this.items.push(item);
        this.selectedId = item.id;
        resolve(item);
      };
      img.onerror = reject;
      img.src = URL.createObjectURL(file);
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

  toggleSelectedVisibility() {
    const sel = this.selected;
    if (sel) sel.visible = !sel.visible;
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

    // Scroll to resize
    canvas.addEventListener("wheel", (e) => {
      if (!this.editMode) return;
      const sel = this.selected;
      if (!sel) return;

      e.preventDefault();
      const delta = e.deltaY > 0 ? -0.02 : 0.02;
      sel.scale = Math.max(0.05, Math.min(3.0, sel.scale + delta));
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

  // Build a 3x3 transform matrix for the overlay quad
  private buildTransform(item: OverlayItem): Float32Array {
    const aspect = item.srcWidth / item.srcHeight;
    const canvasAspect = RENDER_WIDTH / RENDER_HEIGHT;

    // Scale: map from unit quad to item size in NDC (-1 to 1)
    const sx = item.scale * aspect / canvasAspect;
    const sy = item.scale;

    // Translate: map from 0-1 normalized to NDC
    const tx = item.x * 2.0 - 1.0;
    const ty = -(item.y * 2.0 - 1.0); // flip Y

    const cos = Math.cos(item.rotation);
    const sin = Math.sin(item.rotation);

    // Column-major 3x3 matrix: Scale * Rotate * Translate
    return new Float32Array([
      sx * cos, sx * sin, 0,
      -sy * sin, sy * cos, 0,
      tx, ty, 1,
    ]);
  }

  render() {
    if (this.items.length === 0) return;

    const gl = this.gl;
    const shader = this.shader;
    if (!shader) return;

    // Enable alpha blending
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

    gl.useProgram(shader.program);
    gl.bindVertexArray(this.quadVao);

    for (const item of this.items) {
      if (!item.visible) continue;

      const transform = this.buildTransform(item);

      gl.uniformMatrix3fv(shader.u_transform, false, transform);
      gl.uniform1f(shader.u_opacity, 1.0);
      gl.uniform2f(shader.u_resolution, RENDER_WIDTH, RENDER_HEIGHT);

      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, item.texture);
      gl.uniform1i(shader.u_texture, 0);

      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

      // Draw selection border when in edit mode
      if (this.editMode && item.id === this.selectedId) {
        // Re-render with slight scale increase and low opacity for border effect
        const borderItem = { ...item, scale: item.scale * 1.06 };
        const borderTransform = this.buildTransform(borderItem);
        gl.uniformMatrix3fv(shader.u_transform, false, borderTransform);
        gl.uniform1f(shader.u_opacity, 0.3);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      }
    }

    gl.bindVertexArray(null);
    gl.disable(gl.BLEND);
  }
}
