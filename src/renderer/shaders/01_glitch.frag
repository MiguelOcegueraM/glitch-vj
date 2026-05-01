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

  // Block-based datamosh: divide screen into blocks
  float blockSize = mix(0.02, 0.15, u_bass);
  vec2 block = floor(uv / blockSize);
  float blockHash = hash(block + floor(t * 2.0));

  // Displace blocks based on bass
  vec2 displaced = uv;
  if (blockHash > 0.5) {
    float offsetX = (hash(block + 10.0) - 0.5) * u_bass * 0.4;
    float offsetY = (hash(block + 20.0) - 0.5) * u_bass * 0.2;
    displaced += vec2(offsetX, offsetY);
  }

  // RGB shift
  float shift = u_high * 0.03 + beatDecay * 0.05;
  float r = hash(floor(displaced / blockSize) + vec2(t, 0.0));
  float g = hash(floor((displaced + vec2(shift, 0.0)) / blockSize) + vec2(t, 1.0));
  float b = hash(floor((displaced - vec2(shift, 0.0)) / blockSize) + vec2(t, 2.0));

  // Create colored noise pattern — crush darks, only bass brings brightness
  vec3 col = vec3(r, g, b);
  col *= col; // gamma crush — makes it much darker by default
  col *= 0.4 + u_bass * 0.8; // mostly dark, bass punches it up

  // Scanlines
  float scanline = sin(gl_FragCoord.y * 3.0 + t * 10.0) * 0.5 + 0.5;
  scanline = mix(1.0, scanline, u_high * 0.5 + 0.3);
  col *= scanline;

  // Horizontal glitch lines — sparse bright cracks
  float lineNoise = hash1(floor(uv.y * 100.0) + floor(t * 20.0));
  if (lineNoise > 0.95) {
    col = vec3(1.0) - col;
    displaced.x += (hash1(floor(uv.y * 50.0) + t) - 0.5) * 0.3 * u_bass;
  }

  // Beat flash with inversion — brief bright punch
  if (u_beat > 0.5) {
    col = vec3(1.0) - col;
  }
  col += vec3(beatDecay * 0.15); // reduced flash sustain

  // Static noise overlay — dim
  float noise = hash(gl_FragCoord.xy + t * 1000.0);
  col = mix(col, vec3(noise * 0.3), u_high * 0.15);

  // Stronger vignette
  vec2 vc = uv - 0.5;
  col *= 1.0 - dot(vc, vc) * 1.2;

  // Color tint based on mid
  col *= mix(vec3(1.0), vec3(0.3, 0.8, 0.6), u_mid * 0.4);

  fragColor = vec4(col, 1.0);
}
