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

  // Webcam
  private videoEl: HTMLVideoElement | null = null;
  private videoTexture: WebGLTexture | null = null;
  private videoStream: MediaStream | null = null;
  private webcamActive = false;

  // Feedback (ping-pong for ghost trails)
  private feedback: FeedbackPass | null = null;

  private vertexSrc = `#version 300 es
in vec2 a_position;
void main() {
  gl_Position = vec4(a_position, 0.0, 1.0);
}`;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const gl = canvas.getContext("webgl2", {
      antialias: false,
      alpha: false,
      preserveDrawingBuffer: false,
    });
    if (!gl) throw new Error("WebGL2 not supported");
    this.gl = gl;
    this.startTime = performance.now() / 1000;
    this.lastFrameTime = this.startTime;
    this.setupQuad();
    this.resize();
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

  resize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.canvas.width = w;
    this.canvas.height = h;
    this.gl.viewport(0, 0, w, h);

    // Recreate feedback buffers at new size
    if (this.feedback) {
      this.destroyFeedback();
    }
    this.feedback = this.createFeedbackPass(w, h);
  }

  private destroyFeedback() {
    if (!this.feedback) return;
    const gl = this.gl;
    for (let i = 0; i < 2; i++) {
      gl.deleteFramebuffer(this.feedback.fbos[i]);
      gl.deleteTexture(this.feedback.textures[i]);
    }
    this.feedback = null;
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
    return this.currentProgramId.startsWith("00_camera");
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
    if (prog) {
      this.currentProgram = prog;
      this.currentProgramId = id;
      this.gl.useProgram(prog.program);
    }
  }

  render(audio: AudioData) {
    const now = performance.now() / 1000;
    const dt = now - this.lastFrameTime;
    this.lastFrameTime = now;

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

    const usesFeedback = this.currentProgramId.startsWith("00_camera");
    const fb = this.feedback!;

    // If camera preset: render to FBO, then blit to screen
    if (usesFeedback) {
      // Render into the "current" FBO
      gl.bindFramebuffer(gl.FRAMEBUFFER, fb.fbos[fb.current]);
      gl.viewport(0, 0, fb.width, fb.height);
    }

    gl.clear(gl.COLOR_BUFFER_BIT);

    const u = prog.uniforms;
    gl.uniform2f(u.u_resolution, this.canvas.width, this.canvas.height);
    gl.uniform1f(u.u_time, now - this.startTime);
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
      const prevIdx = fb.current === 0 ? 1 : 0;
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, fb.textures[prevIdx]);
      gl.uniform1i(u.u_feedback, 1);
    }

    gl.bindVertexArray(this.vao);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    gl.bindVertexArray(null);

    // If feedback: blit FBO to screen, then swap
    if (usesFeedback) {
      gl.bindFramebuffer(gl.READ_FRAMEBUFFER, fb.fbos[fb.current]);
      gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, null);
      gl.viewport(0, 0, this.canvas.width, this.canvas.height);
      gl.blitFramebuffer(
        0, 0, fb.width, fb.height,
        0, 0, this.canvas.width, this.canvas.height,
        gl.COLOR_BUFFER_BIT, gl.LINEAR
      );
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);

      // Swap ping-pong
      fb.current = fb.current === 0 ? 1 : 0;
    }
  }
}
