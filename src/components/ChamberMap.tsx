import { useEffect, useRef } from 'react';
import { LAND_DOTS_B64 } from '../data/landDots';

/**
 * The hero centrepiece: the UN emblem's world map (azimuthal equidistant,
 * centred on the North Pole) rebuilt as ~2,500 WebGL points, with the emblem's
 * graticule and, in place of the olive wreath, the fifteen founding seats.
 * Claimed seats light up from live data.
 *
 * Scroll choreography writes into `mapMotion`; the render loop reads it.
 */

export const mapMotion = {
  tilt: 0,      // 0 = facing the viewer, 1 = lying flat like a chamber floor
  drift: 0,     // 0 = composed beside the headline, 1 = centred under the viewer
  fade: 1,      // overall opacity multiplier
  introAt: Infinity as number, // performance.now() when the map should start assembling
};

const SEATS = 15;
const KIND_LAND = 0, KIND_GRID = 1, KIND_SEAT = 2;

function decodeLand(): Float32Array {
  const bin = atob(LAND_DOTS_B64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  const ints = new Int16Array(bytes.buffer);
  const out = new Float32Array(ints.length);
  // data is y-down; flip to y-up for GL
  for (let i = 0; i < ints.length; i += 2) {
    out[i] = ints[i] / 32000;
    out[i + 1] = -ints[i + 1] / 32000;
  }
  return out;
}

/* Per vertex: x, y, kind, seed, seatIndex */
function buildGeometry(): { data: Float32Array; count: number } {
  const verts: number[] = [];
  const land = decodeLand();
  for (let i = 0; i < land.length; i += 2) verts.push(land[i], land[i + 1], KIND_LAND, Math.random(), -1);

  // Emblem graticule: concentric rings + eight meridians, drawn as dotted lines.
  const pitch = 0.024;
  for (const r of [0.2, 0.4, 0.6, 0.8, 1.0]) {
    const n = Math.round((Math.PI * 2 * r) / pitch);
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      verts.push(Math.sin(a) * r, Math.cos(a) * r, KIND_GRID, Math.random(), -1);
    }
  }
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * Math.PI * 2;
    for (let r = 0.2 + pitch; r < 1.0; r += pitch) verts.push(Math.sin(a) * r, Math.cos(a) * r, KIND_GRID, Math.random(), -1);
  }

  // The fifteen seats sit where the olive wreath does: a horseshoe open at the top.
  const from = (40 / 180) * Math.PI, to = (320 / 180) * Math.PI, R = 1.16;
  for (let i = 0; i < SEATS; i++) {
    const a = from + (i / (SEATS - 1)) * (to - from);
    verts.push(Math.sin(a) * R, Math.cos(a) * R, KIND_SEAT, Math.random(), i);
  }
  return { data: new Float32Array(verts), count: verts.length / 5 };
}

