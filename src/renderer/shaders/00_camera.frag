#version 300 es
precision mediump float;

uniform vec2 u_resolution;
uniform float u_time;
uniform float u_bass;
uniform float u_mid;
uniform float u_high;
uniform float u_volume;
uniform float u_beat;
uniform float u_beatTime;
uniform sampler2D u_webcam;
uniform sampler2D u_feedback;

out vec4 fragColor;

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

float hash1(float p) {
  return fract(sin(p * 127.1) * 43758.5453);
}

void main() {
  vec2 uv = gl_FragCoord.xy / u_resolution;
  uv.y = 1.0 - uv.y;
  float t = u_time;
  float beatDecay = exp(-u_beatTime * 4.0);

  // === GLITCH UV DISTORTION ===
  vec2 glitchUV = uv;

  // Block displacement on bass
  float blockH = 0.03 + u_bass * 0.12;
  float blockRow = floor(uv.y / blockH);
  float rowHash = hash1(blockRow + floor(t * 8.0));
  if (rowHash > 0.7) {
    glitchUV.x += (rowHash - 0.7) * 3.0 * u_bass * sin(t * 20.0);
  }

  // Vertical tear on beats
  if (beatDecay > 0.3) {
    float tearX = hash1(floor(t * 30.0)) * 0.8 + 0.1;
    float tearWidth = 0.05 + beatDecay * 0.1;
    if (abs(uv.x - tearX) < tearWidth) {
      glitchUV.y += (hash1(floor(uv.y * 40.0) + t) - 0.5) * beatDecay * 0.3;
    }
  }

  // === RGB SPLIT ===
  float rgbShift = u_bass * 0.02 + beatDecay * 0.04 + u_high * 0.008;
  float angle = t * 0.5;
  vec2 rgbDir = vec2(cos(angle), sin(angle)) * rgbShift;

  float r = texture(u_webcam, glitchUV + rgbDir).r;
  float g = texture(u_webcam, glitchUV).g;
  float b = texture(u_webcam, glitchUV - rgbDir).b;
  vec3 cam = vec3(r, g, b);

  // === GHOST TRAILS (feedback) ===
  // Sample previous frame with slight drift
  vec2 fbUV = uv;
  // Ghosts drift slowly — direction shifts with mid
  fbUV += vec2(sin(t * 0.3) * 0.003, -0.002) * (1.0 + u_mid);
  // Slight zoom into feedback for echo-zoom effect
  fbUV = mix(fbUV, vec2(0.5), 0.003 + u_bass * 0.005);

  vec3 feedback = texture(u_feedback, fbUV).rgb;

  // Ghost blend: high feedback = longer trails
  // More volume = more ghosting
  float ghostMix = 0.65 + u_volume * 0.2;
  // On beat, briefly reduce ghosting for a "flash clear"
  ghostMix *= mix(1.0, 0.3, beatDecay * step(0.5, beatDecay));

  vec3 col = mix(cam, feedback, ghostMix);

  // === EDGE DETECTION for ghost outlines ===
  float px = 2.0 / u_resolution.x;
  float py = 2.0 / u_resolution.y;
  vec3 camL = texture(u_webcam, glitchUV + vec2(-px, 0.0)).rgb;
  vec3 camR = texture(u_webcam, glitchUV + vec2(px, 0.0)).rgb;
  vec3 camU = texture(u_webcam, glitchUV + vec2(0.0, py)).rgb;
  vec3 camD = texture(u_webcam, glitchUV + vec2(0.0, -py)).rgb;
  float edge = length(camR - camL) + length(camU - camD);
  edge = smoothstep(0.1, 0.6, edge);

  // Ghost edges glow — neon outlines of dancing people
  vec3 edgeColor = vec3(0.0, edge * 1.5, edge * 0.8) * (1.0 + u_mid * 2.0);
  // Shift edge color hue over time
  edgeColor = vec3(
    edge * (sin(t * 0.7) * 0.5 + 0.5),
    edge * (sin(t * 0.7 + 2.09) * 0.5 + 0.5),
    edge * (sin(t * 0.7 + 4.18) * 0.5 + 0.5)
  ) * (1.0 + u_bass);
  col += edgeColor * 0.6;

  // === DATAMOSH BLOCKS on beat ===
  if (beatDecay > 0.2) {
    float bSize = 0.05 + hash1(floor(t * 5.0)) * 0.1;
    vec2 bId = floor(uv / bSize);
    float bHash = hash(bId + floor(t * 10.0));
    if (bHash > 0.75) {
      // Replace with shifted feedback — frozen ghost block
      vec2 moshUV = uv + vec2(
        (hash(bId + 100.0) - 0.5) * 0.2,
        (hash(bId + 200.0) - 0.5) * 0.1
      );
      col = mix(col, texture(u_feedback, moshUV).rgb, beatDecay * 0.7);
    }
  }

  // === SCANLINES ===
  float scan = sin(gl_FragCoord.y * 2.0 + t * 5.0) * 0.5 + 0.5;
  col *= mix(1.0, scan, u_high * 0.3 + 0.1);

  // === BEAT INVERT flash ===
  if (u_beat > 0.5) {
    // Negative flash
    float invertMask = step(0.5, hash(floor(uv * 8.0) + t));
    col = mix(col, vec3(1.0) - col, invertMask * 0.6);
  }

  // === NOISE ===
  float noise = hash(gl_FragCoord.xy + t * 777.0);
  col += noise * 0.04;

  // === VIGNETTE ===
  vec2 vc = uv - 0.5;
  col *= 1.0 - dot(vc, vc) * 1.0;

  // Darken base — dark room friendly
  col *= 0.85;

  fragColor = vec4(col, 1.0);
}
