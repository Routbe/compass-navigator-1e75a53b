import { STRIDE, type Body, type WorkerInit } from "./protocol";

type P = { x: number; y: number; px: number; py: number; r: number; rot: number; vr: number; tex: number;
  alpha: number; squash: number; rest: number; dead: boolean; resting: boolean };

/**
 * Verlet-physics, puur rekenwerk (geen DOM) zodat het in een worker en in tests draait.
 * Statische DOM-lichamen (knoppen, avatar, kaarten) zijn rechthoeken waarop deeltjes landen,
 * stuiteren, eraf rollen of terpletten.
 */
export class VisitWorld {
  cfg: WorkerInit; ps: P[] = []; spawned = 0; t = 0; out: Float32Array;
  constructor(cfg: WorkerInit) { this.cfg = cfg; this.out = new Float32Array(cfg.amount * STRIDE); }
  setBodies(b: Body[], w: number, h: number, floor: number) { Object.assign(this.cfg, { bodies: b, width: w, height: h, floor }); }
  private rand(a: number, b: number) { return a + Math.random() * (b - a); }
  private spawn() {
    const { width: W, height: H, direction } = this.cfg;
    const r = this.rand(9, 17);
    let x = this.rand(0, W), y = -r, vx = this.rand(-0.5, 0.5), vy = this.rand(1, 3);
    if (direction === "up") { y = H + r; vy = this.rand(-5, -2); }
    else if (direction === "diagonal") { x = this.rand(-W * 0.3, W * 0.7); vx = this.rand(2, 4); }
    else if (direction === "burst") { const a = this.rand(0, 6.283), v = this.rand(4, 10); x = W / 2; y = H / 2; vx = Math.cos(a) * v; vy = Math.sin(a) * v; }
    this.ps.push({ x, y, px: x - vx, py: y - vy, r, rot: 0, vr: this.rand(-0.06, 0.06), tex: this.spawned % this.cfg.textures,
      alpha: 1, squash: 0, rest: 0, dead: false, resting: false });
    this.spawned++;
  }
  private land(p: P, surface: number, vy: number) {
    const mode = this.cfg.floorMode;
    p.y = surface - p.r;
    if (mode === "bounce") {
      p.py = p.y + vy * 0.6; // vy *= -0.6
      if (Math.abs(vy) < 0.8) { p.py = p.y; p.resting = true; }
    } else if (mode === "splat") {
      p.squash = Math.min(1, 0.4 + Math.abs(vy) / 12); // impact-velocity → shader
      p.resting = true; p.py = p.y; p.px = p.x;
    } else if (mode === "vanish") { p.resting = true; p.py = p.y; p.px = p.x; }
  }
  /** Eén stap van ~16,7 ms. Geeft het aantal levende deeltjes terug. */
  step(dt: number) {
    const c = this.cfg; this.t += dt;
    const due = c.rampInMs <= 0 ? c.amount : Math.min(c.amount, Math.ceil((this.t / c.rampInMs) * c.amount));
    while (this.spawned < due) this.spawn();
    const g = c.direction === "up" ? -0.12 : c.direction === "burst" ? 0.08 : 0.22;
    const collide = c.direction === "down" && !c.fade && c.floorMode !== "through";
    const outStart = c.totalMs - c.rampOutMs;
    const globalA = this.t < outStart || c.rampOutMs <= 0 ? 1 : Math.max(0, 1 - (this.t - outStart) / c.rampOutMs);
    let n = 0;
    for (const p of this.ps) {
      if (p.dead) continue;
      if (!p.resting || c.floorMode === "bounce") {
        const vx = (p.x - p.px) * 0.995, vy = p.y - p.py;
        p.px = p.x; p.py = p.y; p.x += vx; p.y += vy + g; p.rot += p.vr;
        if (collide) {
          if (p.y + p.r >= c.floor && vy > 0) this.land(p, c.floor, vy);
          else for (const [bx, by, bw, bh] of c.bodies) {
            if (p.x < bx || p.x > bx + bw) continue;
            const prevBottom = p.py + p.r;
            if (p.y + p.r >= by && prevBottom <= by + 2 && p.y < by + bh) {
              this.land(p, by, vy);
              // Rol naar de dichtstbijzijnde rand en val eraf.
              const push = p.x < bx + bw / 2 ? -0.9 : 0.9;
              if (c.floorMode === "bounce") p.px = p.x - (vx + push);
              else if (c.floorMode === "vanish") { p.resting = false; p.px = p.x - push * 1.6; p.py = p.y; }
              break;
            }
          }
        }
      }
      if (p.resting) {
        p.rest += dt;
        if (c.floorMode === "vanish") p.alpha = p.rest < 1000 ? 1 : 1 - (p.rest - 1000) / 400;
        else if (c.floorMode === "splat") p.alpha = 1 - p.rest / 300;
        else if (c.floorMode === "bounce") p.alpha = 1 - p.rest / 500;
      } else if (c.fade) {
        const prog = c.direction === "up" ? 1 - p.y / c.height
          : c.direction === "burst" ? Math.hypot(p.x - c.width / 2, p.y - c.height / 2) / (Math.max(c.width, c.height) / 2)
          : p.y / c.height;
        p.alpha = 1 - Math.max(0, prog);
      }
      if (p.alpha <= 0 || p.y > c.height + p.r * 2 || p.y < -p.r * 4 || p.x < -c.width || p.x > c.width * 2) { p.dead = true; continue; }
      const o = n * STRIDE;
      this.out[o] = p.x; this.out[o + 1] = p.y; this.out[o + 2] = p.resting ? 0 : p.rot;
      this.out[o + 3] = p.squash; this.out[o + 4] = p.alpha * globalA; this.out[o + 5] = p.tex; this.out[o + 6] = p.r * 2;
      n++;
    }
    return n;
  }
  finished(alive: number) { return (this.spawned >= this.cfg.amount && alive === 0) || this.t > this.cfg.totalMs + 2500; }
}
