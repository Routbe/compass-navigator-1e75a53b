/**
 * Eigen "Pagina bezoek effect": tot 4 emoji's met duur, hoeveelheid,
 * op-/afbouw, richting en wat er onderaan gebeurt. Alleen DOM + Web Animations.
 */
import { prefersReducedMotion } from "./visit-effects";

export const VISIT_DIRECTIONS = ["down", "up", "diagonal", "burst"] as const;
export const VISIT_RAMPS = ["soft", "fast", "instant"] as const;
export const VISIT_FLOORS = ["through", "vanish", "bounce", "splat"] as const;
export type VisitDirection = (typeof VISIT_DIRECTIONS)[number];
export type VisitRamp = (typeof VISIT_RAMPS)[number];
export type VisitFloor = (typeof VISIT_FLOORS)[number];

export interface VisitEffectCustom {
  enabled: boolean;
  emojis: string[];
  /** Totale duur in seconden (1–10). */
  duration: number;
  /** Aantal deeltjes (5–80). */
  amount: number;
  rampIn: VisitRamp;
  rampOut: VisitRamp;
  direction: VisitDirection;
  /** Vervaagt naarmate het verder beweegt. */
  fade: boolean;
  /** Gedrag onderaan als `fade` uit staat. */
  floor: VisitFloor;
}

export const DEFAULT_VISIT_CUSTOM: VisitEffectCustom = {
  enabled: false,
  emojis: ["✨"],
  duration: 4,
  amount: 30,
  rampIn: "soft",
  rampOut: "soft",
  direction: "down",
  fade: true,
  floor: "through",
};

export const MAX_VISIT_EMOJIS = 4;

const clamp = (n: unknown, min: number, max: number, fallback: number) => {
  const v = typeof n === "number" && Number.isFinite(n) ? n : fallback;
  return Math.min(max, Math.max(min, Math.round(v)));
};
const oneOf = <T extends string>(v: unknown, list: readonly T[], fb: T): T =>
  typeof v === "string" && (list as readonly string[]).includes(v) ? (v as T) : fb;

/** Splitst tekst in afzonderlijke emoji/grafemen. */
export function splitGraphemes(text: string): string[] {
  const Seg = (Intl as unknown as { Segmenter?: new (l?: string, o?: { granularity: string }) => { segment(s: string): Iterable<{ segment: string }> } }).Segmenter;
  if (Seg) return Array.from(new Seg(undefined, { granularity: "grapheme" }).segment(text), (s) => s.segment);
  return Array.from(text);
}

export function normalizeVisitCustom(raw: unknown): VisitEffectCustom {
  const r = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const emojis = (Array.isArray(r.emojis) ? r.emojis : [])
    .filter((e): e is string => typeof e === "string")
    .map((e) => splitGraphemes(e.trim())[0] ?? "")
    .filter((e) => e.length > 0 && e.length <= 16 && !/[\p{L}\p{N}<>]/u.test(e))
    .slice(0, MAX_VISIT_EMOJIS);
  return {
    enabled: r.enabled === true,
    emojis: emojis.length ? emojis : [...DEFAULT_VISIT_CUSTOM.emojis],
    duration: clamp(r.duration, 1, 10, DEFAULT_VISIT_CUSTOM.duration),
    amount: clamp(r.amount, 5, 80, DEFAULT_VISIT_CUSTOM.amount),
    rampIn: oneOf(r.rampIn, VISIT_RAMPS, "soft"),
    rampOut: oneOf(r.rampOut, VISIT_RAMPS, "soft"),
    direction: oneOf(r.direction, VISIT_DIRECTIONS, "down"),
    fade: r.fade !== false,
    floor: oneOf(r.floor, VISIT_FLOORS, "through"),
  };
}

const rampMs = (r: VisitRamp, total: number) => (r === "instant" ? 0 : r === "fast" ? total * 0.12 : total * 0.35);

