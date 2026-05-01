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

void main() {
  vec2 uv = gl_FragCoord.xy / u_resolution;
  float t = u_time;
  float beatDecay = exp(-u_beatTime * 5.0);

  // Block noise - VHS style
  float blockSizeX = 8.0 + u_bass * 40.0;
  float blockSizeY = 4.0 + u_bass * 20.0;
  vec2 block = floor(gl_FragCoord.xy / vec2(blockSizeX, blockSizeY));

  // Static noise with time variation
  float n1 = hash(block + floor(t * 15.0));
  float n2 = hash(block + floor(t * 15.0) + 100.0);
  float n3 = hash(block + floor(t * 15.0) + 200.0);

  // Dynamic threshold - bass controls how much of the noise is visible
  float threshold = 0.3 + u_bass * 0.5;

  // Apply threshold for blocky appearance
  float visible = step(1.0 - threshold, n1);
  vec3 col = vec3(n1, n2, n3) * visible;

  // VHS horizontal distortion
  float lineOffset = hash(vec2(floor(gl_FragCoord.y / 2.0), floor(t * 30.0)));
  if (lineOffset > 0.95) {
    vec2 shiftedBlock = floor((gl_FragCoord.xy + vec2(u_bass * 200.0, 0.0)) / vec2(blockSizeX, blockSizeY));
    col = vec3(hash(shiftedBlock + floor(t * 15.0)));
  }

  // Scanlines
  float scanline = sin(gl_FragCoord.y * 1.5) * 0.5 + 0.5;
  col *= mix(1.0, scanline, u_high * 0.5 + 0.2);

  // Color tint - shifts over time
  vec3 tint = vec3(
    sin(t * 0.3) * 0.3 + 0.7,
    sin(t * 0.3 + 2.0) * 0.3 + 0.7,
    sin(t * 0.3 + 4.0) * 0.3 + 0.7
  );
  col *= tint;

  // Beat: full screen noise burst
  if (beatDecay > 0.5) {
    float burstNoise = hash(gl_FragCoord.xy + t * 1000.0);
    col = mix(col, vec3(burstNoise), beatDecay * 0.5);
  }

  // Vertical rolling bar (VHS tracking)
  float rollPos = fract(t * 0.15);
  float rollBar = smoothstep(0.0, 0.05, abs(uv.y - rollPos));
  col *= rollBar;

  fragColor = vec4(col, 1.0);
}
