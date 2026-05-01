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
  vec2 p = (uv - 0.5) * 2.0;
  p.x *= u_resolution.x / u_resolution.y;

  float t = u_time;
  float beatDecay = exp(-u_beatTime * 5.0);

  // Frequency modulated by mid
  float freq = 3.0 + u_mid * 8.0;

  // Plasma function
  float v1 = sin(p.x * freq + t * 2.0);
  float v2 = sin(p.y * freq + t * 1.5);
  float v3 = sin((p.x + p.y) * freq * 0.7 + t * 3.0);
  float v4 = sin(length(p) * freq * 1.5 - t * 2.5);

  float v = (v1 + v2 + v3 + v4) * 0.25;

  // Distortion on beat
  float dist = length(p);
  v += sin(dist * 10.0 - t * 5.0) * beatDecay * 0.5;

  // Rotating palette
  float hue = v * 0.5 + 0.5 + t * 0.1;
  vec3 col;
  col.r = sin(hue * 6.28 + 0.0) * 0.5 + 0.5;
  col.g = sin(hue * 6.28 + 2.09) * 0.5 + 0.5;
  col.b = sin(hue * 6.28 + 4.18) * 0.5 + 0.5;

  // Intensify with bass
  col = pow(col, vec3(1.0 - u_bass * 0.5));
  col *= 1.0 + u_bass * 0.8;

  // High freq noise overlay
  float noise = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233)) + t * 100.0) * 43758.5453);
  col += noise * u_high * 0.1;

  // Beat flash
  col += vec3(beatDecay * 0.4);

  // Radial pulse on beat
  float ring = abs(dist - beatDecay * 3.0);
  ring = smoothstep(0.1, 0.0, ring);
  col += vec3(ring * beatDecay * 0.5, ring * beatDecay * 0.3, ring * beatDecay * 0.8);

  fragColor = vec4(col, 1.0);
}
