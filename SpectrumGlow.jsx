/* SpectrumGlow — light-theme glowing orb + drifting colour fields (raw WebGL2, no deps).
   The orb lazily follows the cursor inside the section, smears along its motion,
   and a click sends out a pulse ring. Palettes slowly cycle between "states". No sound. */
const { useEffect, useRef } = React;

const SG_PALETTES = [
  { base: '#F0F1F6', c0: '#2132CE', c1: '#0DD6DD', c2: '#8E9BFC' },
  { base: '#F0F1F6', c0: '#4E5FF2', c1: '#6FE3E8', c2: '#D6A8F2' },
  { base: '#F0F1F6', c0: '#1A2BA8', c1: '#16B9CB', c2: '#B9C7FF' }
];

const SG_VERT = `#version 300 es
in vec2 aPos;
void main() { gl_Position = vec4(aPos, 0.0, 1.0); }`;

const SG_FRAG = `#version 300 es
precision highp float;
out vec4 outColor;
uniform vec2 uRes;
uniform float uTime;
uniform vec2 uOrb;
uniform vec2 uVel;
uniform vec3 uPulse[4];
uniform vec3 uBase, uC0, uC1, uC2;
uniform float uMix;
uniform float uSwell;

float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), u.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), u.x), u.y);
}
float fbm(vec2 p) {
  float v = 0.0, a = 0.5;
  for (int i = 0; i < 5; i++) { v += a * noise(p); p = p * 2.03 + 17.1; a *= 0.5; }
  return v;
}

void main() {
  vec2 uv = gl_FragCoord.xy / uRes;
  vec2 p = (gl_FragCoord.xy - 0.5 * uRes) / uRes.y;
  float t = uTime;

  // Drifting colour fields, warped by slow noise
  vec2 w = vec2(fbm(p * 1.4 + vec2(0.0, t * 0.06)), fbm(p * 1.4 + vec2(5.2, -t * 0.05)));
  vec2 q = p + (w - 0.5) * 0.55;
  vec3 col = uBase;
  float asp = uRes.x / uRes.y;
  vec2 b0 = vec2(sin(t * 0.11) * 0.45 * asp, cos(t * 0.09) * 0.30);
  vec2 b1 = vec2(cos(t * 0.07 + 2.0) * 0.50 * asp, sin(t * 0.10 + 1.0) * 0.35);
  vec2 b2 = vec2(sin(t * 0.05 + 4.0) * 0.40 * asp, cos(t * 0.08 + 3.0) * 0.40);
  col = mix(col, uC2, exp(-dot(q - b2, q - b2) * 2.2) * 0.55);
  col = mix(col, uC1, exp(-dot(q - b1, q - b1) * 3.0) * 0.45);
  col = mix(col, uC0, exp(-dot(q - b0, q - b0) * 4.0) * 0.30);

  // Soft light beams through the orb
  vec2 d = p - uOrb;
  float ang = atan(d.y, d.x);
  float beams = pow(0.5 + 0.5 * sin(ang * 2.0 + t * 0.15 + fbm(vec2(ang * 2.0, t * 0.1)) * 2.0), 3.0);
  col = mix(col, uC1, beams * exp(-length(d) * 2.2) * 0.22);

  // Orb, stretched behind its motion like a comet
  float speed = clamp(length(uVel) * 1.6, 0.0, 1.6);
  vec2 dir = length(uVel) > 1e-5 ? normalize(uVel) : vec2(1.0, 0.0);
  float a = dot(d, dir);
  vec2 perp = d - a * dir;
  if (a < 0.0) a /= (1.0 + speed * 2.2);
  float r = length(perp + a * dir);
  float R = 0.13 * (1.0 + uSwell);

  vec3 haloCol = mix(uC1, uC0, 0.35);
  col = mix(col, haloCol, exp(-r * r * 9.0) * 0.55);
  col = mix(col, mix(uC1, vec3(1.0), 0.35), exp(-r * r * 40.0) * 0.6);

  float disc = smoothstep(R, R * 0.9, r);
  if (disc > 0.0) {
    vec2 s = (perp + a * dir) / R;
    float nz = sqrt(max(1.0 - dot(s, s), 0.0));
    vec3 n = vec3(s, nz);
    vec3 L = normalize(vec3(cos(t * 0.2) * 0.8, sin(t * 0.17) * 0.6 + 0.3, 0.7));
    float diff = max(dot(n, L), 0.0);
    float spec = pow(max(dot(reflect(-L, n), vec3(0.0, 0.0, 1.0)), 0.0), 28.0);
    float fres = pow(1.0 - nz, 2.0);
    vec3 orb = mix(uC1, vec3(1.0), diff * 0.85);
    orb = mix(orb, uC0, fres * 0.55);
    orb += spec * 0.6;
    col = mix(col, orb, disc);
  }

  // Click pulses
  for (int i = 0; i < 4; i++) {
    vec3 pu = uPulse[i];
    if (pu.z < 0.0) continue;
    float life = pu.z / 1.8;
    if (life > 1.0) continue;
    float rr = 0.13 + life * 0.95;
    float r0 = length(p - pu.xy);
    float ring = exp(-pow((r0 - rr) * 10.0, 2.0)) * pow(1.0 - life, 2.0);
    col = mix(col, mix(uC1, uC0, life), ring * 0.65);
  }

  // Fade into the page at the bottom edge, overall strength, dither
  col = mix(uBase, col, smoothstep(0.0, 0.22, uv.y) * uMix);
  col += (hash(gl_FragCoord.xy + t) - 0.5) / 255.0;
  outColor = vec4(col, 1.0);
}`;

