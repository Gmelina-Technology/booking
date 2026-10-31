"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { getNotifications, markNotificationsRead, type NotificationFeed } from "./notification-actions";
import type { AppNotification } from "@/lib/notifications";

// The bell in the staff header. Polls for new notifications while the tab is
// visible, and, if staff turn them on, shows them as desktop notifications
// too. That preference is per browser (localStorage); the browser's own
// permission prompt decides whether it can be turned on at all.

const POLL_MS = 30_000;
const DESKTOP_KEY = "staff-desktop-alerts";

/** Each notification opens its booking's details panel. */
const href = (n: Pick<AppNotification, "bookingId">) => `/admin/bookings?booking=${encodeURIComponent(n.bookingId)}`;

function ago(iso: string, now: number) {
  const mins = Math.max(0, Math.round((now - Date.parse(iso)) / 60_000));
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.round(hours / 24);
  return days === 1 ? "yesterday" : `${days} days ago`;
}

type Permission = NotificationPermission | "unsupported";

function readDesktopPref() {
  try {
    return localStorage.getItem(DESKTOP_KEY) === "on";
  } catch {
    return false;
  }
}

function writeDesktopPref(on: boolean) {
  try {
    localStorage.setItem(DESKTOP_KEY, on ? "on" : "off");
  } catch {}
}

export default function NotificationBell() {
  const router = useRouter();
  const [feed, setFeed] = useState<NotificationFeed>({ items: [], unread: 0 });
  const [open, setOpen] = useState(false);
  // Set whenever the feed loads or the panel opens; reading the clock during render would block prerendering.
  const [now, setNow] = useState(0);
  const [permission, setPermission] = useState<Permission>("unsupported");
  const [desktop, setDesktop] = useState(false);
  const seen = useRef<Set<string> | null>(null);
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Browser-only state, so it's read after hydration.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPermission(typeof Notification === "undefined" ? "unsupported" : Notification.permission);
    setDesktop(readDesktopPref());
  }, []);

  const apply = useCallback(
    (next: NotificationFeed) => {
      setFeed(next);
      setNow(Date.now());
      const fresh = seen.current ? next.items.filter((n) => !n.readAt && !seen.current!.has(n.id)) : [];
      seen.current = new Set(next.items.map((n) => n.id));
      if (fresh.length === 0) return;
      // Keep the inbox badge and any open booking list in step.
      router.refresh();
      if (readDesktopPref() && typeof Notification !== "undefined" && Notification.permission === "granted") {
        for (const n of fresh.slice(0, 3)) {
          const alert = new Notification(n.title, { body: n.body, tag: n.id });
          alert.onclick = () => {
            window.focus();
            router.push(href(n));
            alert.close();
          };
        }
      }
    },
    [router],
  );

  useEffect(() => {
    let stopped = false;
    const poll = () => {
      if (document.visibilityState !== "visible" && seen.current) return;
      getNotifications()
        .then((next) => !stopped && apply(next))
        .catch(() => {});
    };
    poll();
    const timer = setInterval(poll, POLL_MS);
    document.addEventListener("visibilitychange", poll);
    return () => {
      stopped = true;
      clearInterval(timer);
      document.removeEventListener("visibilitychange", poll);
    };
  }, [apply]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => !root.current?.contains(e.target as Node) && setOpen(false);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const markRead = (ids?: string[]) => markNotificationsRead(ids).then(apply, () => {});

  async function turnOnDesktop() {
    const result = permission === "granted" ? "granted" : await Notification.requestPermission();
    setPermission(result);
    writeDesktopPref(result === "granted");
    setDesktop(result === "granted");
  }

  function turnOffDesktop() {
    writeDesktopPref(false);
    setDesktop(false);
  }

  return (
    <div ref={root} className="relative">
      <button
        type="button"
        onClick={() => {
          setOpen((o) => !o);
          setNow(Date.now());
        }}
        aria-expanded={open}
        aria-controls="staff-notifications"
        aria-label={feed.unread > 0 ? `Notifications, ${feed.unread} unread` : "Notifications"}
        className="relative grid size-10 place-items-center rounded-lg text-black/60 hover:bg-black/5 hover:text-black"
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M6 8a6 6 0 1112 0c0 7 3 9 3 9H3s3-2 3-9M10.3 21a1.94 1.94 0 003.4 0" />
        </svg>
        {feed.unread > 0 && (
          <span className="absolute right-1 top-1 grid min-w-4 place-items-center rounded-full bg-blue-600 px-1 text-[10px] font-semibold leading-4 text-white" aria-hidden>
            {feed.unread > 9 ? "9+" : feed.unread}
          </span>
        )}
      </button>

      {open && (
        <div
          id="staff-notifications"
          role="dialog"
          aria-label="Notifications"
          className="fixed inset-x-4 top-16 z-30 mt-1 overflow-hidden rounded-xl border border-black/10 bg-white shadow-xl sm:absolute sm:inset-x-auto sm:right-0 sm:top-full sm:w-96"
        >
          <div className="flex items-center justify-between gap-3 border-b border-black/5 px-4 py-3">
            <p className="text-sm font-semibold">Notifications</p>
            {feed.unread > 0 && (
              <button type="button" onClick={() => markRead()} className="text-xs font-medium text-emerald-700 hover:underline">
                Mark all as read
              </button>
            )}
          </div>

          {feed.items.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-black/50">
              Nothing yet. New booking requests, payments to verify and released holds show up here.
            </p>
          ) : (
            <ul className="max-h-[60vh] divide-y divide-black/5 overflow-y-auto">
              {feed.items.map((n) => (
                <li key={n.id}>
                  <Link
                    href={href(n)}
                    onClick={() => {
                      setOpen(false);
                      if (!n.readAt) markRead([n.id]);
                    }}
                    className={`flex gap-3 px-4 py-3 text-sm hover:bg-black/[0.03] ${n.readAt ? "" : "bg-blue-50/60"}`}
                  >
                    <span className={`mt-1.5 size-2 shrink-0 rounded-full ${n.readAt ? "bg-transparent" : "bg-blue-600"}`} aria-hidden />
                    <span className="min-w-0 flex-1">
                      <span className={`block ${n.readAt ? "text-black/70" : "font-semibold"}`}>{n.title}</span>
                      <span className="mt-0.5 block text-xs text-black/55">{n.body}</span>
                      <span className="mt-1 block text-xs text-black/40">{ago(n.at, now)}</span>
                    </span>
                    {!n.readAt && <span className="sr-only">Unread</span>}
                  </Link>
                </li>
              ))}
            </ul>
          )}

          {permission !== "unsupported" && (
            <div className="border-t border-black/5 bg-black/[0.02] px-4 py-2.5 text-xs text-black/55">
              {permission === "denied" ? (
                "Desktop alerts are blocked for this site in your browser settings."
              ) : desktop && permission === "granted" ? (
                <span className="flex items-center justify-between gap-3">
                  Desktop alerts are on in this browser.
                  <button type="button" onClick={turnOffDesktop} className="font-medium text-black/60 hover:underline">
                    Turn off
                  </button>
                </span>
              ) : (
                <span className="flex items-center justify-between gap-3">
                  Get a desktop alert while this page is open.
                  <button type="button" onClick={turnOnDesktop} className="font-medium text-emerald-700 hover:underline">
                    Turn on
                  </button>
                </span>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
