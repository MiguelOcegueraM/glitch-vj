#version 300 es
precision highp float;

uniform vec2 u_resolution;
uniform float u_time;
uniform float u_bass;
uniform float u_mid;
uniform float u_high;
uniform float u_volume;
uniform float u_beat;
uniform float u_beatTime;

out vec4 fragColor;

// ── Noise functions ──
float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float a = hash(i);
  float b = hash(i + vec2(1.0, 0.0));
  float c = hash(i + vec2(0.0, 1.0));
  float d = hash(i + vec2(1.0, 1.0));
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}

float fbm(vec2 p) {
  float v = 0.0;
  float a = 0.5;
  mat2 rot = mat2(0.8, 0.6, -0.6, 0.8);
  for (int i = 0; i < 5; i++) {
    v += a * noise(p);
    p = rot * p * 2.0;
    a *= 0.5;
  }
  return v;
}

// ── HSV to RGB ──
vec3 hsv2rgb(float h, float s, float v) {
  vec3 c = clamp(abs(mod(h * 6.0 + vec3(0.0, 4.0, 2.0), 6.0) - 3.0) - 1.0, 0.0, 1.0);
  return v * mix(vec3(1.0), c, s);
}

void main() {
  vec2 uv = gl_FragCoord.xy / u_resolution;
  vec2 p = (uv - 0.5) * 2.0;
  p.x *= u_resolution.x / u_resolution.y;

  float t = u_time;
  float beatDecay = exp(-u_beatTime * 5.0);

  // ── Auto-pilot scene morphing ──
  // Slowly cycle through different visual modes using time
  float scene = t * 0.08; // slow scene rotation
  float scenePhase = fract(scene);
  float sceneId = floor(mod(scene, 4.0));

  // ── Lava flow base ──
  vec2 lavaUV = p * 1.5;
  lavaUV.y += t * 0.3;
  lavaUV.x += sin(t * 0.2) * 0.5;

  // Domain warping for organic lava movement
  float warp1 = fbm(lavaUV + t * 0.15);
  float warp2 = fbm(lavaUV + warp1 * 2.0 + vec2(t * 0.1, -t * 0.08));
  float lava = fbm(lavaUV + warp2 * 2.5 + vec2(-t * 0.05, t * 0.12));

  // ── Color palette — morphs over time ──
  float hueBase = t * 0.02 + lava * 0.3;
  float hueShift = sin(t * 0.07) * 0.15;

  // Lava colors: hot oranges/reds shifting to cool blues/purples
  vec3 hot = hsv2rgb(mod(0.0 + hueShift, 1.0), 0.9, 1.0);   // red/orange
  vec3 warm = hsv2rgb(mod(0.08 + hueShift, 1.0), 0.85, 0.9); // orange/yellow
  vec3 cool = hsv2rgb(mod(0.6 + hueShift, 1.0), 0.8, 0.7);   // blue/purple
  vec3 lavaColor = mix(cool, mix(warm, hot, smoothstep(0.3, 0.7, lava)), lava);

  // Bass pumps the brightness and saturation
  lavaColor *= 0.6 + u_bass * 0.8;

  // ── Glitch layer — intensity cycles automatically ──
  float glitchIntensity = smoothstep(0.7, 1.0, sin(t * 0.5) * 0.5 + 0.5);
  glitchIntensity = max(glitchIntensity, u_bass * 0.5); // bass also triggers glitch

  // Block displacement
  float blockSize = mix(0.05, 0.2, glitchIntensity);
  vec2 block = floor(uv / blockSize);
  float blockHash = hash(block + floor(t * 3.0));

  vec3 col = lavaColor;

  if (blockHash > (1.0 - glitchIntensity * 0.6)) {
    // Displace this block
    vec2 offset = vec2(
      (hash(block + 10.0) - 0.5) * glitchIntensity * 0.3,
      (hash(block + 20.0) - 0.5) * glitchIntensity * 0.15
    );
    vec2 glitchUV = uv + offset;

    // Recompute lava at displaced position
    vec2 gp = (glitchUV - 0.5) * 2.0;
    gp.x *= u_resolution.x / u_resolution.y;
    vec2 gLava = gp * 1.5;
    gLava.y += t * 0.3;
    float gVal = fbm(gLava + warp2 * 2.5 + vec2(-t * 0.05, t * 0.12));
    col = mix(cool, mix(warm, hot, smoothstep(0.3, 0.7, gVal)), gVal);
    col *= 0.6 + u_bass * 0.8;

    // RGB split on glitched blocks
    float shift = glitchIntensity * 0.02;
    col.r = mix(col.r, hash(block + vec2(t, 0.0)), glitchIntensity * 0.3);
    col.b = mix(col.b, hash(block + vec2(0.0, t)), glitchIntensity * 0.3);
  }

  // ── Horizontal scan glitch lines ──
  float lineHash = hash(vec2(floor(uv.y * 80.0), floor(t * 15.0)));
  if (lineHash > 0.97 - glitchIntensity * 0.05) {
    col = vec3(1.0) - col; // invert
    col *= 1.5;
  }

  // ── Auto strobe on heavy bass ──
  // Triggers when bass exceeds threshold — bright white flash
  float bassStrobe = smoothstep(0.75, 0.95, u_bass) * beatDecay;
  col = mix(col, vec3(1.0), bassStrobe * 0.9);

  // Beat also adds a punch
  if (u_beat > 0.5) {
    col += vec3(0.3) * beatDecay;
  }

  // ── Radial energy pulse on beat ──
  float dist = length(p);
  float ring = abs(dist - beatDecay * 2.5);
  ring = smoothstep(0.15, 0.0, ring);
  vec3 ringColor = hsv2rgb(mod(t * 0.1, 1.0), 0.8, 1.0);
  col += ringColor * ring * beatDecay * 0.6;

  // ── Mid-frequency shimmer ──
  float shimmer = sin(p.x * 20.0 + t * 8.0) * sin(p.y * 20.0 - t * 6.0);
  col += vec3(shimmer * u_mid * 0.08);

  // ── Scanlines ──
  float scanline = sin(gl_FragCoord.y * 2.5 + t * 5.0) * 0.5 + 0.5;
  col *= mix(1.0, scanline, 0.15);

  // ── Vignette ──
  vec2 vc = uv - 0.5;
  col *= 1.0 - dot(vc, vc) * 1.0;

  // ── Static noise (subtle) ──
  float staticNoise = hash(gl_FragCoord.xy + t * 1000.0);
  col += staticNoise * 0.03;

  fragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
