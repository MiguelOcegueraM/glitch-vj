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

float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1,0)), f.x),
             mix(hash(i + vec2(0,1)), hash(i + vec2(1,1)), f.x), f.y);
}

float fbm(vec2 p) {
  float v = 0.0, a = 0.5;
  mat2 rot = mat2(0.8, 0.6, -0.6, 0.8);
  for (int i = 0; i < 5; i++) { v += a * noise(p); p = rot * p * 2.0; a *= 0.5; }
  return v;
}

void main() {
  vec2 uv = gl_FragCoord.xy / u_resolution;
  vec2 p = (uv - 0.5) * 2.0;
  p.x *= u_resolution.x / u_resolution.y;

  float t = u_time;
  float beatDecay = exp(-u_beatTime * 5.0);

  // Melt distortion — everything drips downward
  float meltSpeed = 0.4 + u_bass * 1.2;
  float drip = fbm(vec2(p.x * 3.0, p.y * 1.5 - t * meltSpeed));
  float drip2 = fbm(vec2(p.x * 5.0 + 10.0, p.y * 2.0 - t * meltSpeed * 0.7));

  // Warp UVs — melting displacement
  vec2 melted = p;
  melted.y += drip * 0.6 * (1.0 + u_bass);
  melted.x += drip2 * 0.3 * u_mid;

  // On beat, everything stretches violently
  melted.y += beatDecay * sin(p.x * 8.0) * 0.4;
  melted.x += beatDecay * cos(p.y * 6.0) * 0.2;

  // Layered organic forms
  float f1 = fbm(melted * 2.0 + t * 0.2);
  float f2 = fbm(melted * 3.0 - t * 0.15 + f1 * 2.0);
  float f3 = fbm(melted * 1.5 + f2 * 3.0 + vec2(t * 0.1));

  // Psychedelic color cycling
  float hue = f3 * 0.8 + t * 0.05;
  vec3 col;
  col.r = sin(hue * 6.28) * 0.5 + 0.5;
  col.g = sin(hue * 6.28 + 2.09) * 0.5 + 0.5;
  col.b = sin(hue * 6.28 + 4.18) * 0.5 + 0.5;

  // Dripping streaks — vertical bright lines that ooze
  float streak = sin(p.x * 15.0 + drip * 10.0) * 0.5 + 0.5;
  streak = pow(streak, 8.0);
  col += streak * vec3(0.4, 0.1, 0.6) * u_bass;

  // Heat haze shimmer
  float haze = sin(melted.x * 30.0 + t * 12.0) * sin(melted.y * 30.0 - t * 8.0);
  col += haze * u_high * 0.1;

  // Bass pumps saturation
  col = pow(col, vec3(0.8 - u_bass * 0.3));
  col *= 0.7 + u_bass * 0.6;

  // Beat flash
  col += vec3(beatDecay * 0.3);

  // Vignette
  vec2 vc = uv - 0.5;
  col *= 1.0 - dot(vc, vc) * 1.3;

  fragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
