/** Team: who the org's people are, what each may do, and the invitation that makes one more. */

import { useEffect, useState, type FormEvent, type ReactNode } from "react";

import { GatewayError } from "../../../shared/api";
import { useCredentials } from "../../../shared/credentials";
import { Button, Card, CardHead, Empty, Field, Input, Page, PageHead, Refused, Select, TableHead } from "../../ui";
import { change, invite, readMembers, resetLink, ROLES, type Invited, type Member } from "./door";
import { COLUMNS, MemberRow } from "./member-row";
import { Roles } from "./roles";
import { SingleSignOn } from "./sso";
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
  const [invited, setInvited] = useState<{ link: Invited; kind: "invitation" | "reset" } | null>(null);
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

  // An invitation, first or again: the gateway mints a fresh one-use link for an email it already
  // holds as invited, and takes no second seat for it.
  const inviteOne = async (who: Parameters<typeof invite>[1]): Promise<void> => {
    setRefused(null);
    try {
      setInvited({ link: await invite(credentials, who), kind: "invitation" });
      await reread();
    } catch (failed) {
      setRefused(saidBy(failed));
    }
  };

  const reset = async (id: string): Promise<void> => {
    setRefused(null);
    try {
      setInvited({ link: await resetLink(credentials, id), kind: "reset" });
    } catch (failed) {
      setRefused(saidBy(failed));
    }
  };

  return (
    <Page width={1060} tight>
      <PageHead title="Team" lede="The org's people: who they are, what their keys may do, and which agents they work on." />

      <InviteForm onInvite={inviteOne} />

      {invited !== null && <InvitationLink invited={invited.link} kind={invited.kind} onClose={() => setInvited(null)} />}

      <Refused>{refused}</Refused>

      {members !== null && (
        <Card>
          {members.length === 0 ? (
            <Empty>Nobody is a member yet: the org's machine key alone opens its doors. Invite the first person above.</Empty>
          ) : (
            <>
              <TableHead columns={COLUMNS} labels={["Name", "Email", "Role", "Agents", "Status>", ""]} />
              {members.map((member) => (
                <MemberRow
                  key={member.id}
                  member={member}
                  onChange={(said) => changed(member.id, said)}
                  onResend={() => inviteOne({ email: member.email, name: member.name, role: member.role, agents: member.agents })}
                  onReset={() => reset(member.id)}
                />
              ))}
            </>
          )}
        </Card>
      )}

      <Roles />
      <SingleSignOn />
    </Page>
  );
}

/** The link an invitation is, shown the one time it exists in the clear. */
function InvitationLink({ invited, kind, onClose }: { invited: Invited; kind: "invitation" | "reset"; onClose: () => void }): ReactNode {
  const link = invitationLink(invited.token);
  const [copied, setCopied] = useState(false);
  return (
    <Card>
      <CardHead title={kind === "reset" ? `A new password for ${invited.member.name}` : `${invited.member.name} is invited`} meta="copy it now: the table keeps the fingerprint, and it is never shown again">
        <span className="team-link-moves">
          <Button
            size="xs"
            onClick={() => {
              void navigator.clipboard.writeText(link).then(() => setCopied(true));
            }}
          >
            {copied ? "Copied" : "Copy"}
          </Button>
          <Button size="xs" onClick={onClose}>
            Done
          </Button>
        </span>
      </CardHead>
      <pre className="ui-code">{link}</pre>
      <div className="ui-card-foot">
        {kind === "reset"
          ? `One use · dies ${invited.expires_at} · hand it to them: it opens the card where they choose a new password. Any older link of theirs no longer opens.`
          : `One use · dies ${invited.expires_at} · it opens a card where they choose their password and take their first key.`}
      </div>
    </Card>
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
    <Card pad>
      <form className="ui-form" onSubmit={(event) => void submit(event)}>
        <Field label="Email" grow minWidth={180}>
          <Input placeholder="name@company.com" type="email" value={email} onChange={(event) => setEmail(event.target.value)} required />
        </Field>
        <Field label="Name" grow minWidth={150}>
          <Input placeholder="Full name" value={name} onChange={(event) => setName(event.target.value)} required />
        </Field>
        <Field label="Role" minWidth={130}>
          <Select value={role} onChange={(event) => setRole(event.target.value as Member["role"])}>
            {ROLES.map((one) => (
              <option key={one} value={one}>
                {one}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Agents" minWidth={150}>
          <Input placeholder="every agent" value={agents} onChange={(event) => setAgents(event.target.value)} />
        </Field>
        <Button kind="primary" size="form" type="submit" disabled={busy}>
          {busy ? "Inviting…" : "Invite"}
        </Button>
      </form>
      <div className="team-roles">A role is a preset of what their keys open — the Roles table below says what each one does.</div>
    </Card>
  );
}

function saidBy(failed: unknown): string {
  return failed instanceof GatewayError ? failed.message : String(failed);
}

/** Where an invited person opens the console: the card at /invitations/<token>, on this same origin. */
function invitationLink(token: string): string {
  return `${window.location.origin}/invitations/${encodeURIComponent(token)}`;
}
