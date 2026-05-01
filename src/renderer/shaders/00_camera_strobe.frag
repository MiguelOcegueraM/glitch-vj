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

float hash1(float p) {
  return fract(sin(p * 127.1) * 43758.5453);
}

void main() {
  vec2 uv = gl_FragCoord.xy / u_resolution;
  uv.y = 1.0 - uv.y;
  float t = u_time;
  float beatDecay = exp(-u_beatTime * 6.0); // faster decay for strobe
  float beatHard = step(0.4, beatDecay); // hard on/off

  // === GLITCH UV DISTORTION — aggressive ===
  vec2 glitchUV = uv;

  // Horizontal block tears — more frequent and harsher
  float blockH = 0.02 + u_bass * 0.08;
  float blockRow = floor(uv.y / blockH);
  float rowHash = hash1(blockRow + floor(t * 15.0));
  if (rowHash > 0.6) {
    glitchUV.x += (rowHash - 0.6) * 2.5 * u_bass;
  }

  // Vertical slice displacement on beats
  if (beatHard > 0.5) {
    float sliceX = floor(uv.x * 8.0);
    float sliceHash = hash1(sliceX + floor(t * 20.0));
    glitchUV.y += (sliceHash - 0.5) * 0.15;
  }

  // === SAMPLE WEBCAM ===
  vec3 cam = texture(u_webcam, glitchUV).rgb;

  // === STROBE: high-contrast silhouette ===
  float luma = dot(cam, vec3(0.299, 0.587, 0.114));

  // Threshold to create hard black/white silhouette
  float threshold = 0.4 + u_mid * 0.2;
  float silhouette = step(threshold, luma);

  // Strobe color cycles through harsh neon colors on each beat
  float colorIdx = floor(t * 2.0); // changes with beats roughly
  vec3 strobeColor;
  float ci = mod(colorIdx, 5.0);
  if (ci < 1.0) strobeColor = vec3(1.0, 0.0, 0.0);       // red
  else if (ci < 2.0) strobeColor = vec3(0.0, 1.0, 0.0);   // green
  else if (ci < 3.0) strobeColor = vec3(0.0, 0.0, 1.0);   // blue
  else if (ci < 4.0) strobeColor = vec3(1.0, 1.0, 0.0);   // yellow
  else strobeColor = vec3(1.0, 0.0, 1.0);                  // magenta

  // On beat: flash the silhouette in strobe color, otherwise dark
  vec3 col;
  if (beatHard > 0.5) {
    // FLASH — bright silhouette
    col = silhouette * strobeColor * 1.5;
    // Invert random blocks for extra chaos
    vec2 bId = floor(uv * 6.0);
    if (hash(bId + floor(t * 30.0)) > 0.6) {
      col = strobeColor * (1.0 - silhouette) * 1.2;
    }
  } else {
    // Between beats: dark with faint ghostly camera
    col = cam * 0.08;
  }

  // === RGB GLITCH SPLIT on beat ===
  if (beatHard > 0.5) {
    float shift = 0.02 + u_bass * 0.04;
    float rr = texture(u_webcam, glitchUV + vec2(shift, 0.0)).r;
    float bb = texture(u_webcam, glitchUV - vec2(shift, 0.0)).b;
    vec3 rgbGlitch = vec3(rr, cam.g, bb);
    float rgbSil = step(threshold, dot(rgbGlitch, vec3(0.333)));
    col = mix(col, rgbGlitch * strobeColor, 0.4);
  }

  // === FEEDBACK — frozen ghost frames ===
  vec2 fbUV = uv;
  // No drift — frozen ghosts
  vec3 feedback = texture(u_feedback, fbUV).rgb;

  // Mix: keep feedback between beats for ghostly persistence
  // Beat clears and replaces, between beats feedback dominates
  float fbMix = mix(0.85, 0.1, beatHard);
  col = mix(feedback * 0.9, col, 1.0 - fbMix);

  // === SCANLINES — harsh ===
  float scan = step(0.5, fract(gl_FragCoord.y * 0.5));
  col *= 0.7 + scan * 0.3;

  // === HORIZONTAL NOISE LINES ===
  float lineNoise = hash1(floor(gl_FragCoord.y / 3.0) + floor(t * 25.0));
  if (lineNoise > 0.93) {
    col += strobeColor * 0.3 * beatDecay;
  }

  // === BLOCK CORRUPTION on bass ===
  float corruptSize = 0.04 + u_bass * 0.08;
  vec2 corruptId = floor(uv / corruptSize);
  float corruptHash = hash(corruptId + floor(t * 12.0));
  if (corruptHash > 0.9 && u_bass > 0.3) {
    vec2 corruptOffset = vec2(
      (hash(corruptId + 100.0) - 0.5) * 0.3,
      (hash(corruptId + 200.0) - 0.5) * 0.2
    );
    col = texture(u_feedback, uv + corruptOffset).rgb * strobeColor;
  }

  // === VIGNETTE ===
  vec2 vc = uv - 0.5;
  col *= 1.0 - dot(vc, vc) * 1.2;

  fragColor = vec4(col, 1.0);
}
