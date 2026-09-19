/** What this tab is looking at, said in one place: which agent, whose copy, which world, who is signed in. */

import type { HeldAgent } from "@pinecall/protocol";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { useLocation, useNavigate } from "react-router";

import { GatewayError } from "../../shared/api";
import { meIn, somebodyElses } from "../lib/corners";
import { gatewayOrigin, MODE } from "../lib/mode";
import { useOrg } from "../lib/org";
import { orgOf, useWhoami } from "../lib/whoami";
import { useWorld } from "../lib/world";
import { Avatar, Choice, Dot, Pill } from "../ui";

// The screens under an agent that make sense for every agent. A call or a session in the path is
// one agent's alone, so a move to another agent lands on the screen and drops the id.
const FLEET_SCREENS = new Set(["talk", "chat", "dev-chat", "calls", "sessions", "pipeline", "knowledge", "memory", "evals", "widget"]);

// Where the sandbox is watched: the sidecar on this machine (src/cli/serve/sidecar.ts's port).
const SIDECAR = "http://localhost:4100";

/**
 * The top bar's one answer to "what am I looking at".
 *
 * The environment is not a toggle inside one page: the gateway's console looks at production and
 * `pinecall serve` at the sandbox (lib/mode.ts). So the two chips are the two consoles — the one
 * this tab is, and a link to the other.
 */
