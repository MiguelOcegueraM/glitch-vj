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

void main() {
  vec2 uv = gl_FragCoord.xy / u_resolution;
  float t = u_time;
  float beatDecay = exp(-u_beatTime * 3.0);

  // Dark rotating background
  vec2 p = (uv - 0.5) * 2.0;
  float angle = atan(p.y, p.x);
  float dist = length(p);

  // Subtle background pattern
  float bg = sin(angle * 3.0 + t * 0.5) * sin(dist * 5.0 - t) * 0.1;
  vec3 bgColor = vec3(
    0.05 + bg * sin(t * 0.2),
    0.02 + bg * sin(t * 0.3 + 1.0),
    0.08 + bg * sin(t * 0.4 + 2.0)
  );

  // STROBE: white flash on beat with fast decay
  float strobe = beatDecay * beatDecay; // quadratic for sharp falloff
  vec3 strobeColor = vec3(strobe);

  // Mix
  vec3 col = bgColor + strobeColor;

  // Volume-based ambient glow
  col += vec3(0.02, 0.01, 0.03) * u_volume;

  // Minimal bass pulse in background
  col += vec3(0.05, 0.0, 0.0) * u_bass * 0.3;

  fragColor = vec4(col, 1.0);
}
