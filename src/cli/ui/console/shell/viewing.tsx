/** What this tab is looking at, said in one place: which agent, whose copy of it, which world, and who is signed in. */

import type { HeldAgent } from "@pinecall/protocol";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { useLocation, useNavigate } from "react-router";

import { GatewayError } from "../../shared/api";
import { useCredentials } from "../../shared/credentials";
import { meIn, somebodyElses } from "../lib/corners";
import { orgsOf, type OrgOf } from "../lib/login";
import { useHeldAgents } from "../lib/use-held-agents";
import { orgOf, useWhoami } from "../lib/whoami";
import { useWorld } from "../lib/world";
import { WorldToggle } from "./world-toggle";

// The screens under an agent that make sense for every agent. A call or a session in the path is
// one agent's alone, so a move to another agent lands on the screen and drops the id.
const FLEET_SCREENS = new Set(["talk", "chat", "calls", "sessions", "pipeline", "knowledge", "memory", "evals"]);

/** One slug, and every copy of it the gateway holds: this reader's own, the team's, the org's. */
interface Slug {
  slug: string;
  channels: string[];
  copies: HeldAgent[];
}

/** The rows the panel lists: one per slug, copies under it, the reader's own first. */
function slugsOf(agents: HeldAgent[], me: string | null): Slug[] {
  const found = new Map<string, Slug>();
  for (const held of agents) {
    const standing = found.get(held.slug) ?? { slug: held.slug, channels: [], copies: [] };
    standing.copies.push(held);
    for (const channel of held.channels) if (!standing.channels.includes(channel)) standing.channels.push(channel);
    found.set(held.slug, standing);
  }
  for (const one of found.values()) {
    one.copies.sort((a, b) => Number(somebodyElses(a, me)) - Number(somebodyElses(b, me)));
  }
  return [...found.values()].sort((a, b) => a.slug.localeCompare(b.slug));
}

/** Whose a copy is, as the reader says it: "yours", a colleague's name, or the org's. */
function whoseCopy(held: HeldAgent, me: string | null): string {
  const holder = held.holder?.holder;
  if (holder === undefined || holder === null) return "the org's";
  if (holder === me) return "yours";
  return held.holder?.name ?? holder;
}

/** Two letters for a person, or the org's first. */
function initialsOf(words: string): string {
  const parts = words.split(/[\s@._-]+/).filter(Boolean);
  const letters = parts.length > 1 ? `${parts[0]![0]}${parts[1]![0]}` : (parts[0] ?? "?").slice(0, 2);
  return letters.toUpperCase();
}

/**
 * The header's one answer to "what am I looking at". The trigger says the agent, whose copy it is
 * and the world, with the person's initials beside it; the panel lists every agent the gateway
 * holds here, each with the copies the team is running, and the org and the world to turn to.
 *
 * Every screen under an agent is `/a/<slug>/…`, and the door behind it answers in the corner this
 * key opens. A developer sees their own copy; an admin sees the team's and, in the sandbox, opens
 * any of them: every request then carries that member's corner (shared/api.ts), and the gateway
 * resolves each door there. Production has one copy, the org's, the one deployed on the box.
 */
