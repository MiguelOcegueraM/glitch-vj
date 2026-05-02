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

void main() {
  vec2 uv = gl_FragCoord.xy / u_resolution;

  // Which of the 3 vertical zones are we in? (0, 1, 2)
  float zoneF = floor(min(uv.x * 3.0, 2.0));
  int zone = int(zoneF);

  // Cycle through zones — rate increases with bass energy
  float rate = 2.5 + u_bass * 4.0;
  float cycle = mod(u_time * rate, 3.0);
  float activeZoneF = floor(cycle);

  // Strobe intensity: sharp flash that decays
  float beatDecay = exp(-u_beatTime * 6.0);
  float strobe = beatDecay * beatDecay;

  // Active zone test via float comparison (avoids int==int Metal driver issues)
  float zoneActive = (zoneF == activeZoneF) ? 1.0 : 0.0;
  float flash = zoneActive * max(strobe, 0.15 * zoneActive);

  // Color per zone (slightly different tints)
  vec3 zoneColors[3];
  zoneColors[0] = vec3(1.0, 0.95, 0.9);  // warm white
  zoneColors[1] = vec3(0.9, 0.95, 1.0);  // cool white
  zoneColors[2] = vec3(1.0, 0.9, 1.0);   // pink white

  vec3 col = zoneColors[zone] * flash;

  // Subtle edge glow between zones
  float zoneEdge = fract(uv.x * 3.0);
  float edge = smoothstep(0.0, 0.02, zoneEdge) * smoothstep(1.0, 0.98, zoneEdge);
  col *= edge;

  // Bass punch: extra brightness on beat for the active zone
  col += zoneColors[zone] * u_beat * zoneActive * 0.5;

  // Dim ambient on inactive zones so they're not pure black
  float ambient = (1.0 - zoneActive) * u_volume * 0.03;
  col += vec3(ambient);

  fragColor = vec4(col, 1.0);
}
