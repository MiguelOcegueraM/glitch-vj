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
  float a = hash(i);
  float b = hash(i + vec2(1.0, 0.0));
  float c = hash(i + vec2(0.0, 1.0));
  float d = hash(i + vec2(1.0, 1.0));
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}

void main() {
  vec2 uv = gl_FragCoord.xy / u_resolution;
  vec2 p = (uv - 0.5) * 2.0;
  p.x *= u_resolution.x / u_resolution.y;

  float t = u_time;
  float beatDecay = exp(-u_beatTime * 5.0);

  // Kaleidoscope segments
  float segments = floor(6.0 + u_bass * 6.0);
  float angle = atan(p.y, p.x);
  float radius = length(p);

  // Fold angle into segments
  float segAngle = 6.28318 / segments;
  angle = mod(angle, segAngle);
  angle = abs(angle - segAngle * 0.5);

  // Reconstruct coordinates
  vec2 kp = vec2(cos(angle), sin(angle)) * radius;

  // Animate
  kp += t * 0.3;

  // Pattern: noise + bands
  float pattern = noise(kp * 5.0 + t * 0.5) * 0.5;
  pattern += sin(kp.x * 10.0 + t * 3.0) * 0.3;
  pattern += sin(kp.y * 8.0 - t * 2.0) * 0.2;

  // Color from pattern
  vec3 col;
  col.r = sin(pattern * 6.0 + t + 0.0) * 0.5 + 0.5;
  col.g = sin(pattern * 6.0 + t + 2.0) * 0.5 + 0.5;
  col.b = sin(pattern * 6.0 + t + 4.0) * 0.5 + 0.5;

  // Mid modulates color saturation
  col = mix(vec3(dot(col, vec3(0.299, 0.587, 0.114))), col, 1.0 + u_mid);

  // Bass intensifies
  col *= 1.0 + u_bass * 1.2;

  // Glitch overlay on beats
  if (beatDecay > 0.3) {
    float glitchBlock = hash(floor(uv * 20.0) + floor(t * 30.0));
    if (glitchBlock > 0.7) {
      col = vec3(1.0) - col;
    }
  }

  // High freq scanlines
  col *= 1.0 - u_high * 0.3 * sin(gl_FragCoord.y * 2.0) * 0.5;

  // Beat flash
  col += vec3(beatDecay * 0.3);

  // Radial fade
  col *= smoothstep(2.0, 0.5, radius);

  fragColor = vec4(col, 1.0);
}
