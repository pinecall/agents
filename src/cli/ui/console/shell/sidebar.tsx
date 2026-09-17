/** The sidebar: the workspace, search, the agents, the floor, the settings, and who is signed in. */

import { useEffect, useRef, useState, type ReactNode } from "react";
import { NavLink, useLocation } from "react-router";

import { GatewayError } from "../../shared/api";
import { BOX_SCREENS, MODE, ORG_SCREENS, screensOf, type Group, type Screen } from "../lib/mode";
import { useOrg } from "../lib/org";
import { opens } from "../lib/scopes";
import { orgOf, useScopes, useWhoami } from "../lib/whoami";
import { useWorld } from "../lib/world";
import { Icon, initialsOf } from "../ui";

const GROUPS: readonly { group: Group; label: string }[] = [
  { group: "gateway", label: MODE === "local" ? "Sandbox" : "Gateway" },
  { group: "settings", label: "Settings" },
  { group: "box", label: "Box" },
];

export function Sidebar({ agent, onSearch }: { agent: string; onSearch: () => void }): ReactNode {
  const [folded, setFolded] = useState(false);
  const scopes = useScopes();
  const whose = useWhoami();
  const { agents, live, lines, here, insights, operator } = useOrg();
  const open = (screen: Screen): boolean => scopes === null || opens(scopes, screen.key);
  const person = whose?.name ?? whose?.label ?? "";
  const role = here?.role ?? (whose === null ? "" : whose.subject === null || whose.subject === undefined ? "a machine's key" : "");

  const badge = (screen: Screen): { text: string; live: boolean } | null => {
    if (screen.key === "agents" && agents.length > 0) return { text: String(agents.length), live: false };
    if (screen.key === "live" && live.length > 0) return { text: `${live.length} live`, live: true };
    if (screen.key === "sessions" && insights !== null) return { text: String(insights.sessions_total), live: false };
    if (screen.key === "sessions" && lines.length > 0) return { text: lines.length >= 200 ? "200+" : String(lines.length), live: false };
    return null;
  };

  return (
    <aside className={folded ? "side side-folded" : "side"} aria-label="Screens">
      <Workspace />

      <div className="side-search-wrap">
        <button type="button" className="side-search" onClick={onSearch} title="Search">
          <Icon name="search" size={15} />
          <span className="side-label">Search</span>
          <span className="side-kbd">⌘K</span>
        </button>
      </div>

      <nav className="side-nav">
        <div className="side-group side-group-first">Agents</div>
        {agents.length === 0 && <div className="side-none side-name">none held here</div>}
        {agents.map((held) => {
          const isLive = live.some((line) => line.agent === held.slug);
          const on = held.slug === agent;
          return (
            <NavLink key={held.slug} to={`/a/${held.slug}/talk`} title={held.slug} className={on ? "side-link side-link-on" : "side-link"}>
              <span className={isLive && !on ? "side-icon side-icon-live" : "side-icon"}>
                <Icon name="bot" />
              </span>
              <span className="side-name side-name-agent">{held.slug}</span>
              {isLive && <span className="side-badge side-badge-live">live</span>}
            </NavLink>
          );
        })}

        {GROUPS.map(({ group, label }) => {
          const screens = screensOf([...ORG_SCREENS, ...BOX_SCREENS], MODE, operator === true).filter((screen) => screen.group === group && open(screen));
          if (screens.length === 0) return null;
          return (
            <div key={group}>
              <div className="side-group">{label}</div>
              {screens.map((screen) => {
                const count = badge(screen);
                return (
                  <NavLink
                    key={screen.key}
                    to={`/${screen.path}`}
                    end={screen.path === ""}
                    title={screen.name}
                    className={({ isActive }) => (isActive && agent === "" ? "side-link side-link-on" : "side-link")}
                  >
                    <span className="side-icon">{screen.icon !== undefined && <Icon name={screen.icon} />}</span>
                    <span className="side-name">{screen.name}</span>
                    {count !== null && <span className={count.live ? "side-badge side-badge-live" : "side-badge"}>{count.text}</span>}
                  </NavLink>
                );
              })}
            </div>
          );
        })}
      </nav>

      <div className="side-foot">
        <div className="side-user" title={person}>
          <span className="side-user-avatar">{initialsOf(person || (whose === null ? "?" : orgOf(whose)))}</span>
          <span className="side-label">
            <span className="side-user-name">{person || "—"}</span>
            <span className="side-user-role">{capitalised(role)}</span>
          </span>
        </div>
        <button type="button" className="side-fold" onClick={() => setFolded(!folded)} title={folded ? "Open the sidebar" : "Collapse the sidebar"}>
          <Icon name="panel" size={15} />
        </button>
      </div>
    </aside>
  );
}

function capitalised(word: string): string {
  return word === "" ? "" : word.charAt(0).toUpperCase() + word.slice(1);
}

/** The org this console is in, how many agents it holds, and — on the gateway's page — the move to another of the person's. */
function Workspace(): ReactNode {
  const whose = useWhoami();
  const { agents, orgs } = useOrg();
  const { moveTo } = useWorld();
  const [open, setOpen] = useState(false);
  const [refused, setRefused] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const path = useLocation().pathname;

  useEffect(() => setOpen(false), [path]);
  useEffect(() => {
    if (!open) return;
    const away = (event: MouseEvent): void => {
      if (box.current !== null && !box.current.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", away);
    return () => document.removeEventListener("mousedown", away);
  }, [open]);

  const org = whose === null ? "" : orgOf(whose);
  // Another org is another key: the gateway's console mints it, a machine's is its profile's (`pinecall use`).
  const canMove = MODE === "hosted" && orgs !== null && orgs.length > 1;

  const move = async (target: string): Promise<void> => {
    setBusy(true);
    setRefused(null);
    try {
      await moveTo(target);
    } catch (failed) {
      setRefused(failed instanceof GatewayError ? failed.message : String(failed));
      setBusy(false);
    }
  };

  return (
    <div ref={box} className="side-workspace-wrap">
      <button type="button" className="side-workspace" onClick={() => canMove && setOpen(!open)} title={org} aria-expanded={open}>
        <span className="side-tile">{initialsOf(org || "?").slice(0, 1)}</span>
        <span className="side-label">
          <span className="side-org">{org || "…"}</span>
          <span className="side-org-sub">
            {whose?.visiting === true ? "visiting as operator · " : ""}
            {agents.length} {agents.length === 1 ? "agent" : "agents"}
          </span>
        </span>
        <span className="side-caret">▾</span>
      </button>
      {open && orgs !== null && (
        <div className="side-orgs" role="menu">
          {[
            { label: "Your organizations", rows: orgs.filter((one) => one.member !== false) },
            { label: "Every other org on this box · as operator", rows: orgs.filter((one) => one.member === false) },
          ]
            .filter((group) => group.rows.length > 0)
            .map((group) => (
              <div key={group.label}>
                <div className="side-orgs-label">{group.label}</div>
                {group.rows.map((one) => (
                  <button key={one.org} type="button" className="side-org-row" disabled={busy || one.here} onClick={() => void move(one.org)}>
                    <span className="side-tile">{initialsOf(one.slug ?? one.name ?? one.org).slice(0, 1)}</span>
                    <span className="ui-clip">{one.slug ?? one.name ?? one.org}</span>
                    <span className="side-org-role">{one.here ? "here" : one.role}</span>
                  </button>
                ))}
              </div>
            ))}
          {refused !== null && <div className="ui-refused" style={{ padding: "6px 8px" }}>{refused}</div>}
        </div>
      )}
    </div>
  );
}
