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

// Thermal color ramp: black -> blue -> purple -> red -> orange -> yellow -> white
vec3 thermalRamp(float t) {
  // 7-stop gradient for realistic thermal look
  if (t < 0.15) return mix(vec3(0.0, 0.0, 0.1), vec3(0.1, 0.0, 0.5), t / 0.15);        // black -> deep blue
  if (t < 0.30) return mix(vec3(0.1, 0.0, 0.5), vec3(0.5, 0.0, 0.7), (t - 0.15) / 0.15); // deep blue -> purple
  if (t < 0.45) return mix(vec3(0.5, 0.0, 0.7), vec3(0.9, 0.0, 0.2), (t - 0.30) / 0.15); // purple -> red
  if (t < 0.60) return mix(vec3(0.9, 0.0, 0.2), vec3(1.0, 0.4, 0.0), (t - 0.45) / 0.15); // red -> orange
  if (t < 0.80) return mix(vec3(1.0, 0.4, 0.0), vec3(1.0, 1.0, 0.0), (t - 0.60) / 0.20); // orange -> yellow
  return mix(vec3(1.0, 1.0, 0.0), vec3(1.0, 1.0, 1.0), (t - 0.80) / 0.20);               // yellow -> white
}

void main() {
  vec2 uv = gl_FragCoord.xy / u_resolution;
  uv.y = 1.0 - uv.y;
  float t = u_time;
  float beatDecay = exp(-u_beatTime * 4.0);

  // === HEAT SHIMMER — subtle UV distortion ===
  vec2 heatUV = uv;
  float shimmer = u_bass * 0.008 + u_volume * 0.004;
  heatUV.x += sin(uv.y * 40.0 + t * 3.0) * shimmer;
  heatUV.y += cos(uv.x * 30.0 + t * 2.5) * shimmer * 0.6;

  // Beat-driven distortion burst
  if (beatDecay > 0.5) {
    float blockY = floor(uv.y * 20.0);
    float h = hash(vec2(blockY, floor(t * 10.0)));
    if (h > 0.7) {
      heatUV.x += (h - 0.7) * 0.06 * beatDecay;
    }
  }

  // === SAMPLE WEBCAM ===
  vec3 cam = texture(u_webcam, heatUV).rgb;

  // === LUMINANCE to THERMAL COLOR ===
  float luma = dot(cam, vec3(0.299, 0.587, 0.114));

  // Contrast boost — push the thermal mapping for more dramatic bands
  float contrast = 1.3 + u_bass * 0.4;
  luma = clamp((luma - 0.5) * contrast + 0.5, 0.0, 1.0);

  // Bass shifts the thermal sensitivity (hotter overall on bass hits)
  luma = clamp(luma + u_bass * 0.12 + beatDecay * 0.08, 0.0, 1.0);

  vec3 thermal = thermalRamp(luma);

  // === THERMAL GLOW on hot spots ===
  if (luma > 0.75) {
    float glow = (luma - 0.75) * 4.0;
    thermal += vec3(glow * 0.3, glow * 0.2, glow * 0.05) * (1.0 + beatDecay * 0.5);
  }

  // === FEEDBACK — thermal trails ===
  vec2 fbUV = uv;
  // Slight upward drift (heat rises)
  fbUV.y -= 0.003 + u_bass * 0.004;
  // Tiny zoom for heat dissipation feel
  fbUV = (fbUV - 0.5) * 0.998 + 0.5;
  vec3 feedback = texture(u_feedback, fbUV).rgb;

  // Blend with feedback — hot trails linger
  float fbMix = 0.3 + u_mid * 0.15;
  vec3 col = mix(thermal, feedback * 0.95, fbMix);

  // === TEMPERATURE READOUT FLICKER — scanline noise ===
  float scan = sin(gl_FragCoord.y * 1.5 + t * 8.0) * 0.5 + 0.5;
  col *= 0.92 + scan * 0.08;

  // === SUBTLE SENSOR NOISE ===
  float noise = hash(uv * u_resolution + fract(t) * 100.0) * 0.06;
  col += noise - 0.03;

  // === BEAT FLASH — thermal overload ===
  if (beatDecay > 0.7) {
    // White-hot flash on strong beats
    col = mix(col, thermalRamp(clamp(luma + 0.3, 0.0, 1.0)) * 1.4, (beatDecay - 0.7) * 2.0);
  }

  // === VIGNETTE — lens effect ===
  vec2 vc = uv - 0.5;
  col *= 1.0 - dot(vc, vc) * 0.8;

  // Darken for dark room
  col *= 0.9;

  fragColor = vec4(col, 1.0);
}
