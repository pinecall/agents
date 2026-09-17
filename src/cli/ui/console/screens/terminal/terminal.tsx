/** Terminal: a `pinecall login` waiting for somebody to say it is theirs, and the approval. */

import { useEffect, useState, type ReactNode } from "react";
import { useSearchParams } from "react-router";

import { GatewayError } from "../../../shared/api";
import { useCredentials } from "../../../shared/credentials";
import { Button } from "../../ui";
import { approve, asking, type Asked } from "./door";
import "./terminal.css";

// The word travels in the query, never in the path: a path is a screen and this is an argument to
// one. `pinecall login` builds the same URL — cli/login.ts, `signingIn`.
const WORD = "c";

// What a terminal that named no machine is called on the card. Rare: `pinecall login` sends this
// machine's hostname, and only a machine with no hostname at all arrives without one.
const A_TERMINAL = "a terminal";

/**
 * The card a person opens from their own terminal.
 *
 * This page holds a key and the terminal holds none, which is the whole point: a password is
 * typed into a browser, where the browser can autofill it and a password manager can hold it, and
 * never into a shell where it lands in a history file. What approving does is mint the TERMINAL
 * its own key — for the same person, labelled as that machine, revoked on its own from Keys — and
 * leave it for the process that printed the word. It never travels through this page.
 */
export function Terminal(): ReactNode {
  const credentials = useCredentials();
  const [params] = useSearchParams();
  const code = params.get(WORD);
  const [asked, setAsked] = useState<Asked | null>(null);
  const [busy, setBusy] = useState(false);
  const [signed, setSigned] = useState<string | null>(null);
  const [refused, setRefused] = useState<string | null>(null);

  useEffect(() => {
    if (code === null) return;
    let gone = false;
    asking(credentials, code).then(
      (found) => {
        if (!gone) setAsked(found);
      },
      (failed: unknown) => {
        if (!gone) setRefused(failed instanceof GatewayError ? failed.message : String(failed));
      },
    );
    return () => {
      gone = true;
    };
  }, [credentials, code]);

  const sign = async (): Promise<void> => {
    if (code === null) return;
    setBusy(true);
    setRefused(null);
    try {
      setSigned(await approve(credentials, code));
    } catch (failed) {
      setRefused(failed instanceof GatewayError ? failed.message : String(failed));
    } finally {
      setBusy(false);
    }
  };

  if (code === null) return <Card title="No terminal is asking" lede={NOTHING_ASKED} />;
  if (signed !== null) {
    return <Card title="Your terminal is signed in" lede={`Go back to it. You are in ${signed}.`} />;
  }
  if (refused !== null && asked === null) return <Card title="That link is no good" lede={refused} />;

  return (
    <Card
      title="Sign this terminal in?"
      lede={`A terminal calling itself ${asked?.device ?? A_TERMINAL} asked to be signed in as you. Approve it only if you just ran "pinecall login" on that machine yourself.`}
    >
      <Button kind="primary" size="lg" onClick={() => void sign()} disabled={busy || asked === null}>
        {busy ? "Signing in…" : "Yes, that is my terminal"}
      </Button>
      {refused !== null && <p className="terminal-refused">{refused}</p>}
    </Card>
  );
}

// A link with no word in it at all: somebody opened /cli by hand, or pasted half of one.
const NOTHING_ASKED = "Run `pinecall login` in your terminal — it prints a link, and that link comes back here.";

/** One panel, centred, because every state of this screen is one sentence and at most one button. */
function Card({ title, lede, children }: { title: string; lede: string; children?: ReactNode }): ReactNode {
  return (
    <div className="terminal">
      <div className="terminal-card">
        <img className="terminal-mark" src="/pinecall-mark.png" alt="" />
        <h1 className="terminal-title">{title}</h1>
        <p className="terminal-lede">{lede}</p>
        {children}
      </div>
    </div>
  );
}
