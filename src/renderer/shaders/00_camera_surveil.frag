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

// Sobel edge detection on luminance
float edgeDetect(vec2 uv, vec2 px) {
  // 3x3 luminance samples
  float tl = dot(texture(u_webcam, uv + vec2(-px.x, -px.y)).rgb, vec3(0.299, 0.587, 0.114));
  float tc = dot(texture(u_webcam, uv + vec2( 0.0,  -px.y)).rgb, vec3(0.299, 0.587, 0.114));
  float tr = dot(texture(u_webcam, uv + vec2( px.x, -px.y)).rgb, vec3(0.299, 0.587, 0.114));
  float ml = dot(texture(u_webcam, uv + vec2(-px.x,  0.0 )).rgb, vec3(0.299, 0.587, 0.114));
  float mr = dot(texture(u_webcam, uv + vec2( px.x,  0.0 )).rgb, vec3(0.299, 0.587, 0.114));
  float bl = dot(texture(u_webcam, uv + vec2(-px.x,  px.y)).rgb, vec3(0.299, 0.587, 0.114));
  float bc = dot(texture(u_webcam, uv + vec2( 0.0,   px.y)).rgb, vec3(0.299, 0.587, 0.114));
  float br = dot(texture(u_webcam, uv + vec2( px.x,  px.y)).rgb, vec3(0.299, 0.587, 0.114));

  // Sobel operators
  float gx = -tl - 2.0*ml - bl + tr + 2.0*mr + br;
  float gy = -tl - 2.0*tc - tr + bl + 2.0*bc + br;

  return length(vec2(gx, gy));
}

