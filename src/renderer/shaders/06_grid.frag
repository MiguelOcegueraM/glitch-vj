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

void main() {
  vec2 uv = gl_FragCoord.xy / u_resolution;
  vec2 p = (uv - 0.5) * 2.0;
  p.x *= u_resolution.x / u_resolution.y;

  float t = u_time;
  float beatDecay = exp(-u_beatTime * 5.0);

  // Grid
  float gridSize = 10.0 + u_mid * 10.0;
  vec2 grid = p * gridSize;
  vec2 cellId = floor(grid);
  vec2 cellUv = fract(grid);

  // Per-cell distortion based on hash + bass
  float cellHash = hash(cellId);
  vec2 offset = vec2(
    sin(t * 2.0 + cellHash * 6.28) * u_bass * 0.5,
    cos(t * 1.5 + cellHash * 3.14) * u_bass * 0.3
  );
  cellUv += offset;

  // Grid lines
  vec2 lineWidth = vec2(0.04 + u_high * 0.03);
  float lineX = smoothstep(lineWidth.x, 0.0, cellUv.x) + smoothstep(1.0 - lineWidth.x, 1.0, cellUv.x);
  float lineY = smoothstep(lineWidth.y, 0.0, cellUv.y) + smoothstep(1.0 - lineWidth.y, 1.0, cellUv.y);
  float line = max(lineX, lineY);

  // Base cell color
  vec3 cellColor = vec3(
    sin(cellHash * 6.28 + t) * 0.5 + 0.5,
    sin(cellHash * 4.0 + t * 0.7) * 0.5 + 0.5,
    sin(cellHash * 8.0 + t * 1.3) * 0.5 + 0.5
  );

  // Invert random cells on beat
  if (beatDecay > 0.2 && cellHash > 0.6) {
    cellColor = vec3(1.0) - cellColor;
  }

  // Color
  vec3 lineColor = vec3(0.0, 1.0, 0.5) * (1.0 + u_bass);
  vec3 col = mix(cellColor * 0.3, lineColor, line);

  // Bass pulse
  col *= 1.0 + u_bass * 0.8;

  // Beat flash
  col += vec3(beatDecay * 0.25);

  // Vignette
  vec2 vc = uv - 0.5;
  col *= 1.0 - dot(vc, vc) * 0.8;

  fragColor = vec4(col, 1.0);
}
