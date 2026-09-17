/** The calls that just came in, as small windows in the corner: whichever screen is open, a ringing call is one click from its live log. */

import type { SessionLine } from "@pinecall/protocol";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { useLocation, useNavigate } from "react-router";

import { elapsed, whoOn } from "../lib/format";
import { useOrg } from "../lib/org";
import { isOurs } from "../lib/ours";
import "./ringing.css";

// A corner that fills is a corner nobody reads: three at most, the newest on top.
const AT_MOST = 3;
// A call that ended stays a moment, saying so, and goes.
const ENDED_STAYS_MS = 5000;

interface Notice {
  call: string;
  line: SessionLine;
  ended: boolean;
}

/**
 * The windows. The floor is followed already — the sessions door, asked again the moment the org's
 * event stream says something moved — so a call that was not live on the last read and is live on
 * this one is a new call. The calls live when the page opened are not news, and never pop.
 */
export function Ringing(): ReactNode {
  const { live, lines } = useOrg();
  const navigate = useNavigate();
  const where = useLocation().pathname;
  const known = useRef<Set<string> | null>(null);
  const [notices, setNotices] = useState<Notice[]>([]);
  const now = useNow(notices.length > 0);

  useEffect(() => {
    // The first read of the floor is what was already happening.
    if (known.current === null) {
      if (lines.length === 0 && live.length === 0) return;
      known.current = new Set(live.map((line) => line.call));
      return;
    }
    const seen = known.current;
    // A call this tab started — Talk, Chat, the widget's preview — is not news to whoever started it.
    const arrived = live.filter((line) => !seen.has(line.call) && !isOurs(line.call));
    live.forEach((line) => seen.add(line.call));
    arrived.forEach((line) => seen.add(line.call));
    setNotices((shown) => {
      const refreshed = shown.map((notice) => {
        const current = lines.find((line) => line.call === notice.call);
        return current === undefined ? notice : { ...notice, line: current, ended: !current.live };
      });
      const fresh = arrived.map((line) => ({ call: line.call, line, ended: false }));
      return [...fresh, ...refreshed].slice(0, AT_MOST);
    });
  }, [live, lines]);

  // An ended call's window closes on its own.
  useEffect(() => {
    if (!notices.some((notice) => notice.ended)) return;
    const later = window.setTimeout(() => setNotices((shown) => shown.filter((notice) => !notice.ended)), ENDED_STAYS_MS);
    return () => window.clearTimeout(later);
  }, [notices]);

  const close = (call: string): void => setNotices((shown) => shown.filter((notice) => notice.call !== call));
  // The call already on screen needs no window.
  const shown = notices.filter((notice) => where !== `/live/${notice.call}`);
  if (shown.length === 0) return null;

  return (
    <div className="ring-stack" role="region" aria-label="Calls coming in" aria-live="polite">
      {shown.map((notice) => (
        <div key={notice.call} className={notice.ended ? "ring ring-ended" : "ring"}>
          <button
            type="button"
            className="ring-body"
            onClick={() => {
              close(notice.call);
              void navigate(`/live/${notice.call}`);
            }}
          >
            <span className={notice.ended ? "ring-icon ring-icon-ended" : "ring-icon"} aria-hidden>
              <PhoneGlyph />
            </span>
            <span className="ring-words">
              <span className="ring-top">
                <span className="ring-kicker">{kicker(notice)}</span>
                {!notice.ended && <span className="ring-watch">Watch live →</span>}
              </span>
              <span className="ring-who">{whoOn(notice.line)}</span>
              <span className="ring-sub">
                {notice.line.agent}
                {notice.line.channel !== null && ` · ${notice.line.channel}`}
                {notice.line.direction === "outbound" && " · outbound"}
                {!notice.ended && notice.line.started_at !== null && ` · ${elapsed(notice.line.started_at, now)}`}
              </span>
            </span>
          </button>
          <button type="button" className="ring-close" aria-label="Dismiss" onClick={() => close(notice.call)}>
            ×
          </button>
        </div>
      ))}
    </div>
  );
}

function kicker(notice: Notice): string {
  if (notice.ended) return "Call ended";
  if (notice.line.direction === "outbound") return "Calling out";
  if (notice.line.channel === "web") return "New conversation";
  if (notice.line.channel === "whatsapp") return "New WhatsApp chat";
  return notice.line.status === "active" ? "New call · answered" : "New call ringing";
}

function PhoneGlyph(): ReactNode {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.4 1.8.7 2.7a2 2 0 0 1-.5 2.1L8 9.8a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.5c.9.3 1.8.6 2.7.7a2 2 0 0 1 1.7 2z" />
    </svg>
  );
}

// The clocks on the windows tick without the floor moving.
function useNow(ticking: boolean): number {
  const [now, setNow] = useState(() => Date.now() / 1000);
  useEffect(() => {
    if (!ticking) return;
    const tick = window.setInterval(() => setNow(Date.now() / 1000), 1000);
    return () => window.clearInterval(tick);
  }, [ticking]);
  return now;
}
