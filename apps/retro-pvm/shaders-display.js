export const DISPLAY_FRAGMENT_SHADER = `#version 300 es
precision highp float;
precision highp int;

in vec2 v_uv;
out vec4 outColor;

uniform sampler2D u_processed;
uniform sampler2D u_raw;
uniform vec2 u_resolution;
uniform float u_time;
uniform float u_delta;
uniform int u_frame;
uniform bool u_power;
uniform float u_powerAge;
uniform bool u_degauss;
uniform float u_degaussAge;
uniform bool u_bypass;
uniform int u_compareMode;
uniform float u_comparePosition;
uniform bool u_reducedMotion;

uniform float u_brightness;
uniform float u_contrast;
uniform float u_saturation;
uniform float u_hue;
uniform float u_gamma;
uniform float u_blackLevel;
uniform float u_whiteLevel;
uniform float u_temperature;
uniform float u_sharpness;
uniform float u_bloom;
uniform float u_halation;
uniform float u_vignette;
uniform float u_scanlineStrength;
uniform float u_scanlineSharpness;
uniform float u_resolutionLines;
uniform bool u_interlace;
uniform int u_fieldOrder;
uniform int u_maskType;
uniform float u_maskStrength;
uniform float u_maskScale;
uniform float u_moire;

uniform float u_curvatureX;
uniform float u_curvatureY;
uniform float u_overscanX;
uniform float u_overscanY;
uniform float u_hSize;
uniform float u_vSize;
uniform float u_hPosition;
uniform float u_vPosition;
uniform float u_rasterRotation;
uniform float u_pincushion;
uniform float u_trapezoid;
uniform float u_cornerPin;
uniform float u_hLinearity;
uniform float u_vLinearity;

uniform int u_phosphorType;
uniform float u_beamWidth;
uniform float u_beamBloom;
uniform float u_focusCenter;
uniform float u_focusEdge;
uniform float u_convergenceRX;
uniform float u_convergenceRY;
uniform float u_convergenceBX;
uniform float u_convergenceBY;
uniform float u_cornerConvergence;
uniform float u_tubeAge;
uniform float u_burnIn;
uniform float u_weakRed;
uniform float u_weakGreen;
uniform float u_weakBlue;

const float PI = 3.14159265358979323846;
const float TAU = 6.28318530717958647692;

vec2 rotate2(vec2 p, float angle) {
  float s = sin(angle), c = cos(angle);
  return mat2(c, -s, s, c) * p;
}
float luminance(vec3 c) { return dot(c, vec3(0.2126, 0.7152, 0.0722)); }
vec3 rgb2hsv(vec3 c) {
  vec4 K = vec4(0.0, -1.0 / 3.0, 2.0 / 3.0, -1.0);
  vec4 p = mix(vec4(c.bg, K.wz), vec4(c.gb, K.xy), step(c.b, c.g));
  vec4 q = mix(vec4(p.xyw, c.r), vec4(c.r, p.yzx), step(p.x, c.r));
  float d = q.x - min(q.w, q.y);
  float e = 1.0e-10;
  return vec3(abs(q.z + (q.w - q.y) / (6.0 * d + e)), d / (q.x + e), q.x);
}
vec3 hsv2rgb(vec3 c) {
  vec4 K = vec4(1.0, 2.0 / 3.0, 1.0 / 3.0, 3.0);
  vec3 p = abs(fract(c.xxx + K.xyz) * 6.0 - K.www);
  return c.z * mix(K.xxx, clamp(p - K.xxx, 0.0, 1.0), c.y);
}

vec3 temperatureScale(float kelvin) {
  float t = clamp((kelvin - 2500.0) / 8500.0, 0.0, 1.0);
  vec3 warm = vec3(1.18, 0.91, 0.68);
  vec3 neutral = vec3(1.0);
  vec3 cool = vec3(0.84, 0.95, 1.18);
  return t < 0.47 ? mix(warm, neutral, t / 0.47) : mix(neutral, cool, (t - 0.47) / 0.53);
}

vec2 geometryUV(vec2 uv, out float inside, out float radius2) {
  vec2 p = uv * 2.0 - 1.0;
  p = rotate2(p, radians(u_rasterRotation));
  p -= vec2(u_hPosition, -u_vPosition) * 2.0;
  p /= max(vec2(u_hSize * (1.0 + u_overscanX), u_vSize * (1.0 + u_overscanY)), vec2(0.05));

  p.x += u_hLinearity * p.x * (1.0 - p.x * p.x) * 0.34;
  p.y += u_vLinearity * p.y * (1.0 - p.y * p.y) * 0.34;
  p.x *= 1.0 + u_trapezoid * p.y * 0.35;
  p.x *= 1.0 + u_pincushion * p.y * p.y * 0.42;
  p.y *= 1.0 + u_pincushion * p.x * p.x * 0.18;
  p *= 1.0 + u_cornerPin * abs(p.x * p.y) * 0.42;

  p.x *= 1.0 + u_curvatureX * p.y * p.y;
  p.y *= 1.0 + u_curvatureY * p.x * p.x;

  if (u_degauss) {
    float t = clamp(u_degaussAge / 1.15, 0.0, 1.0);
    float envelope = pow(1.0 - t, 2.6);
    float motion = u_reducedMotion ? 0.25 : 1.0;
    float wobble = sin(t * TAU * 6.0) * envelope * 0.09 * motion;
    p += vec2(sin(p.y * 11.0 + u_time * 3.0), cos(p.x * 9.0 - u_time * 2.6)) * wobble;
    p = rotate2(p, wobble * 0.55);
  }

  radius2 = dot(p, p);
  inside = step(abs(p.x), 1.0) * step(abs(p.y), 1.0);
  return p * 0.5 + 0.5;
}

vec3 sampleFocused(vec2 uv, float focusPixels) {
  vec2 px = 1.0 / max(u_resolution, vec2(1.0));
  vec2 r = px * focusPixels;
  vec3 c = texture(u_processed, uv).rgb * 0.42;
  c += texture(u_processed, uv + vec2(r.x, 0.0)).rgb * 0.145;
  c += texture(u_processed, uv - vec2(r.x, 0.0)).rgb * 0.145;
  c += texture(u_processed, uv + vec2(0.0, r.y)).rgb * 0.145;
  c += texture(u_processed, uv - vec2(0.0, r.y)).rgb * 0.145;
  return c;
}

vec3 applyMask(vec3 color, vec2 uv, float scanPhase) {
  if (u_maskType == 0 || u_maskStrength <= 0.0001) return color;
  float pitch = max(u_maskScale, 0.05);
  vec2 pixel = uv * u_resolution / pitch;
  vec3 mask = vec3(1.0);

  if (u_maskType == 1) {
    float triad = mod(floor(pixel.x), 3.0);
    mask = triad < 1.0 ? vec3(1.28, 0.70, 0.70) : (triad < 2.0 ? vec3(0.70, 1.28, 0.70) : vec3(0.70, 0.70, 1.28));
    float wire = 1.0 - 0.12 * step(0.985, fract(pixel.y / 96.0));
    mask *= wire;
  } else if (u_maskType == 2) {
    vec2 cell = fract(pixel / vec2(3.0, 2.0));
    float rowShift = mod(floor(pixel.y / 2.0), 2.0) * 0.5;
    float triad = mod(floor(pixel.x + rowShift), 3.0);
    float dotShape = smoothstep(0.62, 0.18, length(cell - 0.5));
    vec3 triadColor = triad < 1.0 ? vec3(1.32, .62, .62) : (triad < 2.0 ? vec3(.62, 1.32, .62) : vec3(.62, .62, 1.32));
    mask = mix(vec3(.58), triadColor, dotShape);
  } else if (u_maskType == 3) {
    vec2 cell = fract(pixel / vec2(3.0, 2.0));
    float triad = mod(floor(pixel.x), 3.0);
    float slot = smoothstep(.48, .2, abs(cell.x - .5)) * smoothstep(.46, .15, abs(cell.y - .5));
    vec3 triadColor = triad < 1.0 ? vec3(1.35, .6, .6) : (triad < 2.0 ? vec3(.6, 1.35, .6) : vec3(.6, .6, 1.35));
    mask = mix(vec3(.54), triadColor, slot);
  } else {
    vec2 cell = fract(pixel / vec2(3.0, 3.0));
    float triad = mod(floor(pixel.x), 3.0);
    float dotShape = smoothstep(.42, .12, length(cell - .5));
    vec3 triadColor = triad < 1.0 ? vec3(1.4, .55, .55) : (triad < 2.0 ? vec3(.55, 1.4, .55) : vec3(.55, .55, 1.4));
    mask = mix(vec3(.5), triadColor, dotShape);
  }

  float moireMod = 1.0 - u_moire * 0.18 * sin((pixel.x * 0.37 + pixel.y * 0.23 + scanPhase) * TAU);
  return color * mix(vec3(1.0), mask * moireMod, u_maskStrength);
}

vec3 phosphorColor(vec3 color) {
  float y = luminance(color);
  if (u_phosphorType == 1) return vec3(0.045, 1.0, 0.18) * y * 1.18;
  if (u_phosphorType == 2) return vec3(1.0, 0.48, 0.045) * y * 1.24;
  if (u_phosphorType == 3) return vec3(1.0, 0.98, 0.88) * y * 1.06;
  if (u_phosphorType == 4) return vec3(0.72, 0.88, 1.0) * y * 1.1;
  return color;
}

float burnPattern(vec2 uv) {
  vec2 p = uv - 0.5;
  float centerLogo = exp(-dot(p / vec2(.24, .075), p / vec2(.24, .075)) * 3.0) * 0.38;
  float scoreA = smoothstep(.006, 0.0, abs(uv.y - .10)) * smoothstep(.16, .02, abs(uv.x - .16));
  float scoreB = smoothstep(.006, 0.0, abs(uv.y - .10)) * smoothstep(.16, .02, abs(uv.x - .84));
  float fourThree = smoothstep(.006, 0.0, abs(abs(uv.x - .5) - .38)) * step(abs(uv.y - .5), .42);
  return clamp(centerLogo + scoreA + scoreB + fourThree * .28, 0.0, 1.0);
}

void main() {
  float inside, radius2;
  vec2 uv = geometryUV(v_uv, inside, radius2);

  float edgeFactor = smoothstep(0.0, 1.55, radius2);
  vec2 px = 1.0 / max(u_resolution, vec2(1.0));
  float cornerShift = u_cornerConvergence * edgeFactor;
  vec2 rShift = vec2(u_convergenceRX, -u_convergenceRY) * px + normalize((uv - 0.5) + vec2(0.0001)) * cornerShift * px;
  vec2 bShift = vec2(u_convergenceBX, -u_convergenceBY) * px - normalize((uv - 0.5) + vec2(0.0001)) * cornerShift * px;

  float focus = u_focusCenter + u_focusEdge * edgeFactor;
  vec3 center = sampleFocused(uv, focus);
  center.r = sampleFocused(uv + rShift, focus).r;
  center.b = sampleFocused(uv + bShift, focus).b;

  vec3 neighbors = (
    texture(u_processed, uv + vec2(px.x, 0.0)).rgb +
    texture(u_processed, uv - vec2(px.x, 0.0)).rgb +
    texture(u_processed, uv + vec2(0.0, px.y)).rgb +
    texture(u_processed, uv - vec2(0.0, px.y)).rgb
  ) * 0.25;
  vec3 color = center + (center - neighbors) * u_sharpness * 1.4;

  float localLuma = luminance(max(color, vec3(0.0)));
  float bloomRadius = (1.0 + localLuma * u_beamBloom * 3.0 + u_beamWidth * .25);
  vec2 br = px * bloomRadius * 3.0;
  vec3 bloomColor = (
    texture(u_processed, uv + vec2(br.x, 0.0)).rgb +
    texture(u_processed, uv - vec2(br.x, 0.0)).rgb +
    texture(u_processed, uv + vec2(0.0, br.y)).rgb +
    texture(u_processed, uv - vec2(0.0, br.y)).rgb
  ) * 0.25;
  color += max(bloomColor - 0.42, vec3(0.0)) * u_bloom * 1.55;

  vec2 hr = px * (5.0 + u_halation * 12.0);
  vec3 halo = (
    texture(u_processed, uv + vec2(hr.x, hr.y)).rgb +
    texture(u_processed, uv + vec2(-hr.x, hr.y)).rgb +
    texture(u_processed, uv + vec2(hr.x, -hr.y)).rgb +
    texture(u_processed, uv - vec2(hr.x, hr.y)).rgb
  ) * 0.25;
  color += vec3(1.0, .28, .08) * max(luminance(halo) - .55, 0.0) * u_halation * .62;

  float rasterLines = u_resolutionLines > 1.0 ? u_resolutionLines : min(u_resolution.y, 1080.0);
  float fieldOffset = 0.0;
  if (u_interlace) fieldOffset = mod(float(u_frame + u_fieldOrder), 2.0) * 0.5;
  float scanPhase = uv.y * rasterLines + fieldOffset;
  float lineDistance = abs(fract(scanPhase) - 0.5) * 2.0;
  float beam = exp(-pow(lineDistance * max(u_scanlineSharpness, 0.05), 2.0) * 3.2);
  float scanMask = mix(1.0, mix(1.0 - u_scanlineStrength, 1.0, beam), u_scanlineStrength);
  if (u_interlace) {
    float inactive = step(0.5, mod(floor(uv.y * rasterLines) + float(u_frame + u_fieldOrder), 2.0));
    scanMask *= mix(1.0, 0.62, inactive * u_scanlineStrength);
  }
  color *= scanMask;
  color = applyMask(color, uv, scanPhase);

  color = phosphorColor(max(color, vec3(0.0)));
  vec3 hsv = rgb2hsv(max(color, vec3(0.0)));
  hsv.x = fract(hsv.x + u_hue);
  hsv.y = clamp(hsv.y * u_saturation, 0.0, 2.0);
  color = hsv2rgb(hsv);
  color *= temperatureScale(u_temperature);

  float age = clamp(u_tubeAge, 0.0, 1.0);
  color = mix(color, vec3(luminance(color)) * vec3(1.03, .94, .82), age * .28);
  color *= mix(1.0, .67, age);
  color.r *= 1.0 - u_weakRed * .82;
  color.g *= 1.0 - u_weakGreen * .82;
  color.b *= 1.0 - u_weakBlue * .82;

  color = (color + u_blackLevel - 0.5) * u_contrast + 0.5;
  color *= u_brightness;
  color = clamp(color / max(u_whiteLevel, .001), 0.0, 4.0);
  color = pow(max(color, vec3(0.0)), vec3(1.0 / max(u_gamma, .01)));

  float vignetteShape = max(0.0, 1.0 - pow(clamp(radius2 * .52, 0.0, 1.5), 1.4));
  color *= mix(1.0, vignetteShape, u_vignette);
  float burn = burnPattern(uv) * u_burnIn;
  color *= 1.0 - burn * .35;
  color += vec3(.025, .055, .03) * burn;

  vec3 raw = texture(u_raw, clamp(uv, 0.0, 1.0)).rgb;
  if (u_bypass) color = raw;
  else if (u_compareMode == 1 && v_uv.x < u_comparePosition) color = raw;
  else if (u_compareMode == 2) color = abs(color - raw) * 3.0;

  color *= inside;

  if (u_power) {
    float warm = smoothstep(0.0, 1.7, u_powerAge);
    float verticalOpen = smoothstep(0.0, 0.42, u_powerAge);
    float aperture = smoothstep(0.006, 0.02, verticalOpen - abs(v_uv.y - 0.5));
    color *= warm * aperture;
    float lineFlash = exp(-abs(v_uv.y - 0.5) * 220.0) * (1.0 - smoothstep(0.08, .42, u_powerAge));
    float dotFlash = exp(-length(v_uv - .5) * 120.0) * (1.0 - smoothstep(0.0, .22, u_powerAge));
    color += vec3(lineFlash * 2.0 + dotFlash * 3.0);
  } else {
    float collapse = smoothstep(0.0, .22, u_powerAge);
    float lineWidth = mix(.5, .003, collapse);
    float line = exp(-abs(v_uv.y - .5) / max(lineWidth, .0005));
    color *= line * (1.0 - smoothstep(.12, .3, u_powerAge));
    float flash = exp(-abs(v_uv.y - .5) * 260.0) * smoothstep(.10, .2, u_powerAge) * (1.0 - smoothstep(.28, .46, u_powerAge));
    float dot = exp(-length(v_uv - .5) * 150.0) * smoothstep(.34, .43, u_powerAge) * (1.0 - smoothstep(.52, .78, u_powerAge));
    color += vec3(flash * 2.3 + dot * 4.0);
  }

  outColor = vec4(max(color, vec3(0.0)), 1.0);
}`;