export function runCustomVisitEffect(
  cfg: VisitEffectCustom,
  options?: { force?: boolean; container?: HTMLElement | null },
): () => void {
  if (typeof document === "undefined") return () => {};
  if (!options?.force && prefersReducedMotion()) return () => {};
  const c = normalizeVisitCustom(cfg);
  const container = options?.container ?? null;
  const root = document.createElement("div");
  root.setAttribute("aria-hidden", "true");
  root.style.cssText = container
    ? "position:absolute;inset:0;pointer-events:none;overflow:hidden;z-index:60"
    : "position:fixed;inset:0;pointer-events:none;overflow:hidden;z-index:60;contain:strict";
  if (container && getComputedStyle(container).position === "static") container.style.position = "relative";
  (container ?? document.body).appendChild(root);
  const box = container?.getBoundingClientRect();
  const W = box?.width || window.innerWidth;
  const H = box?.height || window.innerHeight;
  const total = c.duration * 1000;
  const inMs = rampMs(c.rampIn, total);
  const outMs = rampMs(c.rampOut, total);
  const r = (a: number, b: number) => a + Math.random() * (b - a);
  let done = false;
  const timers: number[] = [];

  for (let i = 0; i < c.amount; i += 1) {
    // Opbouw: deeltjes verschijnen gespreid over de opbouwtijd.
    const delay = inMs * (i / c.amount);
    const life = Math.max(600, total - delay - r(0, outMs * 0.6));
    const el = document.createElement("span");
    el.textContent = c.emojis[i % c.emojis.length] ?? "✨";
    const size = r(18, 34);
    el.style.cssText = `position:absolute;left:0;top:0;font-size:${size}px;line-height:1;will-change:transform,opacity;opacity:0`;
    root.appendChild(el);

    let x0 = r(0, W), y0 = -40, x1 = x0 + r(-40, 40), y1 = H - size;
    if (c.direction === "up") { y0 = H + 10; y1 = -40; }
    else if (c.direction === "diagonal") { x0 = r(-W * 0.3, W * 0.7); x1 = x0 + W * 0.5; }
    else if (c.direction === "burst") { x0 = W / 2; y0 = H / 2; const a = r(0, Math.PI * 2), d = r(W * 0.3, Math.max(W, H)); x1 = x0 + Math.cos(a) * d; y1 = y0 + Math.sin(a) * d; }

    const rot = r(-180, 180);
    const endOpacity = c.fade ? 0 : 1;
    const frames: Keyframe[] = [
      { transform: `translate(${x0}px,${y0}px) rotate(0deg)`, opacity: 0, offset: 0 },
      { transform: `translate(${x0 + (x1 - x0) * 0.05}px,${y0 + (y1 - y0) * 0.05}px)`, opacity: 1, offset: 0.05 },
      { transform: `translate(${x1}px,${y1}px) rotate(${rot}deg)`, opacity: c.fade ? 0.05 : 1, offset: c.direction === "down" && !c.fade ? 0.75 : 1 },
    ];
    const falls = c.direction === "down" && !c.fade;
    if (falls) {
      const end = `translate(${x1}px,${y1}px) rotate(${rot}deg)`;
      if (c.floor === "through") frames[2] = { transform: `translate(${x1}px,${H + 60}px) rotate(${rot}deg)`, opacity: 1, offset: 1 };
      else if (c.floor === "vanish") frames.push({ transform: end, opacity: 1, offset: 0.9 }, { transform: end, opacity: 0, offset: 1 });
      else if (c.floor === "bounce") frames.push(
        { transform: `translate(${x1}px,${y1 - 60}px) rotate(${rot}deg)`, opacity: 1, offset: 0.84 },
        { transform: end, offset: 0.92 },
        { transform: `translate(${x1}px,${y1 - 18}px) rotate(${rot}deg)`, offset: 0.96 },
        { transform: end, opacity: 0, offset: 1 },
      );
      else frames.push({ transform: `${end} scale(1.6,0.25)`, opacity: 1, offset: 0.8 }, { transform: `${end} scale(2.2,0.1)`, opacity: 0, offset: 1 });
    } else {
      frames[frames.length - 1]!.opacity = endOpacity;
    }
    const anim = el.animate(frames, { duration: life, delay, easing: c.direction === "down" ? "cubic-bezier(.45,.05,.75,.6)" : "cubic-bezier(.2,.7,.3,1)", fill: "forwards" });
    anim.onfinish = () => el.remove();
  }
  const cleanup = () => {
    if (done) return;
    done = true;
    timers.forEach((t) => window.clearTimeout(t));
    root.remove();
  };
  timers.push(window.setTimeout(cleanup, total + 500));
  return cleanup;
}
