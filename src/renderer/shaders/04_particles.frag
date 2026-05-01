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

out vec4 fragColor;

float hash(float n) {
  return fract(sin(n) * 43758.5453);
}

vec2 hash2(float n) {
  return vec2(hash(n), hash(n + 57.0));
}

void main() {
  vec2 uv = gl_FragCoord.xy / u_resolution;
  vec2 p = (uv - 0.5) * 2.0;
  p.x *= u_resolution.x / u_resolution.y;

  float t = u_time;
  float beatDecay = exp(-u_beatTime * 5.0);
  float speed = 0.5 + u_volume * 2.0;

  vec3 col = vec3(0.0);

  // 80 particles (optimized from 200 — still dense, much cheaper)
  for (int i = 0; i < 80; i++) {
    float fi = float(i);
    vec2 pos = hash2(fi * 13.37);

    // Animate position
    pos = pos * 2.0 - 1.0;
    pos.x += sin(t * speed * hash(fi * 7.0) + fi) * 0.5;
    pos.y += cos(t * speed * hash(fi * 11.0) + fi * 0.7) * 0.5;

    // Wrap around
    pos = fract(pos * 0.5 + 0.5) * 2.0 - 1.0;
    pos.x *= u_resolution.x / u_resolution.y;

    float d = length(p - pos);

    // Particle size scales with bass
    float size = 0.005 + u_bass * 0.015;
    float brightness = smoothstep(size, size * 0.1, d);

    // Color varies per particle, shifts with high
    float hue = hash(fi * 3.0) + u_high * 2.0 + t * 0.1;
    vec3 pCol;
    pCol.r = sin(hue * 6.28) * 0.5 + 0.5;
    pCol.g = sin(hue * 6.28 + 2.09) * 0.5 + 0.5;
    pCol.b = sin(hue * 6.28 + 4.18) * 0.5 + 0.5;

    col += pCol * brightness * (1.0 + u_bass * 2.0);
  }

  // Beat explosion: radial burst
  float dist = length(p);
  col += vec3(1.0, 0.5, 0.2) * beatDecay * smoothstep(0.5, 0.0, abs(dist - beatDecay * 2.0)) * 0.5;

  // Glow
  col = 1.0 - exp(-col * 1.5);

  fragColor = vec4(col, 1.0);
}
