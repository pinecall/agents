/** What a broken run left on disk: one file per golden that did not hold, opened here. */

import { useEffect, useState, type ReactNode } from "react";

import { GatewayError } from "../../lib/api";
import { useCredentials } from "../../lib/credentials";
import { readReproduction, readWritten, type Reproduction } from "./door";

/**
 * The panel. A suite writes one file per broken golden into `.pinecall/evals/<run>/` in the
 * directory it ran in, and it carries the one thing the log deliberately does not keep: the
 * requests the model answered, verbatim. A green run wrote none, and this says so quietly.
 */
export function Reproductions({ run }: { run: string }): ReactNode {
  const credentials = useCredentials();
  const [goldens, setGoldens] = useState<string[] | null>(null);
  const [folder, setFolder] = useState("");
  const [open, setOpen] = useState<Reproduction | null>(null);
  const [refused, setRefused] = useState<string | null>(null);

  useEffect(() => {
    let gone = false;
    setOpen(null);
    setRefused(null);
    readWritten(credentials, run).then(
      (written) => {
        if (gone) return;
        setGoldens(written.goldens);
        setFolder(written.folder);
      },
      () => {
        // A run with no folder is the common case — every green run — and not worth a warning.
        if (!gone) setGoldens([]);
      },
    );
    return () => {
      gone = true;
    };
  }, [credentials, run]);

  if (goldens === null || goldens.length === 0) return null;

  const read = async (golden: string): Promise<void> => {
    setRefused(null);
    try {
      setOpen(await readReproduction(credentials, run, golden));
    } catch (failed) {
      setRefused(failed instanceof GatewayError ? failed.message : String(failed));
    }
  };

  return (
    <div className="ev-repro">
      <p className="note">
        {goldens.length} reproduction{goldens.length === 1 ? "" : "s"} in <span className="mono">{folder}/</span> — the
        golden as written, every verdict on it, and the requests the model answered.
      </p>
      <span className="chips">
        {goldens.map((golden) => (
          <button key={golden} type="button" className="chip" onClick={() => void read(golden)}>
            <span className="chip-key">golden</span>
            <span className="chip-val">{golden}</span>
          </button>
        ))}
      </span>
      {refused !== null && <p className="note note-warn">{refused}</p>}
      {open !== null && (
        <div className="panel">
          <div className="panel-head">
            <span className="panel-title">
              {open.golden} · {open.model}
            </span>
            <span className="fixed dim">{open.call}</span>
          </div>
          <div className="panel-body">
            {open.verdicts
              .filter((verdict) => !verdict.passed)
              .map((verdict) => (
                <p key={verdict.metric} className="ev-reason">
                  <span className="ev-bad mono">{verdict.metric}</span> {verdict.reason}
                </p>
              ))}
            <pre className="ev-asked mono">{JSON.stringify(open.asked, null, 2)}</pre>
          </div>
        </div>
      )}
    </div>
  );
}
