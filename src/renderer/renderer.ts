import type { AudioData } from "./audio";

interface ShaderProgram {
  program: WebGLProgram;
  uniforms: Record<string, WebGLUniformLocation | null>;
}

interface FeedbackPass {
  fbos: [WebGLFramebuffer, WebGLFramebuffer];
  textures: [WebGLTexture, WebGLTexture];
  current: 0 | 1;
  width: number;
  height: number;
}

// Render target for crossfade: renders a shader into its own FBO
interface RenderTarget {
  fbo: WebGLFramebuffer;
  texture: WebGLTexture;
  width: number;
  height: number;
}

// 720p saves 56% pixels vs 1080p — Resolume upscales with no visible loss on LED panels
const RENDER_WIDTH = 1280;
const RENDER_HEIGHT = 720;

export class GLRenderer {
  private gl: WebGL2RenderingContext;
  private canvas: HTMLCanvasElement;
  private programs: Map<string, ShaderProgram> = new Map();
  private currentProgram: ShaderProgram | null = null;
  private currentProgramId: string = "";
  private vao: WebGLVertexArrayObject | null = null;
  private startTime: number;
  private lastFrameTime: number;
  private frameCount = 0;
  private fpsAccum = 0;
  fps = 60;

  // Speed control
  private timeSpeed = 1.0;
  private virtualTime = 0;

  // Webcam
  private videoEl: HTMLVideoElement | null = null;
  private videoTexture: WebGLTexture | null = null;
  private videoStream: MediaStream | null = null;
  private webcamActive = false;

  // Feedback (ping-pong for ghost trails)
  private feedback: FeedbackPass | null = null;

  // Manual strobe
  private strobeAlpha = 0;
  private strobeShader: ShaderProgram | null = null;

  // Color grade (master dimmer + RGB tint)
  private colorGradeShader: ShaderProgram | null = null;
  private brightness = 1.0;
  private rgbTint: [number, number, number] = [1.0, 1.0, 1.0];

  // Crossfade
  private crossfadeDuration = 0.5; // seconds
  private crossfadeProgress = 1.0; // 1.0 = fully on current, no fade active
  private crossfadeStartTime = 0;
  private prevProgram: ShaderProgram | null = null;
  private prevProgramId: string = "";
  private renderTargetA: RenderTarget | null = null; // current shader
  private renderTargetB: RenderTarget | null = null; // previous shader (fading out)
  private crossfadeShader: ShaderProgram | null = null;
  private prevFeedback: FeedbackPass | null = null;

  private vertexSrc = `#version 300 es
in vec2 a_position;
void main() {
  gl_Position = vec4(a_position, 0.0, 1.0);
}`;

  // Solid color strobe shader
  private strobeFrag = `#version 300 es
precision mediump float;
uniform float u_alpha;
out vec4 fragColor;
void main() {
  fragColor = vec4(1.0, 1.0, 1.0, u_alpha);
}`;

  // Color grade shader — multiplied over the framebuffer
  private colorGradeFrag = `#version 300 es
precision mediump float;
uniform vec3 u_grade;
out vec4 fragColor;
void main() {
  fragColor = vec4(u_grade, 1.0);
}`;