export function Switcher({ agent }: { agent: string }): ReactNode {
  const whose = useWhoami();
  const me = meIn(whose);
  const { world, corner, lookInto } = useWorld();
  const { held, agentsLoaded } = useOrg();
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const box = useRef<HTMLDivElement>(null);
  const segments = pathname.split("/").filter(Boolean);
  const kept = agent !== "" && FLEET_SCREENS.has(segments[2] ?? "") ? (segments[2] as string) : "talk";

  useEffect(() => setOpen(false), [pathname]);
  useEffect(() => {
    if (!open) return;
    const away = (event: MouseEvent): void => {
      if (box.current !== null && !box.current.contains(event.target as Node)) setOpen(false);
    };
    const escape = (event: KeyboardEvent): void => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", away);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("mousedown", away);
      document.removeEventListener("keydown", escape);
    };
  }, [open]);

  const person = whose?.name ?? whose?.label ?? "";
  const org = whose === null ? "this org" : orgOf(whose);
  const production = world === "production";
  const seesTheTeam = !production && whose?.scopes.includes("team") === true;
  const holderOf = (one: HeldAgent): string | null => one.holder?.holder ?? null;
  const openable = (one: HeldAgent): boolean => (production ? holderOf(one) === null : holderOf(one) !== null && (holderOf(one) === me || seesTheTeam));
  const onScreen = (one: HeldAgent): boolean => one.slug === agent && (production ? holderOf(one) === null : holderOf(one) === (corner ?? me));
  const whoseLine = (one: HeldAgent): string => {
    const holder = holderOf(one);
    if (holder === null) return production ? `${org} · deployed on the box` : `${org} · shared`;
    if (holder === me) return `${person || "you"} · you`;
    return `${one.holder?.name ?? holder} · theirs`;
  };
  const copies = [...held].sort(
    (a, b) => a.slug.localeCompare(b.slug) || Number(somebodyElses(a, me)) - Number(somebodyElses(b, me)),
  );
  const lookingAt = corner === null ? undefined : held.find((one) => holderOf(one) === corner);

  // The other console: this machine's sidecar from the gateway's page, the gateway from the sidecar's.
  const elsewhere = (): void => {
    const target = MODE === "hosted" ? SIDECAR : gatewayOrigin();
    window.open(`${target}${pathname}`, "_blank", "noopener");
  };

  return (
    <div ref={box} style={{ position: "relative" }}>
      <button
        type="button"
        className={open ? "switch-trigger switch-trigger-open" : "switch-trigger"}
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        aria-haspopup="dialog"
      >
        <Dot tone={production ? "green" : "amber"} />
        <span className="switch-agent">{agent === "" ? "choose an agent" : agent}</span>
        <Pill tone={production ? "green" : "amber"}>{world}</Pill>
        {whose !== null && <Avatar name={person || org} tint="violet" size={20} />}
        <span className="switch-caret" aria-hidden>
          ▾
        </span>
      </button>

      {open && (
        <div className="switch-panel" role="dialog" aria-label="what this console is looking at">
          {whose !== null && (
            <div className="switch-who">
              <Avatar name={person || org} tint="violet" size={36} />
              <div style={{ minWidth: 0 }}>
                <div className="switch-who-name">{person || "an org's key"}</div>
                <div className="switch-who-sub">
                  {org} · key {whose.key_id}
                </div>
              </div>
            </div>
          )}

          {corner !== null && (
            <div className="switch-looking">
              <span style={{ flex: 1 }}>
                Looking at <b>{lookingAt?.holder?.name ?? corner}</b>'s copy
              </span>
              <button type="button" className="ui-text-action" onClick={() => lookInto(null)}>
                Back to yours
              </button>
            </div>
          )}

          <div className="switch-where">
            <Orgs />
            <div>
              <div className="switch-label">Environment</div>
              <div className="switch-choices">
                <Choice on={production} onClick={production ? undefined : elsewhere}>
                  production
                </Choice>
                <Choice on={!production} onClick={production ? elsewhere : undefined}>
                  sandbox
                </Choice>
              </div>
              <div className="switch-note">
                {production ? (
                  <>
                    Your sandbox copies are watched on your machine: <span className="ui-fixed">pinecall serve</span>, then sandbox.
                  </>
                ) : (
                  <>Production is watched on the gateway's console, signed in to.</>
                )}
              </div>
            </div>
          </div>

          <div className="switch-agents">
            <div className="switch-label">
              agents in {org} · {world}
            </div>
            {agentsLoaded && copies.length === 0 && (
              <div className="switch-empty">
                {MODE === "local" ? (
                  <>
                    Nothing is running here. <span className="ui-fixed">pinecall start</span> in a project puts its agents on this list.
                  </>
                ) : (
                  <>
                    Nothing is running in production: <span className="ui-fixed">pinecall start --prod</span> on your server holds it, on a server token.
                  </>
                )}
              </div>
            )}
            <div className="switch-list">
              {copies.map((one) => {
                const holder = holderOf(one);
                const can = openable(one);
                const here = onScreen(one);
                return (
                  <button
                    key={`${one.slug}:${holder ?? "org"}`}
                    type="button"
                    className={here ? "switch-card switch-card-here" : "switch-card"}
                    disabled={!can}
                    title={can ? undefined : "their copy: it answers them, and they open it from their own console"}
                    onClick={() => {
                      setOpen(false);
                      if (!production) lookInto(holder === me ? null : holder);
                      if (one.slug !== agent) void navigate(`/a/${one.slug}/${kept}`);
                    }}
                  >
                    <Dot tone="green" />
                    <span style={{ minWidth: 0, flex: 1 }}>
                      <span className="switch-card-name">{one.slug}</span>
                      <span className="switch-card-sub">
                        {whoseLine(one)} · {one.channels.join(" · ") || "no doors"}
                      </span>
                    </span>
                    <span className="switch-card-open">{here ? "Viewing" : can ? "Open" : "Theirs"}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/** The person's orgs, on the gateway's page and only when there are two or more of them. */
function Orgs(): ReactNode {
  const { orgs } = useOrg();
  const { moveTo } = useWorld();
  const [busy, setBusy] = useState(false);
  const [refused, setRefused] = useState<string | null>(null);
  if (MODE !== "hosted" || orgs === null || orgs.length < 2) return null;

  const move = async (org: string): Promise<void> => {
    setBusy(true);
    setRefused(null);
    try {
      await moveTo(org);
    } catch (failed) {
      setRefused(failed instanceof GatewayError ? failed.message : String(failed));
      setBusy(false);
    }
  };

  return (
    <div>
      <div className="switch-label">Organization</div>
      <div className="switch-choices">
        {orgs.map((one) => (
          <Choice key={one.org} on={one.here} disabled={busy} title={one.member === false ? "as the box's operator" : one.role} onClick={() => !one.here && void move(one.org)}>
            {one.slug ?? one.name ?? one.org}
          </Choice>
        ))}
      </div>
      {refused !== null && <div className="ui-refused" style={{ marginTop: 6 }}>{refused}</div>}
    </div>
  );
}
