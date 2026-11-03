import type { Body, FrameMsg, WorkerMsg } from "./protocol";
import { createGlRenderer } from "./gl-renderer";

export type GpuRunConfig = Omit<Extract<WorkerMsg, { type: "init" }>, "type" | "width" | "height" | "floor" | "bodies" | "textures"> & { emojis: string[] };

const COLLIDERS = "[data-visit-collider], img, a, button, [data-block-id]";

/** Leest de statische lichamen (avatar, knoppen, kaarten) relatief t.o.v. de overlay. */
export function readBodies(root: ParentNode, origin: DOMRect, w: number, h: number): Body[] {
  const out: Body[] = [];
  root.querySelectorAll<HTMLElement>(COLLIDERS).forEach((el) => {
    if (el.closest("[data-visit-fx]")) return;
    const r = el.getBoundingClientRect();
    if (r.width < 40 || r.height < 24 || r.width > w * 0.98) return;
    const x = r.left - origin.left, y = r.top - origin.top;
    if (y + r.height < 0 || y > h) return; // h = paginahoogte
    out.push([x, y, r.width, r.height]);
  });
  return out.slice(0, 64);
}

/** GPU + worker pad. Geeft null terug als WebGL of workers ontbreken (caller valt terug op canvas 2D). */
export function runGpuVisitEffect(cfg: GpuRunConfig, container: HTMLElement | null): (() => void) | null {
  if (typeof Worker === "undefined") return null;
  const canvas = document.createElement("canvas");
  canvas.dataset.visitFx = "";
  canvas.setAttribute("aria-hidden", "true");
  canvas.style.cssText = container
    ? "position:absolute;inset:0;width:100%;height:100%;pointer-events:none;z-index:50"
    : "position:fixed;inset:0;width:100vw;height:100vh;pointer-events:none;z-index:50";
  const host = container ?? document.body;
  if (container && getComputedStyle(container).position === "static") container.style.position = "relative";
  host.appendChild(canvas);
  const renderer = createGlRenderer(canvas, cfg.emojis);
  if (!renderer) { canvas.remove(); return null; }

  let done = false, latest: Float32Array | null = null, count = 0, raf = 0, safe = 0;
  // Camera = scrollY. Lichamen in paginacoördinaten, dus scrollen vraagt geen nieuwe lichamen.
  const camY = () => (container ? 0 : window.scrollY);
  let g = { w: 0, h: 0, floor: 0, bodies: [] as Body[] };
  // Eén gebatchte layout-read; resultaat wordt gecachet tot de lay-out echt verandert.
  const measure = () => {
    const vr = container ? container.getBoundingClientRect() : new DOMRect(0, -window.scrollY, window.innerWidth, window.innerHeight);
    const w = container ? vr.width : window.innerWidth;
    const h = container ? Math.min(vr.height, window.innerHeight) : window.innerHeight;
    g = { w, h, floor: h - safe, bodies: readBodies(container ?? document, vr, w, document.documentElement.scrollHeight) };
  };
  const worker = new Worker(new URL("./physics.worker.ts", import.meta.url), { type: "module" });
  const t0 = performance.now();
  const post = (m: WorkerMsg) => worker.postMessage(m);
  let relayout: ReturnType<typeof setTimeout> | null = null, camTimer: ReturnType<typeof setTimeout> | null = null, sentCam = camY();
  const onLayout = () => {
    if (relayout) clearTimeout(relayout);
    relayout = setTimeout(() => requestAnimationFrame(() => {
      if (done) return; measure(); post({ type: "bodies", bodies: g.bodies, width: g.w, height: g.h, floor: g.floor });
    }), 150);
  };
  // Hoogstens ~8 camera-berichten per seconde; renderen gebruikt scrollY rechtstreeks.
  const onScroll = () => {
    if (camTimer) return;
    camTimer = setTimeout(() => { camTimer = null; const y = camY(); if (y !== sentCam) { sentCam = y; post({ type: "camera", y }); } }, 120);
  };
  const ro = new ResizeObserver(onLayout);
  const cleanup = () => {
    if (done) return; done = true;
    post({ type: "stop" }); worker.terminate(); cancelAnimationFrame(raf);
    if (relayout) clearTimeout(relayout); if (camTimer) clearTimeout(camTimer);
    ro.disconnect(); window.removeEventListener("scroll", onScroll);
    renderer.dispose(); canvas.remove();
  };
  worker.onmessage = (e: MessageEvent<FrameMsg>) => {
    if (e.data.type === "done") return cleanup();
    latest = e.data.data; count = e.data.count;
  };
  worker.onerror = cleanup;
  const frame = (now: number) => {
    if (done) return;
    if (latest) renderer.draw(latest, count, g.w, g.h, now - t0, camY());
    raf = requestAnimationFrame(frame);
  };
  requestAnimationFrame(() => {
    if (done) return;
    const probe = document.createElement("div");
    probe.style.cssText = "position:fixed;bottom:0;height:env(safe-area-inset-bottom,0px);visibility:hidden";
    document.body.appendChild(probe);
    safe = container ? 0 : probe.getBoundingClientRect().height;
    probe.remove();
    measure();
    ro.observe(container ?? document.documentElement);
    (container ?? document).querySelectorAll<HTMLElement>("[data-visit-collider], [data-block-id]").forEach((el) => ro.observe(el));
    window.addEventListener("scroll", onScroll, { passive: true });
    const { emojis, ...rest } = cfg;
    post({ type: "init", ...rest, textures: emojis.length, width: g.w, height: g.h, floor: g.floor, bodies: g.bodies, cameraY: camY() });
    raf = requestAnimationFrame(frame);
  });
  return cleanup;
}
