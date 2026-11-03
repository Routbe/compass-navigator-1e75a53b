import { lazy, Suspense, useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { useI18n } from "@/lib/i18n";
import { activeStories, hasUnseen, seenStorageKey } from "@/lib/qa/story";
import { useQaPublic, type QaSpace } from "./useQaPublic";
import { Button } from "@/components/ui/button";

const QaStoryViewer = lazy(() => import("./QaStoryViewer").then((m) => ({ default: m.QaStoryViewer })));

/**
 * Status ring around the avatar (WhatsApp / Instagram style): green while a
 * visitor has unseen answers from the last 24 hours, grey once watched. Tapping
 * opens the answers as full-screen stories. Without stories it renders the
 * avatar untouched.
 */
export function QaStoryRing({ handle, space, displayName, avatarUrl, children }: {
  handle: string | null;
  space: QaSpace;
  displayName: string | null;
  avatarUrl: string | null;
  children: ReactNode;
}) {
  const { t } = useI18n();
  const qa = useQaPublic(handle, space);
  const [now, setNow] = useState<number | null>(null);
  const [seenAt, setSeenAt] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const stories = useMemo(() => (now === null || !qa.data ? [] : activeStories(qa.data.answers, now)), [qa.data, now]);

  // Browser-only state after hydration: current time and what this visitor watched.
  useEffect(() => {
    setNow(Date.now());
    setSeenAt(null);
    setOpen(false);
    if (!handle) return;
    try { setSeenAt(window.localStorage.getItem(seenStorageKey(space, handle))); } catch { /* storage blocked */ }
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    const refresh = () => setNow(Date.now());
    document.addEventListener("visibilitychange", refresh);
    return () => { window.clearInterval(timer); document.removeEventListener("visibilitychange", refresh); };
  }, [handle, space]);

  const close = useCallback(() => {
    setOpen(false);
    const latest = stories[stories.length - 1]?.answeredAt ?? null;
    if (!latest || !handle) return;
    setSeenAt(latest);
    try { window.localStorage.setItem(seenStorageKey(space, handle), latest); } catch { /* storage blocked */ }
  }, [stories, handle, space]);

  if (!handle || stories.length === 0) return <>{children}</>;
  const unseen = hasUnseen(stories, seenAt);
  const name = displayName || `@${handle}`;

  return (
    <>
      <Button variant="ghost"
        type="button"
        onClick={() => setOpen(true)}
        className="qa-story-ring relative inline-flex h-auto rounded-full p-[3px] transition-transform active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        data-seen={unseen ? "false" : "true"}
        aria-label={t("pages.qa.story.open", { name })}
        aria-haspopup="dialog"
      >
        <span className="inline-flex rounded-full bg-background p-[3px]">{children}</span>
      </Button>
      {open && (
        <Suspense fallback={null}>
          <QaStoryViewer stories={stories} handle={handle} space={space} displayName={displayName} avatarUrl={avatarUrl} onClose={close} />
        </Suspense>
      )}
    </>
  );
}
