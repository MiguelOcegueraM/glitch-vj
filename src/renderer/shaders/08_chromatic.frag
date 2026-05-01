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

float pattern(vec2 p, float t) {
  float d = length(p);
  float rings = sin(d * 15.0 - t * 3.0) * 0.5 + 0.5;
  rings *= sin(d * 8.0 + t * 2.0) * 0.5 + 0.5;
  float radial = sin(atan(p.y, p.x) * 5.0 + t) * 0.5 + 0.5;
  return mix(rings, radial, 0.3);
}

void main() {
  vec2 uv = gl_FragCoord.xy / u_resolution;
  vec2 p = (uv - 0.5) * 2.0;
  p.x *= u_resolution.x / u_resolution.y;

  float t = u_time;
  float beatDecay = exp(-u_beatTime * 5.0);

  // EXTREME chromatic aberration offset
  float aberration = u_bass * 0.3 + beatDecay * 0.15;

  // Direction of aberration - rotates over time
  float aberAngle = t * 0.5;
  vec2 aberDir = vec2(cos(aberAngle), sin(aberAngle));

  // Sample pattern at three offset positions
  vec2 rOffset = aberDir * aberration;
  vec2 gOffset = vec2(0.0);
  vec2 bOffset = -aberDir * aberration;

  float r = pattern(p + rOffset, t);
  float g = pattern(p + gOffset, t);
  float b = pattern(p + bOffset, t);

  vec3 col = vec3(r, g, b);

  // Additional radial aberration
  float radialAber = u_bass * 0.1;
  vec2 center = p;
  float dist = length(center);
  vec2 radDir = normalize(center + 0.001);

  float r2 = pattern(p + radDir * radialAber * dist, t + 0.1);
  float b2 = pattern(p - radDir * radialAber * dist, t - 0.1);
  col.r = mix(col.r, r2, 0.5);
  col.b = mix(col.b, b2, 0.5);

  // Mid boosts saturation
  col = pow(col, vec3(0.8 - u_mid * 0.3));

  // High adds fine detail / noise
  float noise = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233)) + t * 50.0) * 43758.5453);
  col += noise * u_high * 0.08;

  // Beat flash
  col += vec3(beatDecay * 0.3);

  // Boost overall brightness with bass
  col *= 1.0 + u_bass * 0.5;

  fragColor = vec4(col, 1.0);
}
