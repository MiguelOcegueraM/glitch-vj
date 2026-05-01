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

float hash1(float p) {
  return fract(sin(p * 127.1) * 43758.5453);
}

void main() {
  vec2 uv = gl_FragCoord.xy / u_resolution;
  float t = u_time;
  float beatDecay = exp(-u_beatTime * 5.0);

  // Digital rain columns
  float cols = 40.0 + u_mid * 20.0;
  float colWidth = 1.0 / cols;
  float colIdx = floor(uv.x * cols);

  // Each column has its own speed and phase
  float colSpeed = 0.5 + hash1(colIdx * 7.13) * 2.5 + u_bass * 1.5;
  float colPhase = hash1(colIdx * 13.37) * 100.0;

  // Scrolling Y
  float scrollY = uv.y + t * colSpeed + colPhase;

  // Character cells
  float charSize = colWidth * 1.5;
  float charRow = floor(scrollY / charSize);
  float charFract = fract(scrollY / charSize);

  // Random character brightness (simulates changing glyphs)
  float charHash = hash(vec2(colIdx, charRow + floor(t * 4.0)));
  float nextCharHash = hash(vec2(colIdx, charRow - 1.0 + floor(t * 4.0)));

  // Fade trail — bright at head, fading behind
  float headPos = fract(t * colSpeed * 0.3 + colPhase * 0.01);
  float distFromHead = mod(uv.y - headPos + 1.0, 1.0);
  float trail = exp(-distFromHead * (3.0 - u_bass * 2.0));

  // Character rendering — simple block with internal pattern
  vec2 cellUV = vec2(fract(uv.x * cols), charFract);
  float cellDist = max(abs(cellUV.x - 0.5), abs(cellUV.y - 0.5));
  float glyph = step(cellDist, 0.4) * charHash;

  // Cross pattern inside cells for character look
  float cross = step(abs(cellUV.x - 0.5), 0.15) + step(abs(cellUV.y - 0.5), 0.15);
  cross = min(cross, 1.0);
  float detail = mix(glyph, glyph * cross, 0.5);

  // Base color — green matrix with audio-reactive hue shift
  float hueShift = u_mid * 0.15 + sin(t * 0.2) * 0.05;
  vec3 matrixColor = vec3(0.1 + hueShift, 1.0, 0.3 + hueShift);

  // Head of trail is white-hot
  float headBright = exp(-distFromHead * 15.0);
  vec3 col = detail * trail * matrixColor;
  col += headBright * vec3(0.5, 1.0, 0.5) * detail;

  // Glitch — horizontal displacement on beat
  if (beatDecay > 0.3) {
    float glitchBand = hash(vec2(floor(uv.y * 30.0), floor(t * 10.0)));
    if (glitchBand > 0.85) {
      col = col.gbr; // color channel swap
      col *= 1.5;
    }
  }

  // Random bright flashes in cells
  float flash = hash(vec2(colIdx, charRow + floor(t * 12.0)));
  if (flash > 0.995) {
    col += vec3(0.3, 1.0, 0.3);
  }

  // Scanlines
  float scan = sin(gl_FragCoord.y * 2.0) * 0.5 + 0.5;
  col *= 0.85 + scan * 0.15;

  // Beat: bright pulse across whole screen
  col += matrixColor * beatDecay * 0.15;

  // CRT curve vignette
  vec2 vc = uv - 0.5;
  col *= 1.0 - dot(vc, vc) * 1.5;

  // Static noise
  float noise = hash(gl_FragCoord.xy + t * 999.0);
  col += noise * 0.02;

  fragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
