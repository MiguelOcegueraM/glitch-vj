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

  // Infinite fractal zoom
  float zoom = exp(mod(t * 0.5 + u_bass * 0.3, 8.0));
  p *= zoom;

  // Rotate slowly + beat spin
  float angle = t * 0.3 + beatDecay * 1.5;
  float ca = cos(angle), sa = sin(angle);
  p = mat2(ca, -sa, sa, ca) * p;

  // Fractal iteration — folding space
  float intensity = 0.0;
  vec2 z = p;
  for (int i = 0; i < 12; i++) {
    z = abs(z) / max(dot(z, z), 1e-6) - vec2(0.8 + sin(t * 0.15) * 0.3, 0.6 + cos(t * 0.12) * 0.2);
    z = mat2(ca, -sa, sa, ca) * z; // rotate each iteration
    intensity += exp(-3.0 * length(z));
  }

  intensity /= 12.0;
  intensity = pow(intensity, 0.6);

  // Color mapping — cycling hue
  float hue = intensity * 2.0 + t * 0.08;
  float sat = 0.7 + u_mid * 0.3;
  float val = intensity * (0.8 + u_bass * 0.6);

  vec3 col = hsv2rgb(hue, sat, val);

  // Glitch: occasional inversion bands
  float glitchLine = fract(sin(floor(uv.y * 60.0) + floor(t * 8.0)) * 43758.5);
  if (glitchLine > 0.96) {
    col = vec3(1.0) - col;
  }

  // Beat pulse — radial bright ring
  float dist = length(p / zoom);
  float ring = abs(dist - beatDecay * 2.0);
  ring = smoothstep(0.2, 0.0, ring);
  col += hsv2rgb(t * 0.1, 0.9, 1.0) * ring * beatDecay * 0.7;

  // Scanline subtle
  col *= 0.95 + 0.05 * sin(gl_FragCoord.y * 3.0);

  // Bass brightens
  col += vec3(beatDecay * 0.2);

  // Vignette
  vec2 vc = uv - 0.5;
  col *= 1.0 - dot(vc, vc) * 1.1;

  fragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