const VERT = `
precision highp float;
attribute vec2 a_pos;
attribute float a_kind;
attribute float a_seed;
attribute float a_seat;

uniform vec2  u_res;      // drawing buffer size, px
uniform vec2  u_center;   // map centre offset from screen centre, px (y up)
uniform float u_R;        // map radius, px
uniform float u_dpr;
uniform float u_time;
uniform float u_intro;    // 0..1 assembly
uniform float u_tilt;     // radians around X
uniform vec2  u_look;     // cursor parallax, radians
uniform vec2  u_mouse;    // cursor, px from screen centre (y up)
uniform float u_claimed;

varying float v_bright;
varying float v_alpha;
varying float v_kind;
varying float v_hollow;

mat3 rotX(float a){ float c=cos(a), s=sin(a); return mat3(1.,0.,0., 0.,c,s, 0.,-s,c); }
mat3 rotY(float a){ float c=cos(a), s=sin(a); return mat3(c,0.,-s, 0.,1.,0., s,0.,c); }
mat3 rotZ(float a){ float c=cos(a), s=sin(a); return mat3(c,s,0., -s,c,0., 0.,0.,1.); }

void main() {
  float r = length(a_pos);
  bool seat = a_kind > 1.5;
  vec3 p = vec3(a_pos, 0.0);

  // The world turns slowly beneath the council; the seats stay put.
  if (!seat) p = rotZ(u_time * 0.018) * p;

  // Land breathes very slightly, like a surface catching air.
  if (a_kind < 0.5) p.z += sin(u_time * 0.7 + r * 9.0 + a_seed * 6.2831) * 0.012;

  // Assembly: each dot arrives from depth, centre first, seats last.
  float delay = seat ? 0.55 + a_seat * 0.028 : r * 0.42 + a_seed * 0.22;
  float t = clamp((u_intro * 1.7 - delay) / 0.9, 0.0, 1.0);
  float e = 1.0 - pow(1.0 - t, 4.0);
  p.z += (1.0 - e) * (-2.4 - a_seed * 2.6);
  p.xy *= mix(0.55, 1.0, e);

  p = rotY(u_look.x) * rotX(u_tilt + u_look.y) * p;

  float cam = 3.2;
  float k = cam / (cam - p.z);
  vec2 px = u_center + p.xy * u_R * k;
  gl_Position = vec4(px / (u_res * 0.5), 0.0, 1.0);

  // Cursor light: dots near the pointer brighten and swell.
  float m = 1.0 - smoothstep(0.0, u_R * 0.38, distance(px, u_mouse));
  m *= m;

  // A slow band of light passes across the map, like light over engraved metal.
  float sweep = mod(u_time * 0.16, 3.4) - 1.7;
  float band = exp(-pow((dot(a_pos, normalize(vec2(1.0, 0.55))) - sweep) * 3.2, 2.0));

  float size, bright, alpha = e;
  v_hollow = 0.0;
  if (a_kind < 0.5) {
    size = 0.0115; bright = 0.30 + band * 0.45 + m * 0.7;
  } else if (!seat) {
    size = 0.0068; bright = 0.12 + band * 0.25 + m * 0.35; alpha *= 0.85;
  } else {
    bool claimed = a_seat < u_claimed - 0.5;
    size = claimed ? 0.058 : 0.046;
    bright = claimed ? 0.92 + 0.08 * sin(u_time * 1.4 + a_seat) : 0.35 + m * 0.4;
    v_hollow = claimed ? 0.0 : 1.0;
  }
  gl_PointSize = max(1.0, size * u_R * k * u_dpr * (1.0 + m * 0.7));
  v_bright = clamp(bright, 0.0, 1.0);
  v_alpha = alpha;
  v_kind = a_kind;
}
`;

const FRAG = `
precision mediump float;
uniform float u_fade;
uniform vec3 u_blue;
uniform vec3 u_paper;
varying float v_bright;
varying float v_alpha;
varying float v_kind;
varying float v_hollow;
void main() {
  float d = length(gl_PointCoord - 0.5);
  float disc = 1.0 - smoothstep(0.36, 0.5, d);
  float ring = disc * smoothstep(0.26, 0.34, d);
  float shape = mix(disc, ring, v_hollow);
  if (shape < 0.01) discard;
  vec3 col = mix(u_blue, u_paper, v_bright);
  float a = shape * v_alpha * u_fade * mix(0.55, 1.0, v_bright);
  gl_FragColor = vec4(col * a, a); // premultiplied
}
`;

function compile(gl: WebGLRenderingContext, type: number, src: string) {
  const s = gl.createShader(type)!;
  gl.shaderSource(s, src);
  gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) || 'shader');
  return s;
}

