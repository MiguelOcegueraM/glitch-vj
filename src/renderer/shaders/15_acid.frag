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

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

vec3 hsv2rgb(float h, float s, float v) {
  vec3 c = clamp(abs(mod(h * 6.0 + vec3(0,4,2), 6.0) - 3.0) - 1.0, 0.0, 1.0);
  return v * mix(vec3(1.0), c, s);
}

void main() {
  vec2 uv = gl_FragCoord.xy / u_resolution;
  vec2 p = (uv - 0.5) * 2.0;
  p.x *= u_resolution.x / u_resolution.y;

  float t = u_time;
  float beatDecay = exp(-u_beatTime * 5.0);

  // Breathing — the whole world pulses in and out
  float breathe = 1.0 + sin(t * 0.8 + u_bass * 3.14) * 0.15 * (1.0 + u_bass);
  p *= breathe;

  // Acid wave distortion — layered sine warps
  vec2 warp = p;
  warp.x += sin(p.y * 3.0 + t * 1.5) * 0.3 * u_bass;
  warp.y += cos(p.x * 2.5 + t * 1.2) * 0.3 * u_mid;
  warp.x += sin(warp.y * 5.0 + t * 0.8) * 0.15;
  warp.y += cos(warp.x * 4.0 - t * 1.0) * 0.15;

  // Beat smash — violent warp
  warp += beatDecay * vec2(sin(p.y * 10.0), cos(p.x * 10.0)) * 0.5;

  // Concentric acid rings
  float dist = length(warp);
  float rings = sin(dist * 12.0 - t * 3.0) * 0.5 + 0.5;
  rings = pow(rings, 0.5); // soft rings

  // Mandala geometry — angular patterns
  float angle = atan(warp.y, warp.x);
  float mandala = sin(angle * 6.0 + dist * 8.0 - t * 2.0) * 0.5 + 0.5;
  float mandala2 = sin(angle * 8.0 - dist * 5.0 + t * 1.5) * 0.5 + 0.5;

  // Layer combination
  float pattern = rings * 0.5 + mandala * 0.3 + mandala2 * 0.2;

  // WILD color — full rainbow cycling
  float hue1 = pattern * 1.5 + t * 0.1 + dist * 0.2;
  float hue2 = pattern * 1.2 - t * 0.08 + angle * 0.3;

  vec3 col1 = hsv2rgb(hue1, 0.9, 0.9);
  vec3 col2 = hsv2rgb(hue2, 0.8, 0.8);
  vec3 col = mix(col1, col2, mandala);

  // Pulsing glow from center
  float glow = exp(-dist * 1.5) * (0.5 + u_bass * 0.8);
  col += hsv2rgb(t * 0.15, 0.7, 1.0) * glow;

  // Edge detection — create outlines of the pattern
  float edge = abs(dFdx(pattern)) + abs(dFdy(pattern));
  edge = smoothstep(0.0, 0.1, edge);
  col = mix(col, vec3(1.0), edge * 0.4 * u_high);

  // Chromatic split on beat
  if (beatDecay > 0.2) {
    float shift = beatDecay * 0.03;
    vec2 uvR = uv + vec2(shift, 0.0);
    vec2 uvB = uv - vec2(shift, 0.0);
    // Approximate — just shift the colors
    col.r *= 1.0 + beatDecay * 0.3;
    col.b *= 1.0 - beatDecay * 0.2;
  }

  // Beat brightens everything
  col += vec3(beatDecay * 0.25);

  // Saturation boost with bass
  col = pow(col, vec3(0.7 - u_bass * 0.2));

  // Subtle scanlines
  col *= 0.95 + 0.05 * sin(gl_FragCoord.y * 2.5);

  // Vignette — breathing
  vec2 vc = (uv - 0.5) * breathe;
  col *= 1.0 - dot(vc, vc) * 0.8;

  fragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
