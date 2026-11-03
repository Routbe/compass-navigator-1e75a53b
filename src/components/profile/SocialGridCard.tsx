import { useRef, useState, type CSSProperties, type MouseEvent } from "react";
import { useRouter } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { CalendarDays, Clapperboard, Headphones, Newspaper, Pin, Play, Smartphone, AtSign } from "lucide-react";
import type { OmniContentType } from "@/lib/omni-ingest";

import { galleryImageSrc } from "@/lib/image-proxy-rules";
import {
  isInternalSocialGridTarget,
  orderedSocialGridItems,
  type SocialGridConfig,
  type SocialGridItem,
} from "@/lib/social-grid";
import { cn } from "@/lib/utils";

/** Scrim and icon colours sit on top of a photo, so they do not follow the profile theme. */

const BADGE_ICON: Record<OmniContentType, typeof Play> = {
  article: Newspaper,
  podcast: Headphones,
  program: Play,
  short: Smartphone,
  event: CalendarDays,
  social: AtSign,
};

function Tile({ item }: { item: SocialGridItem }) {
  const { t } = useTranslation();
  const video = useRef<HTMLVideoElement>(null);
  const [kinetic, setKinetic] = useState(false);
  const startKinetic = () => {
    if (!item.kineticPreviewUrl) return;
    setKinetic(true);
    void video.current?.play().catch(() => setKinetic(false));
  };
  const stopKinetic = () => {
    setKinetic(false);
    video.current?.pause();
  };
  const pressTimer = useRef<number | undefined>(undefined);
  const BadgeIcon = item.contentType ? BADGE_ICON[item.contentType] : null;
  const router = useRouter();
  const [loaded, setLoaded] = useState(false);
  const src = galleryImageSrc(item.mediaUrl);
  const showCaption = Boolean(item.caption) && (Boolean(item.contentType) || item.platform === "article" || item.platform === "custom");
  const label = item.caption || t(`studio.grid.platform.${item.platform}`);
  const target = item.targetUrl;
  const internal = target ? isInternalSocialGridTarget(target) : false;

  const onInternal = (e: MouseEvent<HTMLAnchorElement>) => {
    if (!target || e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
    e.preventDefault();
    router.history.push(target);
  };

  const body = (
    <>
      {src && (
        <img
          src={src}
          alt={item.caption ?? ""}
          loading="lazy"
          decoding="async"
          draggable={false}
          onLoad={() => setLoaded(true)}
          className={cn(
            "h-full w-full object-cover transition-[opacity,transform,filter] duration-500 group-hover:scale-[1.04]",
            loaded ? "scale-100 opacity-100 blur-0" : "scale-105 opacity-0 blur-md",
          )}
        />
      )}
      {item.kineticPreviewUrl && (
        <video
          ref={video}
          src={item.kineticPreviewUrl}
          muted
          loop
          playsInline
          preload="none"
          aria-hidden
          className={cn("pointer-events-none absolute inset-0 h-full w-full object-cover transition-opacity duration-300", kinetic ? "opacity-100" : "opacity-0")}
        />
      )}
      {BadgeIcon && item.contentType && (
        <span className="social-grid-badge absolute right-2 top-2 inline-flex items-center gap-1 rounded-full px-2 py-1 text-[10px] font-semibold leading-none">
          <BadgeIcon className="h-3 w-3" aria-hidden />
          <span className={item.metaTag ? "" : "sr-only"}>{item.metaTag || t(`studio.grid.type.${item.contentType}`)}</span>
        </span>
      )}
      {item.isVideo && !BadgeIcon && (
        <Clapperboard className="social-grid-icon absolute right-2 top-2 h-4 w-4" aria-label={t("studio.grid.videoBadge")} />
      )}
      {item.pinned && <Pin className="social-grid-icon absolute left-2 top-2 h-3.5 w-3.5" aria-label={t("studio.grid.pinned")} />}
      {showCaption && (
        <span className="social-grid-caption absolute inset-x-0 bottom-0 line-clamp-2 px-2 pb-2 pt-6 text-left text-[11px] font-medium leading-snug">
          {item.caption}
        </span>
      )}
    </>
  );

  const tileClass =
    cn(
      "group relative block w-full overflow-hidden rounded-xl bg-current/5 outline-none transition-transform duration-200 ease-out active:scale-95 focus-visible:ring-2 focus-visible:ring-current [-webkit-touch-callout:none] [-webkit-tap-highlight-color:transparent] motion-reduce:transition-none",
      item.isHero ? "aspect-[2/1] sm:aspect-[2/1]" : "aspect-square",
    );
  const hover = item.kineticPreviewUrl
    ? { onPointerEnter: startKinetic, onPointerLeave: stopKinetic, onPointerCancel: stopKinetic, onContextMenu: (e: MouseEvent) => e.preventDefault(),
        onTouchStart: () => { pressTimer.current = window.setTimeout(startKinetic, 350); },
        onTouchEnd: () => { window.clearTimeout(pressTimer.current); stopKinetic(); } }
    : {};

  if (!target) return <div className={tileClass} {...hover}>{body}</div>;
  return internal ? (
    <a href={target} onClick={onInternal} aria-label={label} className={tileClass} {...hover}>{body}</a>
  ) : (
    <a href={target} target="_blank" rel="noopener noreferrer nofollow" aria-label={t("studio.grid.openExternal", { label })} className={tileClass} {...hover}>
      {body}
    </a>
  );
}

/** Public renderer: a Linkin.bio-style grid, 2 columns on phones and 3 on wider screens. */
export function SocialGridCard({ config, style }: { config: SocialGridConfig; style: CSSProperties }) {
  const items = orderedSocialGridItems(config.items);
  if (items.length === 0) return null;
  return (
    <section
      style={style}
      className="social-grid-section w-full select-none overflow-hidden p-3 text-left [touch-action:manipulation] sm:p-4"
    >
      {config.title.trim() !== "" && <h3 className="mb-3 px-1 text-sm font-semibold tracking-tight">{config.title}</h3>}
      <ul className="grid grid-flow-row-dense grid-cols-2 gap-1.5 overscroll-contain sm:grid-cols-3 sm:gap-2">
        {items.map((item) => (
          <li key={item.id} className={item.isHero ? "col-span-2" : undefined}>
            <Tile item={item} />
          </li>
        ))}
      </ul>
    </section>
  );
}
