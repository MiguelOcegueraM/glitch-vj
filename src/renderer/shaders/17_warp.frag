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

  // Hyperdrive — everything streaks toward/away from center
  float dist = length(p);
  float angle = atan(p.y, p.x);

  // Speed lines — radial streaks
  float speed = 2.0 + u_bass * 4.0;
  float streakAngle = angle * 40.0; // lots of radial divisions
  float streak = sin(streakAngle) * 0.5 + 0.5;
  streak = pow(streak, 3.0); // thin bright lines

  // Depth layers flying past — concentric rings zooming out
  float depth = 0.0;
  for (int i = 0; i < 6; i++) {
    float layer = float(i) * 0.4;
    float ring = fract(-dist * (3.0 + float(i)) + t * speed + layer);
    ring = pow(ring, 4.0 + u_bass * 3.0); // sharper rings = faster feel
    depth += ring * (1.0 - float(i) * 0.12);
  }

  // Star field — dots flying from center
  float starAngle = floor(angle * 30.0 / 6.28) * 6.28 / 30.0;
  float starDist = fract(dist * 5.0 - t * speed * 0.5 + hash(vec2(starAngle * 10.0, 0.0)) * 5.0);
  float star = smoothstep(0.02, 0.0, abs(starDist - 0.5)) * smoothstep(0.02, 0.0, abs(angle - starAngle - 3.14/30.0));
  star *= step(0.5, hash(vec2(floor(angle * 30.0 / 6.28), floor(dist * 5.0 - t * speed * 0.5))));

  // Color — blue/purple/white warp tunnel
  float hue = 0.6 + dist * 0.1 + t * 0.03; // blue shifting to purple
  vec3 streakColor = hsv2rgb(hue, 0.6 - dist * 0.2, 1.0);
  vec3 depthColor = hsv2rgb(hue + 0.1, 0.5, 0.8);

  vec3 col = vec3(0.0);
  col += streakColor * streak * (0.3 + u_bass * 0.5) * smoothstep(1.5, 0.0, dist);
  col += depthColor * depth * 0.4;
  col += vec3(1.0) * star * 2.0;

  // Central bright core
  float core = exp(-dist * 3.0);
  col += vec3(0.8, 0.9, 1.0) * core * (0.5 + u_bass * 0.8);

  // Warp field distortion bands
  float warpBand = sin(dist * 15.0 - t * speed * 2.0 + angle * 2.0);
  warpBand = smoothstep(0.8, 1.0, warpBand);
  col += hsv2rgb(hue + 0.2, 0.4, 0.6) * warpBand * 0.3 * u_mid;

  // Beat: flash + burst expanding ring
  float burstRing = abs(dist - beatDecay * 2.0);
  burstRing = smoothstep(0.15, 0.0, burstRing);
  col += vec3(1.0, 0.8, 0.5) * burstRing * beatDecay;

  // Glitch — horizontal tear
  float tearLine = hash(vec2(floor(uv.y * 50.0), floor(t * 12.0)));
  if (tearLine > 0.97) {
    col = col.brg * 1.3;
  }

  // Speed boost on beat — everything gets brighter and more saturated
  col *= 1.0 + beatDecay * 0.5;

  // Chromatic aberration at edges
  float aberration = dist * 0.1 * u_high;
  col.r *= 1.0 + aberration;
  col.b *= 1.0 - aberration * 0.5;

  // Vignette — bright center, dark edges
  col *= 1.0 - dist * 0.3;

  // Scanlines subtle
  col *= 0.96 + 0.04 * sin(gl_FragCoord.y * 2.0);

  fragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