export default function ChamberMap({ claimed }: { claimed: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const claimedRef = useRef(claimed);
  const redrawRef = useRef<() => void>(() => {});

  useEffect(() => { claimedRef.current = claimed; redrawRef.current(); }, [claimed]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const gl = canvas.getContext('webgl', { alpha: true, antialias: true, premultipliedAlpha: true });
    if (!gl) return; // no WebGL: the page reads fine without the map

    let program: WebGLProgram;
    try {
      program = gl.createProgram()!;
      gl.attachShader(program, compile(gl, gl.VERTEX_SHADER, VERT));
      gl.attachShader(program, compile(gl, gl.FRAGMENT_SHADER, FRAG));
      gl.linkProgram(program);
      if (!gl.getProgramParameter(program, gl.LINK_STATUS)) return;
    } catch { return; }
    gl.useProgram(program);

    const { data, count } = buildGeometry();
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
    const stride = 5 * 4;
    const attr = (name: string, size: number, offset: number) => {
      const loc = gl.getAttribLocation(program, name);
      gl.enableVertexAttribArray(loc);
      gl.vertexAttribPointer(loc, size, gl.FLOAT, false, stride, offset * 4);
    };
    attr('a_pos', 2, 0); attr('a_kind', 1, 2); attr('a_seed', 1, 3); attr('a_seat', 1, 4);

    const U = (n: string) => gl.getUniformLocation(program, n);
    const u = {
      res: U('u_res'), center: U('u_center'), R: U('u_R'), dpr: U('u_dpr'), time: U('u_time'),
      intro: U('u_intro'), tilt: U('u_tilt'), look: U('u_look'), mouse: U('u_mouse'),
      claimed: U('u_claimed'), fade: U('u_fade'), blue: U('u_blue'), paper: U('u_paper'),
    };
    // sRGB approximations of --un-blue and --paper (see index.css)
    gl.uniform3f(u.blue, 0.13, 0.55, 0.86);
    gl.uniform3f(u.paper, 0.93, 0.95, 0.98);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.clearColor(0, 0, 0, 0);

    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const fine = window.matchMedia('(pointer: fine)').matches;
    let W = 0, H = 0, dpr = 1;

    const resize = () => {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      W = canvas.clientWidth; H = canvas.clientHeight;
      canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
      gl.viewport(0, 0, canvas.width, canvas.height);
    };
    resize();

    // Layout: beside the headline on wide screens, above it on narrow ones.
    const layout = () => {
      const wide = W >= 900;
      const R = wide ? Math.min(H * 0.39, W * 0.28) : Math.min(W * 0.4, H * 0.24);
      const cx = wide ? W * 0.24 : 0;
      const cy = wide ? H * 0.02 : H * 0.24;
      const dft = mapMotion.drift;
      return {
        R: R * (1 + dft * 0.55),
        cx: cx * (1 - dft),
        cy: cy * (1 - dft) - dft * H * 0.12,
      };
    };

    let mx = -1e5, my = -1e5, tmx = -1e5, tmy = -1e5, lx = 0, ly = 0, tlx = 0, tly = 0;
    const onMove = (e: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      tmx = e.clientX - rect.left - rect.width / 2;
      tmy = -(e.clientY - rect.top - rect.height / 2);
      tlx = (tmx / rect.width) * 0.16;
      tly = (-tmy / rect.height) * 0.12;
      if (mx < -1e4) { mx = tmx; my = tmy; }
    };
    if (fine && !reduced) window.addEventListener('pointermove', onMove, { passive: true });

    const start = performance.now();
    let raf = 0, visible = true, running = false;

    const draw = (now: number) => {
      const t = (now - start) / 1000;
      mx += (tmx - mx) * 0.08; my += (tmy - my) * 0.08;
      lx += (tlx - lx) * 0.05; ly += (tly - ly) * 0.05;
      const L = layout();
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.uniform2f(u.res, W * dpr, H * dpr);
      gl.uniform2f(u.center, L.cx * dpr, L.cy * dpr);
      gl.uniform1f(u.R, L.R * dpr);
      gl.uniform1f(u.dpr, 1);
      gl.uniform1f(u.time, reduced ? 0 : t);
      gl.uniform1f(u.intro, reduced ? 1 : Math.min(1, Math.max(0, (now - mapMotion.introAt) / 2400)));
      gl.uniform1f(u.tilt, mapMotion.tilt * 1.08);
      gl.uniform2f(u.look, lx, ly);
      gl.uniform2f(u.mouse, mx * dpr, my * dpr);
      gl.uniform1f(u.claimed, claimedRef.current);
      gl.uniform1f(u.fade, mapMotion.fade);
      gl.drawArrays(gl.POINTS, 0, count);
    };

    const loop = (now: number) => {
      draw(now);
      raf = requestAnimationFrame(loop);
    };
    const play = () => {
      if (reduced) { draw(performance.now()); return; }
      if (running || !visible || document.hidden) return;
      running = true; raf = requestAnimationFrame(loop);
    };
    const pause = () => { running = false; cancelAnimationFrame(raf); };
    redrawRef.current = () => { if (!running) draw(performance.now()); };

    const io = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
      if (visible) play(); else pause();
    });
    io.observe(canvas);
    const ro = new ResizeObserver(() => { resize(); redrawRef.current(); });
    ro.observe(canvas);
    const onVis = () => (document.hidden ? pause() : play());
    document.addEventListener('visibilitychange', onVis);
    // Reduced motion still follows scroll-driven layout, one frame at a time.
    const onScroll = () => { if (reduced) draw(performance.now()); };
    window.addEventListener('scroll', onScroll, { passive: true });

    play();
    return () => {
      pause();
      io.disconnect(); ro.disconnect();
      document.removeEventListener('visibilitychange', onVis);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('scroll', onScroll);
      redrawRef.current = () => {};
      // Free GPU objects but keep the context: StrictMode remounts reuse this canvas.
      gl.deleteBuffer(buf);
      gl.deleteProgram(program);
    };
  }, []);

  return <canvas ref={canvasRef} className="chamber-map" aria-hidden="true" />;
}
