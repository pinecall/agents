/** Team: who the org's people are, what each may do, and the invitation that makes one more. */

import { useEffect, useState, type FormEvent, type ReactNode } from "react";

import { GatewayError } from "../../../shared/api";
import { useCredentials } from "../../../shared/credentials";
import { change, invite, readMembers, ROLES, type Invited, type Member } from "./door";
import { MemberRow } from "./member-row";
import "./team.css";

/**
 * The screen. A member is a row, made by a one-use invitation the person accepts with a
 * password; their keys are their own from then on, with the scopes their role presets. Disabling
 * one keeps the row, revokes their keys and refuses their login. Every refusal is the gateway's
 * sentence, verbatim.
 */
export function Team(): ReactNode {
  const credentials = useCredentials();
  const [members, setMembers] = useState<Member[] | null>(null);
  const [invited, setInvited] = useState<Invited | null>(null);
  const [refused, setRefused] = useState<string | null>(null);

  const reread = async (): Promise<void> => setMembers(await readMembers(credentials));

  useEffect(() => {
    let gone = false;
    readMembers(credentials).then(
      (listed) => {
        if (!gone) setMembers(listed);
      },
      (failed: unknown) => {
        if (!gone) setRefused(saidBy(failed));
      },
    );
    return () => {
      gone = true;
    };
  }, [credentials]);

  const changed = async (id: string, said: Parameters<typeof change>[2]): Promise<void> => {
    setRefused(null);
    try {
      await change(credentials, id, said);
      await reread();
    } catch (failed) {
      setRefused(saidBy(failed));
    }
  };

  return (
    <div className="team">
      <h1 className="team-title">Team</h1>
      <p className="team-lede">The org's people: who they are, what their keys may do, and which agents they work on.</p>

      <InviteForm
        onInvite={async (who) => {
          setRefused(null);
          try {
            setInvited(await invite(credentials, who));
            await reread();
          } catch (failed) {
            setRefused(saidBy(failed));
          }
        }}
      />

      {invited !== null && (
        <div className="team-token">
          <p className="team-token-title">
            {invited.member.name} is invited. Send them this link — copy it now: the table keeps the fingerprint, and it is never shown again.
          </p>
          <code className="team-token-code fixed">{invitationLink(invited.token)}</code>
          <p className="team-note fixed">
            one use · dies {invited.expires_at} · it opens a card where they choose their password and take their first key
          </p>
        </div>
      )}

      {refused !== null && <p className="team-note team-refused fixed">{refused}</p>}

      {members !== null && members.length === 0 && (
        <p className="team-note fixed">Nobody is a member yet: the org's machine key alone opens its doors. Invite the first person above.</p>
      )}
      {members !== null && members.length > 0 && (
        <div className="team-panel">
          <div className="team-row team-row-head fixed">
            <span>NAME</span>
            <span>EMAIL</span>
            <span>ROLE</span>
            <span>AGENTS</span>
            <span>STATUS</span>
            <span />
          </div>
          {members.map((member) => (
            <MemberRow key={member.id} member={member} onChange={(said) => changed(member.id, said)} />
          ))}
        </div>
      )}
    </div>
  );
}

/** The three things an invitation names, and the agents when it is not every one of them. */
function InviteForm({ onInvite }: { onInvite: (who: Parameters<typeof invite>[1]) => Promise<void> }): ReactNode {
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [role, setRole] = useState<Member["role"]>("qa");
  const [agents, setAgents] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (event: FormEvent): Promise<void> => {
    event.preventDefault();
    setBusy(true);
    try {
      await onInvite({
        email: email.trim(),
        name: name.trim(),
        role,
        agents: agents.split(/[\s,]+/).filter((one) => one !== ""),
      });
      setEmail("");
      setName("");
      setAgents("");
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="team-invite" onSubmit={(event) => void submit(event)}>
      <p className="team-panel-label fixed">INVITE ONE</p>
      <div className="team-invite-fields">
        <input className="team-input fixed" placeholder="email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} required aria-label="email" />
        <input className="team-input" placeholder="name" value={name} onChange={(event) => setName(event.target.value)} required aria-label="name" />
        <select className="team-input fixed" value={role} onChange={(event) => setRole(event.target.value as Member["role"])} aria-label="role">
          {ROLES.map((one) => (
            <option key={one} value={one}>
              {one}
            </option>
          ))}
        </select>
        <input className="team-input fixed" placeholder="agents · empty is every one" value={agents} onChange={(event) => setAgents(event.target.value)} aria-label="agents" />
        <button className="team-button" type="submit" disabled={busy}>
          {busy ? "inviting…" : "Invite"}
        </button>
      </div>
      <p className="team-note fixed">a role is a preset of what their keys open · qa reads · supervisor sits beside a live call · manager runs the org · admin everything · developer writes the agent</p>
    </form>
  );
}

function saidBy(failed: unknown): string {
  return failed instanceof GatewayError ? failed.message : String(failed);
}

/** Where an invited person opens the console: the card at /invitations/<token>, on this same origin. */
function invitationLink(token: string): string {
  return `${window.location.origin}/invitations/${encodeURIComponent(token)}`;
}
