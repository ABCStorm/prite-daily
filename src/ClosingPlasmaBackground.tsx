import { useEffect, useRef } from "react";

/* Plasma backdrop for the quiz screen — Componentry's "closing-plasma"
   (componentry.dev/docs/components/closing-plasma, `@componentry/closing-plasma`).

   Ported by hand rather than installed via `shadcn add`: the upstream component
   is Tailwind-classed and imports `cn` from `@/lib/utils`, neither of which
   exists in this app (no Tailwind, no components.json, no `@/` alias). The
   shaders and the uniform set are verbatim; what changed is the wrapper —
   inline styles instead of Tailwind, and no `children` slot since this is only
   ever a backdrop.

   Colours are Componentry's own dark-mode defaults, which is what their docs
   page shows (their <html> carries `dark`). Upstream defaults themeMode to
   "auto" and reads a `.dark` class off <html>; this app has no such class, so
   "auto" would resolve to the pale light palette and wash out against the dark
   app chrome. Defaulting to "dark" here keeps the documented look.

   Shared with Quizapine (Projects/Quizapine/src/ClosingPlasmaBackground.tsx) —
   the two copies are identical apart from this note. PRITE Daily mounts it at
   half Quizapine's drift (speed 0.12 vs 0.25), since the question stems here
   are longer and anything you can catch moving while reading is a distraction.

   Pointer tracking listens on window, not the container, so the canvas can stay
   pointer-events: none and never swallow a click meant for an answer option —
   the container is fixed inset 0, so viewport coords are already container
   coords. */

const VERTEX_SHADER = `
attribute vec2 position;
void main() {
  gl_Position = vec4(position, 0.0, 1.0);
}
`;

const FRAGMENT_SHADER = `
precision highp float;

uniform vec2 u_res;
uniform float u_time;
uniform vec2 u_mouse;
uniform float u_isDark;
uniform float u_speed;
uniform float u_turbulence;
uniform float u_mouseInfluence;
uniform float u_grain;
uniform float u_sparkle;
uniform float u_vignette;
uniform float u_opacity;

uniform vec3 u_darkA;
uniform vec3 u_darkB;
uniform vec3 u_darkC;
uniform vec3 u_lightA;
uniform vec3 u_lightB;
uniform vec3 u_lightC;

vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec2 mod289(vec2 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec3 permute(vec3 x) { return mod289(((x * 34.0) + 1.0) * x); }

float snoise(vec2 v) {
  const vec4 C = vec4(0.211324865405187, 0.366025403784439,
                     -0.577350269189626, 0.024390243902439);
  vec2 i = floor(v + dot(v, C.yy));
  vec2 x0 = v - i + dot(i, C.xx);
  vec2 i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
  vec4 x12 = x0.xyxy + C.xxzz;
  x12.xy -= i1;
  i = mod289(i);
  vec3 p = permute(permute(i.y + vec3(0.0, i1.y, 1.0)) + i.x + vec3(0.0, i1.x, 1.0));
  vec3 m = max(0.5 - vec3(dot(x0, x0), dot(x12.xy, x12.xy), dot(x12.zw, x12.zw)), 0.0);
  m = m * m;
  m = m * m;
  vec3 x = 2.0 * fract(p * C.www) - 1.0;
  vec3 h = abs(x) - 0.5;
  vec3 ox = floor(x + 0.5);
  vec3 a0 = x - ox;
  m *= 1.79284291400159 - 0.85373472095314 * (a0 * a0 + h * h);
  vec3 g;
  g.x = a0.x * x0.x + h.x * x0.y;
  g.yz = a0.yz * x12.xz + h.yz * x12.yw;
  return 130.0 * dot(m, g);
}

float fbm(vec2 p, float turbulence) {
  float total = 0.0;
  float amp = 0.5;
  float freq = 1.0;
  mat2 rot = mat2(cos(0.45), sin(0.45), -sin(0.45), cos(0.45));
  for (int i = 0; i < 5; i++) {
    total += snoise(p * freq) * amp;
    p = rot * p;
    freq *= mix(1.85, 2.35, clamp(turbulence, 0.0, 2.0) * 0.5);
    amp *= 0.5;
  }
  return total;
}

void main() {
  vec2 uv = gl_FragCoord.xy / u_res;
  float aspect = u_res.x / max(u_res.y, 1.0);
  vec2 p = (uv - 0.5) * vec2(aspect, 1.0);
  float t = u_time * (0.15 * u_speed);

  vec2 mouse = (u_mouse - 0.5) * vec2(aspect, 1.0);
  float dMouse = length(p - mouse);
  p += (mouse - p) * 0.02 * u_mouseInfluence * smoothstep(0.45, 0.0, dMouse);

  vec2 flow = vec2(
    fbm(p + vec2(t * 0.2, t * 0.1), u_turbulence),
    fbm(p + vec2(-t * 0.1, t * 0.3), u_turbulence)
  );

  float n = fbm(p * 2.0 + flow * 1.45, u_turbulence);
  float ridges = 1.0 - abs(snoise(p * 4.0 + n) * 2.0);
  ridges = pow(ridges, 3.0);

  vec3 colorA = mix(u_lightA, u_darkA, u_isDark);
  vec3 colorB = mix(u_lightB, u_darkB, u_isDark);
  vec3 colorC = mix(u_lightC, u_darkC, u_isDark);

  vec3 col = mix(colorA, colorB, smoothstep(-0.5, 0.5, n));
  col = mix(col, colorC, smoothstep(0.25, 1.0, n * 0.52 + ridges * 0.48));

  float sparkle = pow(max(0.0, snoise(gl_FragCoord.xy * 0.2 + t * 2.0)), 18.0) * 0.5 * u_sparkle;
  vec3 sparkleColor = mix(vec3(0.56, 0.58, 0.72), vec3(0.8, 0.9, 1.0), u_isDark);
  col += sparkleColor * sparkle;

  float vigDark = 1.0 - smoothstep(0.5, mix(1.8, 1.55, u_isDark), length(p));
  col = mix(col, col * vigDark, u_isDark * u_vignette);
  float vigLight = 1.0 - smoothstep(0.4, 1.45, length(p));
  col = mix(mix(vec3(1.0), col, vigLight), col, u_isDark);

  float grain = (fract(sin(dot(gl_FragCoord.xy + t * 50.0, vec2(12.9898, 78.233))) * 43758.5453) - 0.5) * (0.06 * u_grain);
  col += grain;

  gl_FragColor = vec4(clamp(col, 0.0, 1.0), u_opacity);
}
`;