  // Simple crossfade fragment shader
  private crossfadeFrag = `#version 300 es
precision mediump float;
uniform sampler2D u_texA;
uniform sampler2D u_texB;
uniform float u_mix;
uniform vec2 u_resolution;
out vec4 fragColor;
void main() {
  vec2 uv = gl_FragCoord.xy / u_resolution;
  vec4 a = texture(u_texA, uv);
  vec4 b = texture(u_texB, uv);
  fragColor = mix(b, a, u_mix);
}`;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const gl = canvas.getContext("webgl2", {
      antialias: false,
      alpha: false,
      preserveDrawingBuffer: false,
      powerPreference: "high-performance",
    });
    if (!gl) throw new Error("WebGL2 not supported");
    this.gl = gl;
    this.startTime = performance.now() / 1000;
    this.lastFrameTime = this.startTime;
    this.setupQuad();
    this.resize();
    this.compileCrossfadeShader();
    this.compileStrobeShader();
    this.compileColorGradeShader();
  }

  private setupQuad() {
    const gl = this.gl;
    const verts = new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]);
    const vbo = gl.createBuffer()!;
    this.vao = gl.createVertexArray()!;
    gl.bindVertexArray(this.vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
    gl.bufferData(gl.ARRAY_BUFFER, verts, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.bindVertexArray(null);
  }

  private createFeedbackPass(w: number, h: number): FeedbackPass {
    const gl = this.gl;
    const fbos: [WebGLFramebuffer, WebGLFramebuffer] = [
      gl.createFramebuffer()!,
      gl.createFramebuffer()!,
    ];
    const textures: [WebGLTexture, WebGLTexture] = [
      gl.createTexture()!,
      gl.createTexture()!,
    ];

    for (let i = 0; i < 2; i++) {
      gl.bindTexture(gl.TEXTURE_2D, textures[i]);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.bindFramebuffer(gl.FRAMEBUFFER, fbos[i]);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, textures[i], 0);
    }

    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.bindTexture(gl.TEXTURE_2D, null);

    return { fbos, textures, current: 0, width: w, height: h };
  }

  private createRenderTarget(w: number, h: number): RenderTarget {
    const gl = this.gl;
    const fbo = gl.createFramebuffer()!;
    const texture = gl.createTexture()!;

    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.bindTexture(gl.TEXTURE_2D, null);

    return { fbo, texture, width: w, height: h };
  }

  private destroyRenderTarget(rt: RenderTarget) {
    const gl = this.gl;
    gl.deleteFramebuffer(rt.fbo);
    gl.deleteTexture(rt.texture);
  }

  resize() {
    // Canvas element stretches to fill window via CSS, but we render at fixed resolution
    this.canvas.width = RENDER_WIDTH;
    this.canvas.height = RENDER_HEIGHT;
    this.gl.viewport(0, 0, RENDER_WIDTH, RENDER_HEIGHT);

    // Recreate feedback buffers at render resolution
    if (this.feedback) {
      this.destroyFeedback(this.feedback);
    }
    this.feedback = this.createFeedbackPass(RENDER_WIDTH, RENDER_HEIGHT);

    if (this.prevFeedback) {
      this.destroyFeedback(this.prevFeedback);
    }
    this.prevFeedback = this.createFeedbackPass(RENDER_WIDTH, RENDER_HEIGHT);

    // Recreate crossfade render targets
    if (this.renderTargetA) this.destroyRenderTarget(this.renderTargetA);
    if (this.renderTargetB) this.destroyRenderTarget(this.renderTargetB);
    this.renderTargetA = this.createRenderTarget(RENDER_WIDTH, RENDER_HEIGHT);
    this.renderTargetB = this.createRenderTarget(RENDER_WIDTH, RENDER_HEIGHT);
  }

  private destroyFeedback(fb: FeedbackPass) {
    const gl = this.gl;
    for (let i = 0; i < 2; i++) {
      gl.deleteFramebuffer(fb.fbos[i]);
      gl.deleteTexture(fb.textures[i]);
    }
  }

  private currentVideoDeviceId: string | undefined;

  async startWebcam(deviceId?: string) {
    // If already active with the same device, skip
    if (this.webcamActive && deviceId === this.currentVideoDeviceId) return;

    // If switching device, stop first
    if (this.webcamActive) this.stopWebcam();

    const gl = this.gl;

    this.videoEl = document.createElement("video");
    this.videoEl.playsInline = true;
    this.videoEl.muted = true;

    const videoConstraints: MediaTrackConstraints = {
      width: 1280,
      height: 720,
    };
    if (deviceId) {
      videoConstraints.deviceId = { exact: deviceId };
    }

    this.videoStream = await navigator.mediaDevices.getUserMedia({
      video: videoConstraints,
    });
    this.videoEl.srcObject = this.videoStream;
    await this.videoEl.play();

    this.videoTexture = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, this.videoTexture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.bindTexture(gl.TEXTURE_2D, null);

    this.currentVideoDeviceId = deviceId;
    this.webcamActive = true;
  }

  stopWebcam() {
    if (!this.webcamActive) return;
    if (this.videoStream) {
      this.videoStream.getTracks().forEach((t) => t.stop());
      this.videoStream = null;
    }
    if (this.videoEl) {
      this.videoEl.pause();
      this.videoEl.srcObject = null;
      this.videoEl = null;
    }
    if (this.videoTexture) {
      this.gl.deleteTexture(this.videoTexture);
      this.videoTexture = null;
    }
    this.webcamActive = false;
  }

  get needsWebcam(): boolean {
    const currentNeeds = this.currentProgramId.startsWith("00_camera");
    const prevNeeds = this.isCrossfading && this.prevProgramId.startsWith("00_camera");
    return currentNeeds || prevNeeds;
  }

  get isCrossfading(): boolean {
    return this.crossfadeProgress < 1.0;
  }

  get speed(): number {
    return this.timeSpeed;
  }

  get time(): number {
    return this.virtualTime;
  }

  setSpeed(speed: number) {
    this.timeSpeed = Math.max(0.1, Math.min(4.0, speed));
  }

  triggerStrobe() {
    this.strobeAlpha = 1.0;
  }

  setBrightness(v: number) {
    this.brightness = Math.max(0, Math.min(1.5, v));
  }

  getBrightness(): number {
    return this.brightness;
  }

  setRGB(r: number, g: number, b: number) {
    this.rgbTint = [
      Math.max(0, Math.min(1.5, r)),
      Math.max(0, Math.min(1.5, g)),
      Math.max(0, Math.min(1.5, b)),
    ];
  }

  getRGB(): [number, number, number] {
    return [...this.rgbTint];
  }

  private compileStrobeShader() {
    const gl = this.gl;

    const vs = gl.createShader(gl.VERTEX_SHADER)!;
    gl.shaderSource(vs, this.vertexSrc);
    gl.compileShader(vs);

    const fs = gl.createShader(gl.FRAGMENT_SHADER)!;
    gl.shaderSource(fs, this.strobeFrag);
    gl.compileShader(fs);

    const program = gl.createProgram()!;
    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.bindAttribLocation(program, 0, "a_position");
    gl.linkProgram(program);

    gl.deleteShader(vs);
    gl.deleteShader(fs);

    const uniforms: Record<string, WebGLUniformLocation | null> = {};
    uniforms.u_alpha = gl.getUniformLocation(program, "u_alpha");
    this.strobeShader = { program, uniforms };
  }

  private compileColorGradeShader() {
    const gl = this.gl;

    const vs = gl.createShader(gl.VERTEX_SHADER)!;
    gl.shaderSource(vs, this.vertexSrc);
    gl.compileShader(vs);

    const fs = gl.createShader(gl.FRAGMENT_SHADER)!;
    gl.shaderSource(fs, this.colorGradeFrag);
    gl.compileShader(fs);

    const program = gl.createProgram()!;
    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.bindAttribLocation(program, 0, "a_position");
    gl.linkProgram(program);

    gl.deleteShader(vs);
    gl.deleteShader(fs);

    const uniforms: Record<string, WebGLUniformLocation | null> = {};
    uniforms.u_grade = gl.getUniformLocation(program, "u_grade");
    this.colorGradeShader = { program, uniforms };
  }

  private compileCrossfadeShader() {
    const gl = this.gl;

    const vs = gl.createShader(gl.VERTEX_SHADER)!;
    gl.shaderSource(vs, this.vertexSrc);
    gl.compileShader(vs);

    const fs = gl.createShader(gl.FRAGMENT_SHADER)!;
    gl.shaderSource(fs, this.crossfadeFrag);
    gl.compileShader(fs);

    const program = gl.createProgram()!;
    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.bindAttribLocation(program, 0, "a_position");
    gl.linkProgram(program);

    gl.deleteShader(vs);
    gl.deleteShader(fs);

    const uniforms: Record<string, WebGLUniformLocation | null> = {};
    for (const name of ["u_texA", "u_texB", "u_mix", "u_resolution"]) {
      uniforms[name] = gl.getUniformLocation(program, name);
    }

    this.crossfadeShader = { program, uniforms };
  }

  compileShader(id: string, fragmentSrc: string) {
    if (this.programs.has(id)) return;

    const gl = this.gl;

    const vs = gl.createShader(gl.VERTEX_SHADER)!;
    gl.shaderSource(vs, this.vertexSrc);
    gl.compileShader(vs);
    if (!gl.getShaderParameter(vs, gl.COMPILE_STATUS)) {
      console.error("Vertex shader error:", gl.getShaderInfoLog(vs));
      return;
    }

    const fs = gl.createShader(gl.FRAGMENT_SHADER)!;
    gl.shaderSource(fs, fragmentSrc);
    gl.compileShader(fs);
    if (!gl.getShaderParameter(fs, gl.COMPILE_STATUS)) {
      console.error(`Fragment shader error [${id}]:`, gl.getShaderInfoLog(fs));
      return;
    }

    const program = gl.createProgram()!;
    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.bindAttribLocation(program, 0, "a_position");
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      console.error("Link error:", gl.getProgramInfoLog(program));
      return;
    }

    gl.deleteShader(vs);
    gl.deleteShader(fs);

    const uniformNames = [
      "u_resolution",
      "u_time",
      "u_bass",
      "u_mid",
      "u_high",
      "u_volume",
      "u_beat",
      "u_beatTime",
      "u_webcam",
      "u_feedback",
    ];
    const uniforms: Record<string, WebGLUniformLocation | null> = {};
    for (const name of uniformNames) {
      uniforms[name] = gl.getUniformLocation(program, name);
    }

    this.programs.set(id, { program, uniforms });
  }

  useProgram(id: string) {
    const prog = this.programs.get(id);
    if (!prog) return;

    // If switching to a different program, start crossfade
    if (this.currentProgram && this.currentProgramId !== id) {
      this.prevProgram = this.currentProgram;
      this.prevProgramId = this.currentProgramId;
      this.crossfadeProgress = 0;
      this.crossfadeStartTime = performance.now() / 1000;

      // Swap feedback buffers so the previous shader keeps its own trail
      const tmp = this.feedback;
      this.feedback = this.prevFeedback;
      this.prevFeedback = tmp;
    }

    this.currentProgram = prog;
    this.currentProgramId = id;
  }

  private renderShader(
    prog: ShaderProgram,
    programId: string,
    audio: AudioData,
    targetFbo: WebGLFramebuffer | null,
    feedbackPass: FeedbackPass,
  ) {
    const gl = this.gl;
    const usesFeedback = programId.startsWith("00_camera");

    if (usesFeedback) {
      // Render into feedback FBO
      gl.bindFramebuffer(gl.FRAMEBUFFER, feedbackPass.fbos[feedbackPass.current]);
    } else {
      gl.bindFramebuffer(gl.FRAMEBUFFER, targetFbo);
    }

    gl.viewport(0, 0, RENDER_WIDTH, RENDER_HEIGHT);
    gl.clear(gl.COLOR_BUFFER_BIT);

    gl.useProgram(prog.program);

    const u = prog.uniforms;
    gl.uniform2f(u.u_resolution, RENDER_WIDTH, RENDER_HEIGHT);
    gl.uniform1f(u.u_time, this.virtualTime);
    gl.uniform1f(u.u_bass, audio.bass);
    gl.uniform1f(u.u_mid, audio.mid);
    gl.uniform1f(u.u_high, audio.high);
    gl.uniform1f(u.u_volume, audio.volume);
    gl.uniform1f(u.u_beat, audio.beat);
    gl.uniform1f(u.u_beatTime, audio.beatTime);

    // Bind webcam texture
    if (this.webcamActive && this.videoEl && this.videoTexture) {
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, this.videoTexture);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, this.videoEl);
      gl.uniform1i(u.u_webcam, 0);
    }

    // Bind feedback (previous frame) texture
    if (usesFeedback) {
      const prevIdx = feedbackPass.current === 0 ? 1 : 0;
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, feedbackPass.textures[prevIdx]);
      gl.uniform1i(u.u_feedback, 1);
    }

    gl.bindVertexArray(this.vao);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    gl.bindVertexArray(null);

    // If feedback: blit FBO to the target, then swap
    if (usesFeedback) {
      gl.bindFramebuffer(gl.READ_FRAMEBUFFER, feedbackPass.fbos[feedbackPass.current]);
      gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, targetFbo);
      gl.viewport(0, 0, RENDER_WIDTH, RENDER_HEIGHT);
      gl.blitFramebuffer(
        0, 0, feedbackPass.width, feedbackPass.height,
        0, 0, RENDER_WIDTH, RENDER_HEIGHT,
        gl.COLOR_BUFFER_BIT, gl.LINEAR
      );
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);

      // Swap ping-pong
      feedbackPass.current = feedbackPass.current === 0 ? 1 : 0;
    }
  }

  render(audio: AudioData) {
    const now = performance.now() / 1000;
    const dt = Math.min(now - this.lastFrameTime, 0.1); // cap at 100ms to prevent huge jumps after sleep/resume
    this.lastFrameTime = now;

    // Accumulate virtual time with speed multiplier, wrap at 10000s to prevent
    // float precision loss in shaders during long events (8+ hours).
    // 10000 is divisible by common shader periods (2, 4, 8, 16).
    this.virtualTime = (this.virtualTime + dt * this.timeSpeed) % 10000.0;

    // FPS calc
    this.frameCount++;
    this.fpsAccum += dt;
    if (this.fpsAccum >= 0.5) {
      this.fps = Math.round(this.frameCount / this.fpsAccum);
      this.frameCount = 0;
      this.fpsAccum = 0;
    }

    const gl = this.gl;
    const prog = this.currentProgram;
    if (!prog) return;

    // Update crossfade progress
    if (this.crossfadeProgress < 1.0) {
      this.crossfadeProgress = Math.min(
        1.0,
        (now - this.crossfadeStartTime) / this.crossfadeDuration
      );
    }

    const isFading = this.crossfadeProgress < 1.0 && this.prevProgram;

    if (isFading) {
      // Render both shaders into separate FBOs, then blend
      this.renderShader(prog, this.currentProgramId, audio, this.renderTargetA!.fbo, this.feedback!);
      this.renderShader(this.prevProgram!, this.prevProgramId, audio, this.renderTargetB!.fbo, this.prevFeedback!);

      // Composite with crossfade shader to screen
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.viewport(0, 0, RENDER_WIDTH, RENDER_HEIGHT);
      gl.clear(gl.COLOR_BUFFER_BIT);

      const cf = this.crossfadeShader!;
      gl.useProgram(cf.program);

      // Smooth easing
      const t = this.crossfadeProgress;
      const eased = t * t * (3 - 2 * t); // smoothstep

      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, this.renderTargetA!.texture);
      gl.uniform1i(cf.uniforms.u_texA, 0);

      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, this.renderTargetB!.texture);
      gl.uniform1i(cf.uniforms.u_texB, 1);

      gl.uniform1f(cf.uniforms.u_mix, eased);
      gl.uniform2f(cf.uniforms.u_resolution, RENDER_WIDTH, RENDER_HEIGHT);

      gl.bindVertexArray(this.vao);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      gl.bindVertexArray(null);
    } else {
      // No crossfade — render directly to screen
      this.prevProgram = null;
      this.prevProgramId = "";
      this.renderShader(prog, this.currentProgramId, audio, null, this.feedback!);
    }

    // Manual strobe flash (renders on top of everything)
    if (this.strobeAlpha > 0.01) {
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

      gl.useProgram(this.strobeShader!.program);
      gl.uniform1f(this.strobeShader!.uniforms.u_alpha, this.strobeAlpha);

      gl.bindVertexArray(this.vao);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      gl.bindVertexArray(null);

      gl.disable(gl.BLEND);

      // Fast decay
      this.strobeAlpha *= Math.exp(-dt * 12);
    }

    // Color grade pass (brightness + RGB tint) — multiplicative blend over framebuffer
    const gr = this.brightness * this.rgbTint[0];
    const gg = this.brightness * this.rgbTint[1];
    const gb = this.brightness * this.rgbTint[2];
    if (gr < 0.999 || gg < 0.999 || gb < 0.999) {
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.ZERO, gl.SRC_COLOR); // result = dst * src
      gl.useProgram(this.colorGradeShader!.program);
      gl.uniform3f(this.colorGradeShader!.uniforms.u_grade, gr, gg, gb);
      gl.bindVertexArray(this.vao);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      gl.bindVertexArray(null);
      gl.disable(gl.BLEND);
    }
  }
}