void main() {
  vec2 uv = gl_FragCoord.xy / u_resolution;
  uv.y = 1.0 - uv.y;
  float t = u_time;
  float beatDecay = exp(-u_beatTime * 5.0);
  vec2 px = 1.0 / u_resolution; // pixel size

  // === SURVEILLANCE GLITCH UV ===
  vec2 scanUV = uv;

  // Jitter on bass — tracking errors
  float trackNoise = hash1(floor(uv.y * 80.0) + floor(t * 8.0));
  if (trackNoise > 0.92 && u_bass > 0.2) {
    scanUV.x += (trackNoise - 0.92) * 3.0 * u_bass;
  }

  // Beat-driven horizontal tear
  if (beatDecay > 0.6) {
    float tearY = hash1(floor(t * 15.0)) * 0.6 + 0.2;
    float tearH = 0.03 + beatDecay * 0.04;
    if (abs(uv.y - tearY) < tearH) {
      scanUV.x += (hash(vec2(floor(t * 20.0), uv.y * 50.0)) - 0.5) * 0.08 * beatDecay;
    }
  }

  // === EDGE DETECTION — body wireframe ===
  // Multi-scale edge detection for thicker, more visible outlines
  float edgeScale = 1.5 + u_bass * 1.0; // bass makes edges thicker
  float edge1 = edgeDetect(scanUV, px * edgeScale);
  float edge2 = edgeDetect(scanUV, px * edgeScale * 2.0); // coarser pass
  float edge = max(edge1, edge2 * 0.7);

  // Sharpen edges with threshold
  float edgeThreshold = 0.12 - u_mid * 0.05; // mid frequencies reveal more detail
  edge = smoothstep(edgeThreshold, edgeThreshold + 0.15, edge);

  // === BASE COLOR — dark surveillance feed ===
  vec3 cam = texture(u_webcam, scanUV).rgb;
  float luma = dot(cam, vec3(0.299, 0.587, 0.114));

  // Night-vision green tint on the dim base image
  vec3 baseFeed = vec3(luma * 0.06, luma * 0.12, luma * 0.06);

  // === EDGE COLORING — neon wireframe ===
  // Cycle through surveillance colors based on time, slow rotation
  float colorPhase = floor(t * 0.3);
  float ci = mod(colorPhase, 4.0);
  vec3 edgeColor;
  if (ci < 1.0) edgeColor = vec3(0.0, 1.0, 0.4);       // green (classic)
  else if (ci < 2.0) edgeColor = vec3(0.0, 0.7, 1.0);   // cyan
  else if (ci < 3.0) edgeColor = vec3(1.0, 0.1, 0.1);   // red alert
  else edgeColor = vec3(0.8, 0.0, 1.0);                  // purple

  // Beat pulses the edge brightness
  float edgeBright = 0.8 + beatDecay * 0.6 + u_bass * 0.3;
  vec3 wireframe = edge * edgeColor * edgeBright;

  // === TARGETING RETICLE — center crosshair ===
  vec2 center = uv - 0.5;
  float reticleRadius = 0.15 + sin(t * 1.5) * 0.02 + beatDecay * 0.03;
  float dist = length(center);

  // Circle
  float ring = abs(dist - reticleRadius);
  float reticle = smoothstep(0.003, 0.001, ring);

  // Inner ring
  float innerRing = abs(dist - reticleRadius * 0.6);
  reticle += smoothstep(0.002, 0.0008, innerRing) * 0.4;

  // Crosshair lines (only near center, with gap in middle)
  float crossGap = 0.04;
  if (dist > crossGap && dist < reticleRadius * 1.3) {
    float crossH = smoothstep(0.002, 0.0008, abs(center.y)); // horizontal
    float crossV = smoothstep(0.002, 0.0008, abs(center.x)); // vertical
    reticle += (crossH + crossV) * 0.5;
  }

  // Corner brackets
  float bracketSize = reticleRadius * 1.4;
  float bracketThick = 0.002;
  float bracketLen = 0.04;
  vec2 ac = abs(center);
  if (ac.x > bracketSize - bracketLen && ac.x < bracketSize && abs(ac.y - bracketSize) < bracketThick) reticle += 0.7;
  if (ac.y > bracketSize - bracketLen && ac.y < bracketSize && abs(ac.x - bracketSize) < bracketThick) reticle += 0.7;

  vec3 reticleColor = edgeColor * (0.5 + sin(t * 3.0) * 0.15) * reticle;

  // === GRID OVERLAY — surveillance grid ===
  float gridSize = 0.05;
  float gridLine = 0.001;
  vec2 gridUV = fract(uv / gridSize);
  float grid = 0.0;
  if (gridUV.x < gridLine / gridSize || gridUV.y < gridLine / gridSize) {
    grid = 0.12 + u_high * 0.08;
  }
  vec3 gridColor = edgeColor * grid * 0.5;

  // === SCANLINES ===
  float scan = sin(gl_FragCoord.y * 2.0 + t * 4.0) * 0.5 + 0.5;
  float scanEffect = 0.88 + scan * 0.12;

  // === HORIZONTAL INTERFERENCE LINES ===
  float interference = 0.0;
  float lineY = hash1(floor(t * 6.0));
  float lineH = 0.005 + u_bass * 0.01;
  if (abs(uv.y - lineY) < lineH) {
    interference = 0.4 * edgeColor.g;
  }

  // === FEEDBACK — ghostly persistence ===
  vec2 fbUV = uv;
  // Slight drift — surveillance camera pan feel
  float drift = sin(t * 0.2) * 0.001;
  fbUV.x += drift;
  vec3 feedback = texture(u_feedback, fbUV).rgb;

  // Edge trails persist longer, creating motion trails on people
  float fbMix = 0.45 + u_bass * 0.1;
  vec3 trailEdge = feedback * 0.85;

  // === COMPOSITING ===
  vec3 col = baseFeed;               // dark base feed
  col += gridColor;                   // surveillance grid
  col = mix(col + wireframe, trailEdge + wireframe * 0.5, fbMix); // edges + trails
  col += reticleColor;               // targeting reticle
  col += interference;               // glitch lines

  // Apply scanlines
  col *= scanEffect;

  // === BEAT FLASH — detection alert ===
  if (beatDecay > 0.7) {
    // Flash edges brighter — "target acquired" feel
    col += edge * edgeColor * (beatDecay - 0.7) * 3.0;
    // Brief screen-wide tint
    col += edgeColor * 0.05 * (beatDecay - 0.7) * 3.0;
  }

  // === DATA CORRUPTION on strong bass ===
  if (u_bass > 0.5) {
    vec2 blockId = floor(uv * 12.0);
    float blockHash = hash(blockId + floor(t * 8.0));
    if (blockHash > 0.92) {
      // Replace block with offset feedback — datamosh feel
      vec2 offset = vec2(hash(blockId + 50.0) - 0.5, hash(blockId + 100.0) - 0.5) * 0.15;
      col = texture(u_feedback, uv + offset).rgb * edgeColor * 0.8;
    }
  }

  // === SENSOR NOISE ===
  float noise = hash(uv * u_resolution + fract(t) * 200.0);
  col += (noise - 0.5) * 0.06;

  // === VIGNETTE — security camera lens ===
  vec2 vc = uv - 0.5;
  col *= 1.0 - dot(vc, vc) * 1.0;

  // Darken for dark room
  col *= 0.85;

  fragColor = vec4(col, 1.0);
}
