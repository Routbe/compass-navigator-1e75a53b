import { createFileRoute } from "@tanstack/react-router";
import { runCustomVisitEffect, DEFAULT_VISIT_CUSTOM } from "@/lib/visit-effect-custom";

/** Tijdelijke testpagina: 3 glazen knoppen + 1 bento-kaart als botsingsdoelen voor het bezoekeffect. */
export const Route = createFileRoute("/dev/visit-fx")({
  head: () => ({ meta: [
    { title: "ROUT – Bezoekeffect testpagina" },
    { name: "description", content: "Interne testpagina voor de botsingen van het pagina bezoek effect." },
    { name: "robots", content: "noindex" },
    { property: "og:title", content: "ROUT – Bezoekeffect testpagina" },
    { property: "og:description", content: "Interne testpagina voor het pagina bezoek effect." },
    { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" },
  ] }),
  component: DevVisitFx,
});

function DevVisitFx() {
  const fire = (floorMode: "bounce" | "splat" | "vanish") =>
    runCustomVisitEffect({ ...DEFAULT_VISIT_CUSTOM, enabled: true, emojis: ["🍒", "💧"], amount: 80, duration: 6, direction: "down", fade: false, floorMode, rampIn: "fast" }, { force: true, immediate: true });
  return (
    <main className="mx-auto max-w-md px-4 py-16 space-y-6 text-foreground" style={{ minHeight: "260vh" }}>
      <div className="flex gap-2">
        {(["bounce", "splat", "vanish"] as const).map((m) => (
          <button key={m} id={`fire-${m}`} onClick={() => fire(m)} className="rounded-full border border-border px-3 py-1 text-xs">{m}</button>
        ))}
      </div>
      <div className="h-40" />
      {["Glas 1", "Glas 2", "Glas 3"].map((t) => (
        <a key={t} href="#" data-visit-collider className="block rounded-2xl border border-border bg-card/40 px-6 py-4 text-center backdrop-blur-md">{t}</a>
      ))}
      <article data-block-id="bento-1" className="grid h-48 place-items-center rounded-3xl border border-border bg-card/60 backdrop-blur-md">Bento-Matrix kaart</article>
    </main>
  );
}
