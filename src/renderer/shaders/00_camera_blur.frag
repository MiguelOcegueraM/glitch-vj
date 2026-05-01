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

  // === RADIAL MOTION BLUR ===
  // Blur direction: radial from center, amount driven by bass
  vec2 center = vec2(0.5);
  vec2 dir = uv - center;
  float blurAmount = 0.02 + u_bass * 0.06 + beatDecay * 0.04;

  // Accumulate samples along the radial direction
  vec3 cam = vec3(0.0);
  const int SAMPLES = 6;
  for (int i = 0; i < SAMPLES; i++) {
    float offset = float(i) / float(SAMPLES) - 0.5;
    vec2 sampleUV = uv + dir * offset * blurAmount;
    cam += texture(u_webcam, sampleUV).rgb;
  }
  cam /= float(SAMPLES);

  // === DREAMY GLOW — blur the bright parts extra ===
  // Sample a wider blur for glow
  vec3 glow = vec3(0.0);
  float glowRadius = 0.01 + u_mid * 0.02;
  for (int i = 0; i < 4; i++) {
    float a = float(i) * 1.5708; // 2*PI/4
    vec2 off = vec2(cos(a), sin(a)) * glowRadius;
    glow += texture(u_webcam, uv + off).rgb;
  }
  glow /= 4.0;

  // Only add glow where bright (dreamy bloom)
  float brightness = dot(glow, vec3(0.333));
  cam += glow * smoothstep(0.3, 0.8, brightness) * (0.5 + u_volume);

  // === HEAVY FEEDBACK — long ghostly trails ===
  vec2 fbUV = uv;
  // Slow vertical drift — ghosts rise upward like smoke
  fbUV.y -= 0.004 * (1.0 + u_bass);
  // Slight horizontal wave
  fbUV.x += sin(uv.y * 8.0 + t * 1.5) * 0.003;
  // Very slight zoom for echo depth
  fbUV = mix(fbUV, center, 0.002);

  vec3 feedback = texture(u_feedback, fbUV).rgb;

  // Desaturate feedback slightly — fading ghosts become more ethereal
  float fbLuma = dot(feedback, vec3(0.299, 0.587, 0.114));
  feedback = mix(feedback, vec3(fbLuma), 0.15);

  // Very high feedback mix — long smeared trails
  float ghostMix = 0.75 + u_volume * 0.1;
  // On beat: brief moment of clarity
  ghostMix *= mix(1.0, 0.4, beatDecay * step(0.5, beatDecay));

  vec3 col = mix(cam, feedback, ghostMix);

  // === DREAMY COLOR TINT — shift toward cool/warm tones ===
  float tintPhase = sin(t * 0.2) * 0.5 + 0.5;
  vec3 coolTint = vec3(0.7, 0.85, 1.0);
  vec3 warmTint = vec3(1.0, 0.85, 0.7);
  vec3 tint = mix(coolTint, warmTint, tintPhase);
  col *= tint;

  // === SOFT FOCUS EFFECT ===
  // Darken edges more aggressively for a lens/dream look
  float dist = length(uv - 0.5);
  float vignette = smoothstep(0.8, 0.2, dist);
  col *= vignette;

  // Extra blur at edges (sample feedback at edges for more smear)
  float edgeMix = smoothstep(0.3, 0.7, dist);
  col = mix(col, feedback * tint * vignette, edgeMix * 0.3);

  // === SUBTLE GRAIN ===
  float noise = hash(gl_FragCoord.xy + t * 300.0);
  col += (noise - 0.5) * 0.05;

  // === BEAT: brief sharpness + brightness pop ===
  if (beatDecay > 0.5) {
    vec3 sharp = texture(u_webcam, uv).rgb;
    col = mix(col, sharp * 1.3, beatDecay * 0.3);
  }

  // Overall dreamy brightness
  col *= 0.85 + u_bass * 0.2;

  fragColor = vec4(col, 1.0);
}
