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

  // Black hole center — everything gets sucked in
  float dist = length(p);
  float angle = atan(p.y, p.x);

  // Spiral distortion — pulls toward center
  float suckForce = 0.5 + u_bass * 1.0;
  float spiralAngle = angle + (1.0 / (dist + 0.1)) * 0.8 + t * 0.5;
  float spiralDist = dist + sin(spiralAngle * 5.0 + t * 2.0) * 0.05 * u_mid;

  // Event horizon
  float horizon = smoothstep(0.15 + u_bass * 0.1, 0.0, dist);

  // Accretion disk — rings of energy spiraling in
  float diskAngle = spiralAngle + log(dist + 0.01) * 3.0;
  float disk = sin(diskAngle * 8.0 - t * 3.0) * 0.5 + 0.5;
  disk *= smoothstep(0.05, 0.2, dist) * smoothstep(1.5, 0.3, dist);
  disk = pow(disk, 2.0);

  // Multiple spiral arms
  float arms = 0.0;
  for (int i = 0; i < 4; i++) {
    float armAngle = angle + float(i) * 1.5708 + t * (0.3 + float(i) * 0.1);
    float arm = sin(armAngle - log(dist + 0.01) * (3.0 + u_mid * 2.0)) * 0.5 + 0.5;
    arm = pow(arm, 4.0);
    arm *= smoothstep(0.1, 0.3, dist) * smoothstep(2.0, 0.5, dist);
    arms += arm;
  }
  arms = min(arms, 1.0);

  // Color — hot plasma colors near center, cooler outside
  float hue = dist * 0.3 + t * 0.05 + angle * 0.05;
  vec3 diskColor = hsv2rgb(hue, 0.85, 1.0);
  vec3 armColor = hsv2rgb(hue + 0.3, 0.7, 0.8);

  vec3 col = vec3(0.0);
  col += diskColor * disk * (1.5 + u_bass);
  col += armColor * arms * (0.6 + u_bass * 0.5);

  // Gravitational lensing — distort stars behind
  vec2 lensUV = p / (dist * dist + 0.3);
  float stars = hash(floor(lensUV * 20.0));
  stars = step(0.97, stars) * (1.0 - horizon);
  col += vec3(stars) * 0.6;

  // Energy jets from poles (top and bottom)
  float jet = exp(-abs(p.x) * 8.0) * smoothstep(0.3, 0.8, abs(p.y));
  jet *= (sin(p.y * 20.0 - t * 8.0 * sign(p.y)) * 0.5 + 0.5);
  col += hsv2rgb(0.6 + t * 0.1, 0.6, 1.0) * jet * u_high * 0.8;

  // Beat: pulse ring expanding from center
  float pulseRing = abs(dist - beatDecay * 1.5);
  pulseRing = smoothstep(0.1, 0.0, pulseRing);
  col += vec3(1.0, 0.6, 0.2) * pulseRing * beatDecay;

  // Event horizon glow
  col += hsv2rgb(t * 0.05, 0.5, 1.0) * horizon * 0.3;

  // Darken center — the void
  col *= smoothstep(0.0, 0.15, dist);

  // Beat flash
  col += vec3(beatDecay * 0.15);

  // Vignette
  vec2 vc = uv - 0.5;
  col *= 1.0 - dot(vc, vc) * 0.8;

  fragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