function sgHex(h) {
  const n = parseInt(h.slice(1), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

function SpectrumGlow(props) {
  const { intensity = 1, resolution = 0.5, stateSeconds = 18, style = {} } = props;
  const mountRef = useRef(null);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;
    const canvas = document.createElement('canvas');
    canvas.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;display:block;';
    mount.appendChild(canvas);
    const gl = canvas.getContext('webgl2', { antialias: false, alpha: false, premultipliedAlpha: false });
    if (!gl) { canvas.remove(); return; }

    const compile = (type, src) => {
      const s = gl.createShader(type);
      gl.shaderSource(s, src);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) { console.warn(gl.getShaderInfoLog(s)); return null; }
      return s;
    };
    const vs = compile(gl.VERTEX_SHADER, SG_VERT);
    const fs = compile(gl.FRAGMENT_SHADER, SG_FRAG);
    if (!vs || !fs) { canvas.remove(); return; }
    const prog = gl.createProgram();
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) { canvas.remove(); return; }
    gl.useProgram(prog);

    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(prog, 'aPos');
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);

    const U = {};
    ['uRes', 'uTime', 'uOrb', 'uVel', 'uPulse', 'uBase', 'uC0', 'uC1', 'uC2', 'uMix', 'uSwell']
      .forEach(n => { U[n] = gl.getUniformLocation(prog, n); });

    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const pal = SG_PALETTES.map(p => ({ base: sgHex(p.base), c0: sgHex(p.c0), c1: sgHex(p.c1), c2: sgHex(p.c2) }));

    let W = 1, H = 1;
    const resize = () => {
      const r = mount.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      W = Math.max(1, Math.round(r.width * dpr * resolution));
      H = Math.max(1, Math.round(r.height * dpr * resolution));
      canvas.width = W; canvas.height = H;
      gl.viewport(0, 0, W, H);
    };
    resize();

    // Orb physics in shader space: x in [-asp/2, asp/2], y in [-0.5, 0.5], y up
    const pos = { x: 0.18, y: 0 }, vel = { x: 0, y: 0 };
    let pointer = null;
    const pulses = [];
    let swell = 0;

    const toShader = (cx, cy) => {
      const r = mount.getBoundingClientRect();
      if (cx < r.left || cx > r.right || cy < r.top || cy > r.bottom) return null;
      return { x: (cx - r.left - r.width / 2) / r.height, y: -(cy - r.top - r.height / 2) / r.height };
    };
    const onMove = e => { pointer = toShader(e.clientX, e.clientY); };
    const onLeave = () => { pointer = null; };
    const onDown = e => {
      if (e.button !== 0) return;
      if (e.target && e.target.closest && e.target.closest('a,button,input,textarea,select,label')) return;
      if (!toShader(e.clientX, e.clientY)) return;
      pulses.push({ x: pos.x, y: pos.y, start: performance.now() });
      if (pulses.length > 4) pulses.shift();
      swell = 0.35;
    };
    window.addEventListener('pointermove', onMove, { passive: true });
    window.addEventListener('pointerdown', onDown, { passive: true });
    document.addEventListener('pointerleave', onLeave);

    const t0 = performance.now();
    let raf = null, running = false, last = t0;

    const lerp3 = (a, b, k) => [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];

    const frame = now => {
      const t = reduced ? 4 : (now - t0) / 1000;
      const dt = Math.min(0.05, (now - last) / 1000) || 0.016;
      last = now;
      const asp = W / H;

      const restX = 0.18 * Math.min(asp, 2) + Math.sin(t * 0.3) * 0.04;
      const restY = Math.cos(t * 0.23) * 0.04;
      const tx = pointer ? restX + (pointer.x - restX) * 0.45 : restX;
      const ty = pointer ? restY + (pointer.y - restY) * 0.45 : restY;
      vel.x += (tx - pos.x) * 9 * dt; vel.y += (ty - pos.y) * 9 * dt;
      const damp = Math.pow(0.04, dt);
      vel.x *= damp; vel.y *= damp;
      pos.x += vel.x * dt * 6; pos.y += vel.y * dt * 6;
      swell *= Math.pow(0.02, dt);

      // Palette state cycling with a 4s crossfade
      const seg = t / stateSeconds;
      const i0 = Math.floor(seg) % pal.length, i1 = (i0 + 1) % pal.length;
      const f = seg - Math.floor(seg);
      const k = f < 1 - 4 / stateSeconds ? 0 : (f - (1 - 4 / stateSeconds)) / (4 / stateSeconds);
      const kk = k * k * (3 - 2 * k);
      const A = pal[i0], B = pal[i1];

      gl.uniform2f(U.uRes, W, H);
      gl.uniform1f(U.uTime, t);
      gl.uniform2f(U.uOrb, pos.x, pos.y);
      gl.uniform2f(U.uVel, vel.x, vel.y);
      const pu = new Float32Array(12);
      for (let i = 0; i < 4; i++) {
        const p = pulses[i];
        pu[i * 3] = p ? p.x : 0; pu[i * 3 + 1] = p ? p.y : 0;
        pu[i * 3 + 2] = p ? (now - p.start) / 1000 : -1;
      }
      gl.uniform3fv(U.uPulse, pu);
      gl.uniform3fv(U.uBase, lerp3(A.base, B.base, kk));
      gl.uniform3fv(U.uC0, lerp3(A.c0, B.c0, kk));
      gl.uniform3fv(U.uC1, lerp3(A.c1, B.c1, kk));
      gl.uniform3fv(U.uC2, lerp3(A.c2, B.c2, kk));
      gl.uniform1f(U.uMix, intensity);
      gl.uniform1f(U.uSwell, swell);
      gl.drawArrays(gl.TRIANGLES, 0, 3);

      if (running && !reduced) raf = requestAnimationFrame(frame);
    };

    const start = () => { if (running) return; running = true; last = performance.now(); raf = requestAnimationFrame(frame); };
    const stop = () => { running = false; if (raf) cancelAnimationFrame(raf); raf = null; };

    let visible = true;
    const io = new IntersectionObserver(es => {
      visible = es[0].isIntersecting;
      if (visible && !document.hidden) start(); else stop();
    }, { threshold: 0.02 });
    io.observe(mount);
    const onVis = () => { if (document.hidden) stop(); else if (visible) start(); };
    document.addEventListener('visibilitychange', onVis);
    const ro = new ResizeObserver(() => { resize(); if (!running) frame(performance.now()); });
    ro.observe(mount);
    start();

    return () => {
      stop();
      io.disconnect();
      ro.disconnect();
      document.removeEventListener('visibilitychange', onVis);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerdown', onDown);
      document.removeEventListener('pointerleave', onLeave);
      const lose = gl.getExtension('WEBGL_lose_context');
      if (lose) lose.loseContext();
      canvas.remove();
    };
  }, [intensity, resolution, stateSeconds]);

  return React.createElement('div', {
    ref: mountRef,
    'aria-hidden': 'true',
    style: Object.assign({ width: '100%', height: '100%', position: 'relative', overflow: 'hidden', pointerEvents: 'none' }, style)
  });
}

window.SpectrumGlow = SpectrumGlow;
if (typeof module !== 'undefined') module.exports = { SpectrumGlow, default: SpectrumGlow };
