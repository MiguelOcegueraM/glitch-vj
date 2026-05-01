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

  float angle = atan(p.y, p.x);
  float radius = length(p);

  // Tunnel coordinates
  float tunnelSpeed = 1.0 + u_bass * 4.0;
  float tunnelDist = 1.0 / (radius + 0.001);
  float tunnelAngle = angle / 3.14159;

  // Twist with mid
  tunnelAngle += u_mid * sin(tunnelDist * 2.0 + t) * 0.5;

  // Scroll
  float tx = tunnelAngle;
  float ty = tunnelDist - t * tunnelSpeed;

  // Pattern
  float pattern = 0.0;
  pattern += sin(tx * 8.0) * sin(ty * 4.0);
  pattern += sin(tx * 4.0 + ty * 2.0 + t) * 0.5;

  // Color palette - changes on beat
  float paletteOffset = floor(t * 0.5) * 1.3 + beatDecay * 2.0;
  vec3 col;
  col.r = sin(pattern * 2.0 + paletteOffset + 0.0) * 0.5 + 0.5;
  col.g = sin(pattern * 2.0 + paletteOffset + 2.0) * 0.5 + 0.5;
  col.b = sin(pattern * 2.0 + paletteOffset + 4.0) * 0.5 + 0.5;

  // Depth fade
  float depthFade = smoothstep(0.0, 2.0, tunnelDist);
  col *= depthFade;

  // Center glow
  col += vec3(0.1, 0.05, 0.2) / (radius * 3.0 + 0.5);

  // Bass intensifies
  col *= 1.0 + u_bass * 1.5;

  // High adds edge sharpness / scanlines
  col *= 1.0 - u_high * 0.2 * step(0.5, fract(ty * 20.0));

  // Beat flash
  col += vec3(beatDecay * 0.4);

  // Vignette
  col *= smoothstep(2.5, 0.5, radius);

  fragColor = vec4(col, 1.0);
}
