#version 300 es
precision mediump float;

uniform sampler2D u_scene;
uniform vec2 u_resolution;
uniform int u_panelCount;

// Per-panel config (max 8 panels)
// rect.xy = center (normalized UV), rect.z = halfSize (aspect-corrected), rect.w = lockHorizontal (1.0 or 0.0)
uniform vec4 u_panelRects[8];
// Physical rotation of the panel in radians
uniform float u_panelRotations[8];
// Source region in the scene texture: (srcX, srcY, srcW, srcH)
uniform vec4 u_panelUVs[8];

out vec4 fragColor;

void main() {
  vec2 uv = gl_FragCoord.xy / u_resolution;
  float aspect = u_resolution.x / u_resolution.y;
  fragColor = vec4(0.0, 0.0, 0.0, 1.0);

  for (int i = 0; i < 8; i++) {
    if (i >= u_panelCount) break;

    vec4 rect = u_panelRects[i];
    float rot = u_panelRotations[i];
    vec4 srcUV = u_panelUVs[i];
    float lockH = rect.w;
    float halfSize = rect.z;

    // Aspect-corrected offset from panel center
    vec2 d = (uv - rect.xy) * vec2(aspect, 1.0);

    // Rotate into panel-local space to check bounds
    float c = cos(-rot);
    float s = sin(-rot);
    vec2 local = vec2(c * d.x - s * d.y, s * d.x + c * d.y);

    if (abs(local.x) <= halfSize && abs(local.y) <= halfSize) {
      // lockH=1: sample with un-rotated coords (video stays horizontal)
      // lockH=0: sample with rotated coords (video rotates with panel)
      vec2 sampleCoord = mix(local, d, lockH);
      vec2 panelUV = (sampleCoord / halfSize) * 0.5 + 0.5;
      vec2 sceneUV = srcUV.xy + panelUV * srcUV.zw;
      fragColor = texture(u_scene, sceneUV);
      return;
    }
  }
}
