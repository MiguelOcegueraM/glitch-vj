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
uniform sampler2D u_webcam;
uniform sampler2D u_feedback;

out vec4 fragColor;

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

void main() {
  vec2 uv = gl_FragCoord.xy / u_resolution;
  uv.y = 1.0 - uv.y;
  float t = u_time;
  float beatDecay = exp(-u_beatTime * 4.0);

  vec2 center = uv - 0.5;
  float dist = length(center);
  float angle = atan(center.y, center.x);

  // === ACID WARP — swirl UV based on distance + audio ===
  float swirlAmount = u_bass * 3.0 + u_mid * 1.5 + beatDecay * 2.0;
  float swirl = swirlAmount / (dist + 0.3);
  angle += swirl * 0.15 * sin(t * 0.7);

  // Radial breathe — zoom pulses with bass
  float breathe = 1.0 + sin(t * 2.0) * u_bass * 0.15 + beatDecay * 0.1;
  float warpDist = dist * breathe;

  // Reconstruct warped UV
  vec2 warpUV = vec2(cos(angle), sin(angle)) * warpDist + 0.5;

  // Wavy distortion
  warpUV.x += sin(uv.y * 15.0 + t * 3.0) * u_mid * 0.03;
  warpUV.y += cos(uv.x * 12.0 + t * 2.5) * u_mid * 0.03;

  // === SAMPLE WEBCAM with RGB split ===
  float rgbSpread = 0.015 + u_bass * 0.025 + beatDecay * 0.02;
  vec2 rgbDir = vec2(cos(t), sin(t)) * rgbSpread;

  float r = texture(u_webcam, warpUV + rgbDir).r;
  float g = texture(u_webcam, warpUV).g;
  float b = texture(u_webcam, warpUV - rgbDir).b;
  vec3 cam = vec3(r, g, b);

  // === ACID COLOR SHIFT ===
  // Convert to HSV-ish, rotate hue
  float luma = dot(cam, vec3(0.299, 0.587, 0.114));
  vec3 shifted;
  float hueShift = t * 0.4 + u_bass * 2.0 + beatDecay * 3.0;
  shifted.r = cam.r * (sin(hueShift) * 0.5 + 0.5) + cam.g * (cos(hueShift + 1.0) * 0.3) + cam.b * (sin(hueShift + 3.0) * 0.3);
  shifted.g = cam.r * (cos(hueShift + 2.0) * 0.3) + cam.g * (sin(hueShift + 1.5) * 0.5 + 0.5) + cam.b * (cos(hueShift) * 0.3);
  shifted.b = cam.r * (sin(hueShift + 4.0) * 0.3) + cam.g * (cos(hueShift + 3.0) * 0.3) + cam.b * (sin(hueShift + 2.0) * 0.5 + 0.5);
  shifted = max(shifted, 0.0);

  // Boost saturation aggressively
  vec3 col = mix(vec3(luma), shifted, 1.8 + u_volume);

  // === FEEDBACK — trailing acid ghosts ===
  vec2 fbUV = uv;
  // Spiral drift on feedback
  float fbAngle = atan(fbUV.y - 0.5, fbUV.x - 0.5);
  float fbDist = length(fbUV - 0.5);
  fbAngle += 0.02 * sin(t);
  fbDist *= 0.997; // slow zoom
  fbUV = vec2(cos(fbAngle), sin(fbAngle)) * fbDist + 0.5;

  vec3 feedback = texture(u_feedback, fbUV).rgb;

  // Color-shift the feedback too for rainbow trails
  feedback.rgb = feedback.gbr * 0.95; // rotate channels each frame

  float ghostMix = 0.6 + u_volume * 0.15;
  ghostMix *= mix(1.0, 0.2, beatDecay * step(0.6, beatDecay));
  col = mix(col, feedback, ghostMix);

  // === KALEIDOSCOPE overlay on beats ===
  if (beatDecay > 0.3) {
    float segments = 6.0;
    float ka = mod(angle, 6.28318 / segments);
    ka = abs(ka - 3.14159 / segments);
    vec2 kUV = vec2(cos(ka), sin(ka)) * dist + 0.5;
    vec3 kSample = texture(u_webcam, kUV).rgb;
    col = mix(col, kSample * vec3(0.5, 1.0, 0.8), beatDecay * 0.4);
  }

  // === POSTERIZE — acid poster look ===
  float levels = 6.0 + u_high * 10.0;
  col = floor(col * levels) / levels;

  // Vignette
  col *= 1.0 - dist * dist * 0.8;

  // Darken base
  col *= 0.8 + u_bass * 0.3;

  fragColor = vec4(col, 1.0);
}