// Componentry's defaults, unchanged.
const DARK_A = "#0d0d14", DARK_B = "#1f2540", DARK_C = "#4a6191";
const LIGHT_A = "#f0f2f7", LIGHT_B = "#d7dceb", LIGHT_C = "#bcc5e0";

const hexToRgb01 = (hex: string): [number, number, number] => {
  const h = hex.replace("#", "");
  return [
    parseInt(h.slice(0, 2), 16) / 255,
    parseInt(h.slice(2, 4), 16) / 255,
    parseInt(h.slice(4, 6), 16) / 255,
  ];
};

export type ClosingPlasmaBackgroundProps = {
  themeMode?: "light" | "dark";
  speed?: number;
  turbulence?: number;
  mouseInfluence?: number;
  grain?: number;
  sparkle?: number;
  vignette?: number;
  opacity?: number;
  interactive?: boolean;
};

export default function ClosingPlasmaBackground({
  themeMode = "dark",
  speed = 1,
  turbulence = 1,
  mouseInfluence = 1,
  grain = 1,
  sparkle = 1,
  vignette = 1,
  opacity = 1,
  interactive = true,
}: ClosingPlasmaBackgroundProps) {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const container = mountRef.current;
    const canvas = canvasRef.current;
    if (!container || !canvas) return;

    const gl = canvas.getContext("webgl", { antialias: false, alpha: true });
    if (!gl) return; // no WebGL — the ink background behind us is the fallback

    const compile = (type: number, source: string) => {
      const sh = gl.createShader(type);
      if (!sh) return null;
      gl.shaderSource(sh, source);
      gl.compileShader(sh);
      if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) { gl.deleteShader(sh); return null; }
      return sh;
    };

    const vs = compile(gl.VERTEX_SHADER, VERTEX_SHADER);
    const fs = compile(gl.FRAGMENT_SHADER, FRAGMENT_SHADER);
    const program = vs && fs ? gl.createProgram() : null;
    if (!vs || !fs || !program) {
      if (vs) gl.deleteShader(vs);
      if (fs) gl.deleteShader(fs);
      return;
    }

    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      gl.deleteProgram(program); gl.deleteShader(vs); gl.deleteShader(fs);
      return;
    }
    gl.useProgram(program);

    const position = gl.getAttribLocation(program, "position");
    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(position);
    gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);

    const u = (n: string) => gl.getUniformLocation(program, n);
    const uRes = u("u_res"), uTime = u("u_time"), uMouse = u("u_mouse"), uIsDark = u("u_isDark");
    const uSpeed = u("u_speed"), uTurbulence = u("u_turbulence"), uMouseInfluence = u("u_mouseInfluence");
    const uGrain = u("u_grain"), uSparkle = u("u_sparkle"), uVignette = u("u_vignette"), uOpacity = u("u_opacity");

    const setColor = (name: string, hex: string) => {
      const [r, g, b] = hexToRgb01(hex);
      gl.uniform3f(u(name), r, g, b);
    };
    setColor("u_darkA", DARK_A); setColor("u_darkB", DARK_B); setColor("u_darkC", DARK_C);
    setColor("u_lightA", LIGHT_A); setColor("u_lightB", LIGHT_B); setColor("u_lightC", LIGHT_C);

    const isDark = themeMode === "dark" ? 1 : 0;

    // Assigned once `draw` exists below. Resizing reallocates the drawing
    // buffer, which clears it to transparent, so a resize has to be followed by
    // a frame — otherwise the reduced-motion path (which draws exactly once)
    // leaves a blank canvas forever, and the animated path shows one see-through
    // frame that reads as a flash.
    let redraw: (() => void) | null = null;

    let bufW = 0, bufH = 0;
    const resize = () => {
      // Upstream caps DPR at 1.75 — a full-screen fbm with 5 octaves is not
      // something you want running at retina 3x.
      const dpr = Math.min(window.devicePixelRatio || 1, 1.75);
      const { width, height } = container.getBoundingClientRect();
      const w = Math.max(1, Math.floor(width * dpr));
      const h = Math.max(1, Math.floor(height * dpr));
      // Mobile browsers resize the viewport by the height of the URL bar on
      // every scroll gesture. Reallocating for that means a cleared canvas
      // mid-scroll; the plasma has no fixed features, so letting the existing
      // buffer stretch over a ~URL-bar-sized height change is invisible, while
      // the clear is not. Width changes (rotation) always reallocate.
      if (w === bufW && bufH && Math.abs(h - bufH) < 160 * dpr) return;
      canvas.width = bufW = w;
      canvas.height = bufH = h;
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.uniform2f(uRes, canvas.width, canvas.height);
      redraw?.();
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(container);

    const mouse = { x: 0.5, y: 0.5 };
    const target = { x: 0.5, y: 0.5 };
    const onPointerMove = (e: PointerEvent) => {
      target.x = e.clientX / window.innerWidth;
      target.y = 1 - e.clientY / window.innerHeight;
    };
    if (interactive) window.addEventListener("pointermove", onPointerMove, { passive: true });

    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let raf = 0;
    const start = performance.now();

    const draw = (elapsed: number) => {
      mouse.x += (target.x - mouse.x) * 0.05;
      mouse.y += (target.y - mouse.y) * 0.05;
      gl.uniform1f(uTime, elapsed);
      gl.uniform2f(uMouse, mouse.x, mouse.y);
      gl.uniform1f(uIsDark, isDark);
      gl.uniform1f(uSpeed, speed);
      gl.uniform1f(uTurbulence, turbulence);
      gl.uniform1f(uMouseInfluence, mouseInfluence);
      gl.uniform1f(uGrain, grain);
      gl.uniform1f(uSparkle, sparkle);
      gl.uniform1f(uVignette, vignette);
      gl.uniform1f(uOpacity, opacity);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    };

    const render = (now: number) => {
      raf = requestAnimationFrame(render);
      draw((now - start) / 1000);
    };

    redraw = () => draw(still ? 0 : (performance.now() - start) / 1000);

    if (still) draw(0);
    else raf = requestAnimationFrame(render);

    // Don't burn GPU on a tab nobody is looking at.
    const onVisibility = () => {
      if (still) return;
      if (document.hidden) { cancelAnimationFrame(raf); raf = 0; }
      else if (!raf) raf = requestAnimationFrame(render);
    };
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      cancelAnimationFrame(raf);
      if (interactive) window.removeEventListener("pointermove", onPointerMove);
      document.removeEventListener("visibilitychange", onVisibility);
      ro.disconnect();
      gl.deleteBuffer(buffer);
      gl.deleteProgram(program);
      gl.deleteShader(vs);
      gl.deleteShader(fs);
    };
  }, [themeMode, speed, turbulence, mouseInfluence, grain, sparkle, vignette, opacity, interactive]);

  /* The layer bleeds 60px past the top and bottom of the viewport. A mobile URL
     bar sliding away grows the visual viewport before a viewport-sized fixed
     layer has been re-laid-out, which briefly exposes a strip along the edge;
     the bleed means there is always canvas there to expose. */
  return (
    <div
      ref={mountRef}
      aria-hidden="true"
      style={{ position: "fixed", inset: "-60px 0", zIndex: 0, pointerEvents: "none", overflow: "hidden" }}
    >
      <canvas ref={canvasRef} style={{ width: "100%", height: "100%", display: "block" }} />
    </div>
  );
}
