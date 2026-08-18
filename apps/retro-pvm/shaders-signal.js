export const VERTEX_SHADER = `#version 300 es
precision highp float;
layout(location = 0) in vec2 a_position;
out vec2 v_uv;
void main() {
  v_uv = a_position * 0.5 + 0.5;
  gl_Position = vec4(a_position, 0.0, 1.0);
}`;

export const SIGNAL_FRAGMENT_SHADER = `#version 300 es
precision highp float;
precision highp int;

in vec2 v_uv;
layout(location = 0) out vec4 outProcessed;
layout(location = 1) out vec4 outRaw;

uniform sampler2D u_source;
uniform sampler2D u_previous;
uniform vec2 u_sourceRes;
uniform vec2 u_outputRes;
uniform float u_time;
uniform float u_delta;
uniform int u_frame;
uniform int u_sourceMode;
uniform int u_testPattern;
uniform int u_signalType;
uniform int u_fitMode;
uniform int u_combFilter;
uniform int u_vhsSpeed;

uniform float u_sourceZoom;
uniform float u_sourcePanX;
uniform float u_sourcePanY;
uniform float u_sourceRotation;
uniform bool u_mirrorX;
uniform bool u_mirrorY;

uniform float u_signalStrength;
uniform float u_noise;
uniform float u_jitter;
uniform float u_horizontalTear;
uniform float u_ghosting;
uniform float u_chromaBleed;
uniform float u_chromaDelay;
uniform float u_dotCrawl;
uniform float u_ringing;
uniform float u_lumaBandwidth;
uniform float u_chromaBandwidth;
uniform float u_rfMultipath;
uniform float u_humBar;
uniform float u_tracking;
uniform float u_dropout;
uniform float u_agcPumping;
uniform float u_colorBurstPhase;

uniform float u_phosphorDecayR;
uniform float u_phosphorDecayG;
uniform float u_phosphorDecayB;
uniform float u_persistenceStrength;
uniform float u_beamWidth;
uniform bool u_beamScan;
uniform bool u_reducedMotion;

const float PI = 3.14159265358979323846;
const float TAU = 6.28318530717958647692;

float hash11(float p) {
  p = fract(p * 0.1031);
  p *= p + 33.33;
  p *= p + p;
  return fract(p);
}
float hash21(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
float valueNoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float a = hash21(i);
  float b = hash21(i + vec2(1.0, 0.0));
  float c = hash21(i + vec2(0.0, 1.0));
  float d = hash21(i + vec2(1.0, 1.0));
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}

vec3 rgb2yiq(vec3 c) {
  return vec3(
    dot(c, vec3(0.299, 0.587, 0.114)),
    dot(c, vec3(0.595716, -0.274453, -0.321263)),
    dot(c, vec3(0.211456, -0.522591, 0.311135))
  );
}
vec3 yiq2rgb(vec3 c) {
  return vec3(
    c.x + 0.9563 * c.y + 0.6210 * c.z,
    c.x - 0.2721 * c.y - 0.6474 * c.z,
    c.x - 1.1070 * c.y + 1.7046 * c.z
  );
}
vec2 rotate2(vec2 p, float angle) {
  float s = sin(angle), c = cos(angle);
  return mat2(c, -s, s, c) * p;
}

vec2 mapSourceUV(vec2 uv, out float valid) {
  vec2 p = uv - 0.5;
  float targetAspect = max(u_outputRes.x / max(u_outputRes.y, 1.0), 0.001);
  float sourceAspect = max(u_sourceRes.x / max(u_sourceRes.y, 1.0), 0.001);
  if (u_fitMode == 3) targetAspect = 4.0 / 3.0;

  vec2 q = p;
  valid = 1.0;
  if (u_fitMode == 0) {
    if (sourceAspect > targetAspect) {
      float h = targetAspect / sourceAspect;
      valid *= step(abs(p.y), 0.5 * h);
      q.y = p.y / max(h, 0.0001);
    } else {
      float w = sourceAspect / targetAspect;
      valid *= step(abs(p.x), 0.5 * w);
      q.x = p.x / max(w, 0.0001);
    }
  } else if (u_fitMode == 1 || u_fitMode == 3) {
    if (sourceAspect > targetAspect) q.x = p.x * targetAspect / sourceAspect;
    else q.y = p.y * sourceAspect / targetAspect;
  }

  q /= max(u_sourceZoom, 0.001);
  q += vec2(u_sourcePanX, -u_sourcePanY) * 0.5;
  q = rotate2(q, radians(u_sourceRotation));
  if (u_mirrorX) q.x = -q.x;
  if (u_mirrorY) q.y = -q.y;
  valid *= step(abs(q.x), 0.5) * step(abs(q.y), 0.5);
  return q + 0.5;
}

vec3 smptePattern(vec2 uv) {
  float x = uv.x;
  if (uv.y > 0.33) {
    int bar = int(floor(clamp(x, 0.0, 0.9999) * 7.0));
    if (bar == 0) return vec3(0.75);
    if (bar == 1) return vec3(0.75, 0.75, 0.0);
    if (bar == 2) return vec3(0.0, 0.75, 0.75);
    if (bar == 3) return vec3(0.0, 0.75, 0.0);
    if (bar == 4) return vec3(0.75, 0.0, 0.75);
    if (bar == 5) return vec3(0.75, 0.0, 0.0);
    return vec3(0.0, 0.0, 0.75);
  }
  if (uv.y > 0.25) {
    int bar = int(floor(clamp(x, 0.0, 0.9999) * 7.0));
    if (bar == 0) return vec3(0.0, 0.0, 0.75);
    if (bar == 1 || bar == 3 || bar == 5) return vec3(0.075);
    if (bar == 2) return vec3(0.75, 0.0, 0.75);
    if (bar == 4) return vec3(0.0, 0.75, 0.75);
    return vec3(0.75);
  }
  if (x < 0.25) return vec3(0.0, 0.125, 0.25);
  if (x < 0.50) return vec3(1.0);
  if (x < 0.67) return vec3(0.12);
  float local = (x - 0.67) / 0.33;
  if (local < 0.25) return vec3(0.035);
  if (local < 0.50) return vec3(0.075);
  if (local < 0.75) return vec3(0.115);
  return vec3(0.0);
}

vec3 ebuPattern(vec2 uv) {
  int bar = int(floor(clamp(uv.x, 0.0, 0.9999) * 8.0));
  if (bar == 0) return vec3(1.0);
  if (bar == 1) return vec3(1.0, 1.0, 0.0);
  if (bar == 2) return vec3(0.0, 1.0, 1.0);
  if (bar == 3) return vec3(0.0, 1.0, 0.0);
  if (bar == 4) return vec3(1.0, 0.0, 1.0);
  if (bar == 5) return vec3(1.0, 0.0, 0.0);
  if (bar == 6) return vec3(0.0, 0.0, 1.0);
  return vec3(0.0);
}

vec3 plugePattern(vec2 uv) {
  vec3 base = vec3(0.09);
  if (uv.y > 0.78) return vec3(0.18);
  if (uv.y < 0.16) return vec3(0.0);
  if (uv.x > 0.12 && uv.x < 0.28) base = vec3(0.0);
  if (uv.x > 0.32 && uv.x < 0.48) base = vec3(0.035);
  if (uv.x > 0.52 && uv.x < 0.68) base = vec3(0.075);
  if (uv.x > 0.72 && uv.x < 0.88) base = vec3(0.12);
  return base;
}

vec3 grayscalePattern(vec2 uv) {
  float continuous = uv.x;
  float stepped = floor(clamp(uv.x, 0.0, 0.9999) * 16.0) / 15.0;
  return vec3(uv.y > 0.5 ? continuous : stepped);
}

float thinLine(float d, float width) { return 1.0 - smoothstep(width, width * 1.7, abs(d)); }
vec3 crosshatchPattern(vec2 uv) {
  float gridX = thinLine(fract(uv.x * 16.0) - 0.5, 0.025);
  float gridY = thinLine(fract(uv.y * 12.0) - 0.5, 0.025);
  vec2 p = (uv - 0.5) * vec2(4.0 / 3.0, 1.0);
  float circle = thinLine(length(p) - 0.38, 0.004);
  float center = thinLine(p.x, 0.003) + thinLine(p.y, 0.003);
  float safeX = thinLine(abs(p.x) - 0.56, 0.004);
  float safeY = thinLine(abs(p.y) - 0.42, 0.004);
  float v = clamp(gridX + gridY + circle + center + safeX + safeY, 0.0, 1.0);
  return vec3(v);
}

vec3 multiburstPattern(vec2 uv) {
  float segment = floor(clamp(uv.x, 0.0, 0.9999) * 6.0);
  float localX = fract(uv.x * 6.0);
  float cycles = mix(1.0, 20.0, segment / 5.0);
  float wave = 0.5 + 0.5 * sin(localX * cycles * TAU);
  float gate = smoothstep(0.08, 0.12, uv.y) * (1.0 - smoothstep(0.88, 0.92, uv.y));
  float label = floor(segment + 1.0) / 6.0;
  return vec3(mix(label, wave, gate));
}

vec3 zonePlatePattern(vec2 uv) {
  vec2 p = (uv - 0.5) * vec2(1.333333, 1.0);
  float radial = 0.5 + 0.5 * sin(PI * 110.0 * dot(p, p));
  float horizontal = 0.5 + 0.5 * sin(PI * 90.0 * p.x * p.x);
  float vertical = 0.5 + 0.5 * sin(PI * 70.0 * p.y * p.y);
  return vec3(radial, mix(radial, horizontal, 0.35), mix(radial, vertical, 0.35));
}

vec3 monoscopePattern(vec2 uv) {
  vec2 p = (uv - 0.5) * vec2(1.333333, 1.0);
  float grid = max(thinLine(fract(uv.x * 20.0) - 0.5, 0.018), thinLine(fract(uv.y * 15.0) - 0.5, 0.018)) * 0.35;
  float circle = thinLine(length(p) - 0.38, 0.004);
  float outer = thinLine(length(p) - 0.47, 0.004);
  float cross = max(thinLine(p.x, 0.0025), thinLine(p.y, 0.0025));
  float wedge = step(0.72, 0.5 + 0.5 * sin((atan(p.y, p.x) + length(p) * 55.0) * 16.0));
  wedge *= smoothstep(0.05, 0.08, length(p)) * (1.0 - smoothstep(0.18, 0.23, length(p)));
  float v = clamp(grid + circle + outer + cross + wedge, 0.0, 1.0);
  return vec3(v);
}

vec3 colorCheckerPatch(int index) {
  if (index == 0) return vec3(0.45, 0.32, 0.27);
  if (index == 1) return vec3(0.76, 0.58, 0.50);
  if (index == 2) return vec3(0.36, 0.48, 0.62);
  if (index == 3) return vec3(0.36, 0.42, 0.25);
  if (index == 4) return vec3(0.52, 0.50, 0.70);
  if (index == 5) return vec3(0.39, 0.73, 0.67);
  if (index == 6) return vec3(0.86, 0.48, 0.18);
  if (index == 7) return vec3(0.29, 0.36, 0.67);
  if (index == 8) return vec3(0.76, 0.30, 0.36);
  if (index == 9) return vec3(0.37, 0.23, 0.43);
  if (index == 10) return vec3(0.63, 0.75, 0.22);
  if (index == 11) return vec3(0.91, 0.66, 0.12);
  if (index == 12) return vec3(0.15, 0.25, 0.55);
  if (index == 13) return vec3(0.22, 0.55, 0.25);
  if (index == 14) return vec3(0.68, 0.20, 0.22);
  if (index == 15) return vec3(0.95, 0.95, 0.92);
  if (index == 16) return vec3(0.72);
  if (index == 17) return vec3(0.50);
  if (index == 18) return vec3(0.32);
  if (index == 19) return vec3(0.18);
  if (index == 20) return vec3(0.08);
  return vec3(0.02);
}
vec3 colorCheckerPattern(vec2 uv) {
  vec2 border = vec2(0.06, 0.08);
  vec2 q = (uv - border) / (1.0 - border * 2.0);
  if (q.x < 0.0 || q.y < 0.0 || q.x > 1.0 || q.y > 1.0) return vec3(0.035);
  int col = int(floor(min(q.x, 0.999) * 6.0));
  int row = int(floor((1.0 - min(q.y, 0.999)) * 4.0));
  vec2 cell = fract(q * vec2(6.0, 4.0));
  float inset = step(0.035, cell.x) * step(0.035, cell.y) * step(cell.x, 0.965) * step(cell.y, 0.965);
  return mix(vec3(0.03), colorCheckerPatch(row * 6 + col), inset);
}

vec3 convergenceDotsPattern(vec2 uv) {
  vec2 grid = fract(uv * vec2(20.0, 15.0)) - 0.5;
  float d = length(grid);
  float dotValue = 1.0 - smoothstep(0.055, 0.11, d);
  float center = max(thinLine(uv.x - 0.5, 0.0015), thinLine(uv.y - 0.5, 0.0015));
  return vec3(clamp(dotValue + center, 0.0, 1.0));
}

vec3 testPattern(vec2 uv) {
  if (u_testPattern == 1) return ebuPattern(uv);
  if (u_testPattern == 2) return plugePattern(uv);
  if (u_testPattern == 3) return grayscalePattern(uv);
  if (u_testPattern == 4) return crosshatchPattern(uv);
  if (u_testPattern == 5) return multiburstPattern(uv);
  if (u_testPattern == 6) return zonePlatePattern(uv);
  if (u_testPattern == 7) return monoscopePattern(uv);
  if (u_testPattern == 8) return colorCheckerPattern(uv);
  if (u_testPattern == 9) return convergenceDotsPattern(uv);
  if (u_testPattern == 10) return vec3(1.0);
  if (u_testPattern == 11) return vec3(0.0);
  return smptePattern(uv);
}

vec3 sourceAt(vec2 uv) {
  if (u_sourceMode == 1) {
    float line = floor(uv.y * u_outputRes.y);
    float frame = float(u_frame);
    float n = hash21(vec2(floor(uv.x * u_outputRes.x), line + frame * 173.0));
    float n2 = hash21(vec2(line * 0.37 + frame, floor(uv.x * u_outputRes.x) * 0.19));
    return vec3(mix(n, n2, 0.25));
  }
  if (u_sourceMode == 2) return testPattern(uv);
  float valid;
  vec2 mapped = mapSourceUV(uv, valid);
  return texture(u_source, clamp(mapped, 0.0, 1.0)).rgb * valid;
}

vec2 distortedUV(vec2 uv) {
  float motion = u_reducedMotion ? 0.25 : 1.0;
  float line = floor(uv.y * u_outputRes.y);
  float framePhase = floor(u_time * 59.94);
  float lineNoise = hash21(vec2(line, framePhase));
  uv.x += (lineNoise * 2.0 - 1.0) * u_jitter * motion;

  float tearCenter = fract(u_time * 0.137 + hash11(floor(u_time * 0.45)));
  float tearWidth = mix(0.006, 0.075, u_horizontalTear);
  float tear = exp(-pow((uv.y - tearCenter) / max(tearWidth, 0.001), 2.0));
  float tearDirection = hash11(floor(u_time * 17.0)) * 2.0 - 1.0;
  uv.x += tear * tearDirection * u_horizontalTear * 0.14 * motion;

  if (u_signalType == 5) {
    float speedPenalty = float(u_vhsSpeed) * 0.35;
    float headBand = smoothstep(0.82, 0.99, uv.y);
    float trackingWave = sin(uv.y * 230.0 + u_time * (28.0 + speedPenalty * 18.0));
    uv.x += headBand * trackingWave * u_tracking * (0.018 + speedPenalty * 0.018) * motion;
    uv.y += headBand * (hash21(vec2(line, framePhase * 0.5)) - 0.5) * u_tracking * 0.008 * motion;
  }
  return uv;
}

vec3 processAnalog(vec2 uv) {
  vec2 px = 1.0 / max(u_outputRes, vec2(1.0));
  vec3 c0 = sourceAt(uv);
  vec3 cL1 = sourceAt(uv - vec2(px.x, 0.0));
  vec3 cR1 = sourceAt(uv + vec2(px.x, 0.0));
  vec3 cL2 = sourceAt(uv - vec2(px.x * 2.0, 0.0));
  vec3 cR2 = sourceAt(uv + vec2(px.x * 2.0, 0.0));
  vec3 cL4 = sourceAt(uv - vec2(px.x * 4.0, 0.0));
  vec3 cR4 = sourceAt(uv + vec2(px.x * 4.0, 0.0));

  vec3 y0 = rgb2yiq(c0);
  vec3 yL1 = rgb2yiq(cL1), yR1 = rgb2yiq(cR1);
  vec3 yL2 = rgb2yiq(cL2), yR2 = rgb2yiq(cR2);
  vec3 yL4 = rgb2yiq(cL4), yR4 = rgb2yiq(cR4);

  float typeLumaPenalty = 0.0;
  float typeChromaPenalty = 0.0;
  if (u_signalType == 1) { typeLumaPenalty = 0.04; typeChromaPenalty = 0.08; }
  if (u_signalType == 2) { typeLumaPenalty = 0.08; typeChromaPenalty = 0.22; }
  if (u_signalType == 3) { typeLumaPenalty = 0.18; typeChromaPenalty = 0.44; }
  if (u_signalType == 6) { typeLumaPenalty = 0.17; typeChromaPenalty = 0.40; }
  if (u_signalType == 4) { typeLumaPenalty = 0.32; typeChromaPenalty = 0.62; }
  if (u_signalType == 5) {
    float tape = float(u_vhsSpeed);
    typeLumaPenalty = 0.38 + tape * 0.12;
    typeChromaPenalty = 0.67 + tape * 0.09;
  }

  float effectiveLuma = clamp(u_lumaBandwidth * (1.0 - typeLumaPenalty), 0.02, 1.0);
  float effectiveChroma = clamp(u_chromaBandwidth * (1.0 - typeChromaPenalty), 0.01, 1.0);
  float lumaWide = (yL1.x + 2.0 * y0.x + yR1.x) * 0.25;
  float lumaSoft = (yL4.x + 2.0 * yL2.x + 4.0 * y0.x + 2.0 * yR2.x + yR4.x) * 0.1;
  float Y = mix(lumaSoft, mix(lumaWide, y0.x, effectiveLuma), effectiveLuma);

  float chromaShift = u_chromaDelay * px.x;
  vec3 delayed = rgb2yiq(sourceAt(uv + vec2(chromaShift, 0.0)));
  vec2 chromaNear = (yL1.yz + 2.0 * delayed.yz + yR1.yz) * 0.25;
  vec2 chromaSoft = (yL4.yz + 2.0 * yL2.yz + 4.0 * delayed.yz + 2.0 * yR2.yz + yR4.yz) * 0.1;
  vec2 IQ = mix(chromaSoft, chromaNear, effectiveChroma);
  IQ = mix(IQ, (yL2.yz + yR2.yz) * 0.5, u_chromaBleed * (1.0 - effectiveChroma) * 0.65);

  float phase = u_colorBurstPhase * TAU;
  IQ = mat2(cos(phase), -sin(phase), sin(phase), cos(phase)) * IQ;

  float edge = y0.x - (yL1.x + yR1.x) * 0.5;
  Y += edge * u_ringing * (0.65 + typeLumaPenalty * 1.4);

  bool compositeEncoded = u_signalType == 3 || u_signalType == 4 || u_signalType == 5 || u_signalType == 6;
  if (compositeEncoded) {
    float comb = u_combFilter == 0 ? 1.0 : (u_combFilter == 1 ? 0.52 : 0.22);
    float lineNumber = floor(uv.y * u_outputRes.y);
    bool pal = u_signalType == 6;
    float linePhase = lineNumber * PI;
    float subcarrier = pal ? 4.43361875 : 3.579545;
    float palV = pal && mod(lineNumber, 2.0) > 0.5 ? -1.0 : 1.0;
    vec2 encodedIQ = vec2(IQ.x, IQ.y * palV);
    float carrier = uv.x * u_outputRes.x * PI + linePhase + u_time * TAU * subcarrier + phase;
    float sub = sin(carrier);
    float quad = cos(carrier);
    float crawl = u_dotCrawl * comb;
    Y += (encodedIQ.x * sub + encodedIQ.y * quad) * crawl * (pal ? 0.19 : 0.24);
    IQ += vec2(edge * sub, edge * quad * palV) * crawl * (pal ? 0.11 : 0.15);
    if (pal) {
      // PAL's alternating V phase suppresses persistent hue error and Hanover-like chroma streaking.
      IQ.y = mix(IQ.y, (yL1.z + 2.0 * IQ.y + yR1.z) * 0.25, 0.12 + 0.18 * (u_combFilter > 0 ? 1.0 : 0.0));
    }
  }

  vec3 result = yiq2rgb(vec3(Y, IQ));

  if (u_ghosting > 0.0 || u_rfMultipath > 0.0) {
    vec3 ghostNear = sourceAt(uv - vec2(u_ghosting, 0.0));
    vec3 ghostFar = sourceAt(uv - vec2(0.015 + u_rfMultipath * 0.055, 0.0));
    result = mix(result, ghostNear, clamp(u_ghosting * 5.0, 0.0, 0.55));
    result += (ghostFar - 0.5) * u_rfMultipath * 0.22;
  }

  float framePhase = floor(u_time * 59.94);
  float line = floor(uv.y * u_outputRes.y);
  float whiteNoise = hash21(vec2(floor(uv.x * u_outputRes.x) + framePhase * 19.0, line + framePhase * 131.0)) - 0.5;
  float loss = 1.0 - u_signalStrength;
  float typeNoise = u_signalType == 4 ? 0.16 : (u_signalType == 5 ? 0.09 : 0.0);
  result += whiteNoise * (u_noise * 0.55 + loss * 0.75 + typeNoise);
  result = mix(vec3(dot(result, vec3(0.299, 0.587, 0.114))), result, clamp(u_signalStrength * 1.2, 0.0, 1.0));

  if (u_humBar > 0.0) {
    float hum = 0.5 + 0.5 * sin((uv.y * 2.0 - u_time * 0.9) * TAU);
    float bar = pow(hum, 8.0) - 0.14;
    result += bar * u_humBar * 0.22;
  }

  if (u_agcPumping > 0.0) {
    float pump = 1.0 + sin(u_time * 1.73 + valueNoise(vec2(floor(u_time * 0.5), 1.0)) * TAU) * u_agcPumping * 0.25;
    result = (result - 0.5) * pump + 0.5;
  }

  if (u_signalType == 5) {
    float tapePenalty = 1.0 + float(u_vhsSpeed) * 0.65;
    float lineSeed = hash21(vec2(line * 0.071, floor(u_time * 29.97)));
    float streakSeed = hash21(vec2(floor(line / 3.0), floor(u_time * 8.0)));
    float dropoutGate = step(1.0 - u_dropout * 0.14 * tapePenalty, streakSeed);
    float streak = dropoutGate * smoothstep(0.05, 0.0, abs(fract(uv.x * (2.0 + lineSeed * 9.0) + lineSeed) - 0.5));
    result = mix(result, vec3(0.75 + whiteNoise * 0.25), streak * u_dropout);
    float headSwitch = smoothstep(0.89, 0.995, uv.y) * u_tracking;
    result += (hash21(vec2(floor(uv.x * u_outputRes.x * 0.35), framePhase)) - 0.5) * headSwitch * 0.65;
    result *= 1.0 - headSwitch * 0.22;
  }

  return result;
}

void main() {
  vec3 raw = sourceAt(v_uv);
  vec2 signalUV = distortedUV(v_uv);
  vec3 signal = processAnalog(signalUV);

  vec3 previous = texture(u_previous, v_uv).rgb;
  vec3 tau = max(vec3(u_phosphorDecayR, u_phosphorDecayG, u_phosphorDecayB) * 0.001, vec3(0.001));
  vec3 decay = exp(-vec3(max(u_delta, 0.0001)) / tau);
  vec3 history = previous * decay;

  float beamHit = 1.0;
  if (u_beamScan) {
    float beamY = 1.0 - fract(u_time * 59.94);
    float wrappedDistance = min(abs(v_uv.y - beamY), 1.0 - abs(v_uv.y - beamY));
    float width = max((u_beamWidth * 7.0) / max(u_outputRes.y, 1.0), 0.001);
    beamHit = exp(-pow(wrappedDistance / width, 2.0));
  }

  vec3 refreshed = mix(history, max(history, signal), beamHit);
  vec3 persistent = mix(signal, max(signal, refreshed), u_persistenceStrength);
  if (u_sourceMode == 1) persistent = signal;

  outProcessed = vec4(max(persistent, vec3(0.0)), 1.0);
  outRaw = vec4(clamp(raw, 0.0, 1.0), 1.0);
}`;