export function Viewing({ agent }: { agent: string }): ReactNode {
  const whose = useWhoami();
  const me = meIn(whose);
  const { world, corner, lookInto } = useWorld();
  const [open, setOpen] = useState(false);
  const [tick, setTick] = useState(0);
  const { agents, loaded } = useHeldAgents(tick);
  const navigate = useNavigate();
  const segments = useLocation().pathname.split("/").filter(Boolean);
  const screen = agent === "" ? "talk" : (segments[2] ?? "talk");
  const kept = FLEET_SCREENS.has(screen) ? screen : "talk";
  const box = useRef<HTMLDivElement>(null);

  // Out of the way on a click anywhere else, or Escape.
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

  const slugs = slugsOf(agents, me);
  const person = whose?.name ?? whose?.label ?? "";
  const org = whose === null ? "the org" : orgOf(whose);
  // An admin's key sees every corner, and in the sandbox it may open any of them.
  const seesTheTeam = world === "sandbox" && whose?.scopes.includes("team") === true;
  const holderOf = (held: HeldAgent): string | null => held.holder?.holder ?? null;
  // Production has one copy, the org's, deployed on the box. The sandbox has one per person, and
  // the one on screen is the colleague's an admin opened, or the reader's own.
  const onScreen = (held: HeldAgent): boolean =>
    world === "production" ? holderOf(held) === null : holderOf(held) === (corner ?? me);
  const opens = (held: HeldAgent): boolean => {
    const holder = holderOf(held);
    if (world === "production") return holder === null;
    return holder !== null && (holder === me || seesTheTeam);
  };
  const labelOf = (held: HeldAgent): string => {
    const holder = holderOf(held);
    if (holder === null) return world === "production" ? `${org} · deployed on the box` : `${org} · shared`;
    if (holder === me) return `${person || "you"} · you`;
    return held.holder?.name ?? holder;
  };
  const here = slugs.find((one) => one.slug === agent);
  const mine = here?.copies.find(onScreen);
  const running = mine !== undefined;
  const lookingAt = corner === null ? undefined : agents.find((held) => holderOf(held) === corner);

  const toggle = (): void => {
    // Opened, the list is read again: a colleague who ran their copy a minute ago is on it.
    if (!open) setTick((n) => n + 1);
    setOpen(!open);
  };

  return (
    <div className="viewing" ref={box}>
      <button type="button" className="viewing-trigger" onClick={toggle} aria-expanded={open} aria-haspopup="dialog">
        <span className={`viewing-dot${agent === "" ? "" : running ? " viewing-dot-up" : " viewing-dot-down"}`} />
        <span className="viewing-agent fixed">{agent === "" ? "choose an agent" : agent}</span>
        {agent !== "" && (
          <span className={`viewing-copy${corner !== null ? " viewing-copy-theirs" : ""}`}>
            {mine !== undefined ? labelOf(mine) : "not running"}
          </span>
        )}
        <span className={`viewing-world viewing-world-${world}`}>{world}</span>
        {whose !== null && (
          <span className="viewing-avatar" title={`${person} · ${orgOf(whose)}`}>
            {initialsOf(person || orgOf(whose))}
          </span>
        )}
        <span className="viewing-caret" aria-hidden>▾</span>
      </button>

      {open && (
        <div className="viewing-panel" role="dialog" aria-label="what this console is looking at">
          {whose !== null && (
            <section className="viewing-section viewing-who">
              <span className="viewing-avatar viewing-avatar-large">{initialsOf(person || orgOf(whose))}</span>
              <span className="viewing-who-lines">
                <span className="viewing-who-name">{person || "an org's key"}</span>
                <span className="viewing-who-sub fixed">
                  {orgOf(whose)} · {whose.key_id}
                </span>
              </span>
            </section>
          )}

          {corner !== null && (
            <section className="viewing-section viewing-looking">
              <span>
                Looking at <b>{lookingAt?.holder?.name ?? corner}</b>'s copy
              </span>
              <button type="button" className="viewing-back" onClick={() => lookInto(null)}>
                back to yours
              </button>
            </section>
          )}

          <section className="viewing-section viewing-where">
            <OrgPick />
            <WorldToggle />
          </section>

          <section className="viewing-section">
            <div className="viewing-heading">
              agents in {whose === null ? "this org" : orgOf(whose)} · {world}
            </div>
            {loaded && slugs.length === 0 && (
              <div className="viewing-empty">
                Nothing is running here. <span className="fixed">pinecall run</span> in an agent's folder puts it on
                this list.
              </div>
            )}
            <ul className="viewing-list">
              {slugs.map((one) => (
                <li key={one.slug} className="viewing-agent-block">
                  <div className="viewing-agent-head">
                    <span className="viewing-row-slug fixed">{one.slug}</span>
                    <span className="viewing-row-sub">{one.channels.join(" · ") || "no doors"}</span>
                  </div>
                  {one.copies.map((held) => {
                    const holder = holderOf(held);
                    const current = onScreen(held) && one.slug === agent;
                    const openable = opens(held);
                    const who = labelOf(held);
                    return (
                      <button
                        key={holder ?? "org"}
                        type="button"
                        className={`viewing-row${current ? " viewing-row-here" : ""}`}
                        disabled={!openable}
                        title={openable ? undefined : "their copy: it answers them, and they open it from their own console"}
                        onClick={() => {
                          setOpen(false);
                          if (world === "sandbox") lookInto(holder === me ? null : holder);
                          if (one.slug !== agent) void navigate(`/a/${one.slug}/${kept}`);
                        }}
                      >
                        <span className="viewing-dot viewing-dot-up" />
                        <span className="viewing-avatar viewing-avatar-small">{initialsOf(holder === me ? person || who : who)}</span>
                        <span className="viewing-row-main">
                          <span className="viewing-row-who">{who}</span>
                        </span>
                        <span className={`viewing-world viewing-world-${world}`}>{world}</span>
                        <span className="viewing-check">{current ? "viewing" : openable ? "open" : "theirs"}</span>
                      </button>
                    );
                  })}
                </li>
              ))}
            </ul>
          </section>
        </div>
      )}
    </div>
  );
}

/**
 * The person's orgs, as a row of choices. Nothing for a person of one org or for a machine key:
 * the gateway refuses the listing for a key that names nobody, and this stays out of the way.
 */
function OrgPick(): ReactNode {
  const credentials = useCredentials();
  const { moveTo } = useWorld();
  const [orgs, setOrgs] = useState<OrgOf[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [refused, setRefused] = useState<string | null>(null);

  useEffect(() => {
    let gone = false;
    orgsOf(credentials).then(
      (listed) => {
        if (!gone) setOrgs(listed);
      },
      () => {
        if (!gone) setOrgs(null);
      },
    );
    return () => {
      gone = true;
    };
  }, [credentials]);

  if (orgs === null || orgs.length < 2) return null;
  const move = async (org: OrgOf): Promise<void> => {
    if (busy || org.here) return;
    setBusy(true);
    setRefused(null);
    try {
      await moveTo(org.org);
    } catch (failed) {
      setRefused(failed instanceof GatewayError ? failed.message : String(failed));
      setBusy(false);
    }
  };

  return (
    <span className="world">
      <span className="world-switch fixed" role="group" aria-label="which org">
        {orgs.map((one) => (
          <button
            key={one.org}
            type="button"
            className={one.here ? "world-option world-option-here" : "world-option"}
            onClick={() => void move(one)}
            disabled={busy}
            aria-pressed={one.here}
            title={one.role}
          >
            {one.slug ?? one.name ?? one.org}
          </button>
        ))}
      </span>
      {refused !== null && <span className="world-refused fixed">{refused}</span>}
    </span>
  );
}
