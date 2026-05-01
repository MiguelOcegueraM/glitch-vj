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

// Voronoi — creates shattered glass cells
vec2 voronoi(vec2 p, out float cellDist) {
  vec2 n = floor(p);
  vec2 f = fract(p);
  float minDist = 8.0;
  float secondMin = 8.0;
  vec2 closest = vec2(0.0);

  for (int j = -1; j <= 1; j++) {
    for (int i = -1; i <= 1; i++) {
      vec2 g = vec2(float(i), float(j));
      vec2 o = vec2(hash(n + g), hash(n + g + 99.0));
      // Animate cell centers
      o = 0.5 + 0.4 * sin(o * 6.28 + u_time * 0.5);
      vec2 diff = g + o - f;
      float d = dot(diff, diff);
      if (d < minDist) {
        secondMin = minDist;
        minDist = d;
        closest = n + g;
      } else if (d < secondMin) {
        secondMin = d;
      }
    }
  }
  cellDist = sqrt(secondMin) - sqrt(minDist); // edge distance
  return closest;
}

void main() {
  vec2 uv = gl_FragCoord.xy / u_resolution;
  vec2 p = (uv - 0.5) * 2.0;
  p.x *= u_resolution.x / u_resolution.y;

  float t = u_time;
  float beatDecay = exp(-u_beatTime * 5.0);

  // Scale of shatter — more bass = smaller pieces
  float scale = 4.0 + u_bass * 8.0 + beatDecay * 4.0;

  float cellEdge;
  vec2 cellId = voronoi(p * scale, cellEdge);

  // Each shard gets its own properties
  float cellHash = hash(cellId);
  float cellHash2 = hash(cellId + 42.0);
  float cellHash3 = hash(cellId + 99.0);

  // Shard displacement on beat — fly apart
  float shatter = beatDecay * 0.5;
  vec2 shardDir = vec2(cellHash - 0.5, cellHash2 - 0.5) * 2.0;
  vec2 shattered = p + shardDir * shatter * u_bass;

  // Each shard reflects a different part of an abstract scene
  vec2 reflectUV = shattered + vec2(cellHash, cellHash2) * 0.5;

  // Abstract colorful scene inside each shard
  float hue = cellHash * 0.5 + t * 0.1 + sin(reflectUV.x * 3.0 + t) * 0.2;
  float brightness = 0.5 + sin(reflectUV.y * 5.0 + t * 2.0 + cellHash3 * 6.28) * 0.3;
  brightness *= 0.6 + u_bass * 0.6;

  vec3 col = hsv2rgb(hue, 0.8, brightness);

  // Each shard rotates independently
  float shardAngle = cellHash3 * 6.28 + t * (cellHash - 0.5) * 2.0;
  float rotPattern = sin(shardAngle + length(shattered) * 5.0);
  col *= 0.8 + rotPattern * 0.3;

  // Bright edges — glass crack lines
  float edge = 1.0 - smoothstep(0.0, 0.08, cellEdge);
  vec3 edgeColor = mix(vec3(1.0), hsv2rgb(t * 0.05, 0.3, 1.0), 0.5);
  col = mix(col, edgeColor, edge * (0.6 + u_high * 0.4));

  // Beat: all shards flash in sequence
  float flashPhase = cellHash * 6.28;
  float flash = sin(flashPhase + beatDecay * 10.0) * 0.5 + 0.5;
  col += vec3(flash * beatDecay * 0.4);

  // Glitch: random shards go black or white
  float glitch = hash(vec2(cellHash, floor(t * 6.0)));
  if (glitch > 0.97) col = vec3(1.0);
  if (glitch < 0.03) col *= 0.1;

  // Scanlines
  col *= 0.92 + 0.08 * sin(gl_FragCoord.y * 3.0);

  // Vignette
  vec2 vc = uv - 0.5;
  col *= 1.0 - dot(vc, vc) * 1.0;

  fragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
