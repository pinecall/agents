/** Lexicon: the org's words — how the voice says them, what the ears must know — shared by every agent. */

import { useEffect, useState, type FormEvent, type ReactNode } from "react";

import type { LexiconAnswer, LexiconBody, LexiconRow } from "@pinecall/protocol";

import { useCredentials } from "../../../shared/credentials";
import { dayAndTime } from "../../lib/format";
import { MODE } from "../../lib/mode";
import { Button, Card, CardHead, Check, Empty, Input, Page, PageHead, Refused, TextAction } from "../../ui";
import { promoteLexicon, readLexicon, setLexicon } from "./door";
import "../pipeline/pipeline.css";
import "./lexicon.css";

function saidBy(failed: unknown): string {
  return failed instanceof Error ? failed.message : String(failed);
}

/** The lexicon as a person edits it: the said pairs in order, and the heard words. */
interface Words {
  said: { word: string; spoken: string }[];
  heard: string[];
}

function wordsOf(row: LexiconRow | null): Words {
  return { said: [...(row?.lexicon.said ?? [])], heard: [...(row?.lexicon.heard ?? [])] };
}

// The person who hears a brand said wrong forty times a day fixes it here, without a developer
// and without a deploy: a supervisor's key opens this page. The gateway's console is production,
// written by promote alone, so there the page reads and promotes; the sandbox's console sets.
export function Lexicon(): ReactNode {
  const credentials = useCredentials();
  const [answer, setAnswer] = useState<LexiconAnswer | null>(null);
  const [words, setWords] = useState<Words>({ said: [], heard: [] });
  const [team, setTeam] = useState(false);
  const [word, setWord] = useState("");
  const [spoken, setSpoken] = useState("");
  const [hear, setHear] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState<string | null>(null);
  const [refused, setRefused] = useState<string | null>(null);
  const [said, setSaid] = useState<string | null>(null);
  const production = MODE === "hosted";

  useEffect(() => {
    let gone = false;
    readLexicon(credentials).then(
      (read) => {
        if (gone) return;
        setAnswer(read);
        setWords(wordsOf(read.yours ?? read.team));
      },
      (failed: unknown) => !gone && setRefused(saidBy(failed)),
    );
    return () => {
      gone = true;
    };
  }, [credentials]);

  const standing = answer === null ? null : team ? answer.team : answer.yours;

  const save = async (event: FormEvent): Promise<void> => {
    event.preventDefault();
    if (answer === null) return;
    setSaving("Saving…");
    setRefused(null);
    const body: LexiconBody = { said: words.said, heard: words.heard };
    try {
      const kept = await setLexicon(credentials, body, standing?.version ?? null, note.trim() === "" ? null : note.trim(), team);
      setAnswer(kept);
      setWords(wordsOf(team ? kept.team : (kept.yours ?? kept.team)));
      setNote("");
      setSaid("Kept as the next version. Every agent of the org says it from its next call in this corner.");
    } catch (failed) {
      setRefused(saidBy(failed));
    } finally {
      setSaving(null);
    }
  };

  const promote = async (to: "team" | "production"): Promise<void> => {
    setSaving("Promoting…");
    setRefused(null);
    try {
      const promoted = await promoteLexicon(credentials, to);
      setSaid(`${to === "production" ? "Production" : "The team's sandbox"} is at v${promoted.version}: every agent says it from the next call.`);
      setAnswer(await readLexicon(credentials));
    } catch (failed) {
      setRefused(saidBy(failed));
    } finally {
      setSaving(null);
    }
  };

  const add = (): void => {
    if (word.trim() === "" || spoken.trim() === "") return;
    setWords({ ...words, said: [...words.said.filter((one) => one.word !== word.trim()), { word: word.trim(), spoken: spoken.trim() }] });
    setWord("");
    setSpoken("");
  };

  const addHeard = (): void => {
    const more = hear
      .split(/[,\n]/)
      .map((one) => one.trim())
      .filter((one) => one !== "" && !words.heard.includes(one));
    if (more.length > 0) setWords({ ...words, heard: [...words.heard, ...more] });
    setHear("");
  };

  return (
    <Page width={1060} tight>
      <PageHead
        title="Lexicon"
        ledeWidth={640}
        lede="The org's words, laid over every agent's own: how the voice says a brand, a surname, an acronym, and which words the ears must know. Whole and versioned; a word said wrong is fixed by whoever hears it."
      />

      <Card>
        <CardHead title="Where every corner is" meta={answer?.world}>
          {answer !== null && !production && answer.yours !== null && (
            <Button size="sm" onClick={() => void promote("team")} disabled={saving !== null}>
              Promote yours to the team
            </Button>
          )}
          {answer !== null && !production && answer.team !== null && (
            <Button size="sm" onClick={() => void promote("production")} disabled={saving !== null}>
              Promote the team's to production
            </Button>
          )}
        </CardHead>
        {answer === null ? (
          <Empty>{refused ?? "Asking the gateway…"}</Empty>
        ) : (
          <div className="lex-corners">
            {(["yours", "team", "production"] as const).map((name) => (
              <span key={name}>
                <b>{name}</b> {answer[name] === null ? "nothing set" : `v${answer[name]!.version} · ${answer[name]!.author} · ${dayAndTime(answer[name]!.set_at)}`}
              </span>
            ))}
          </div>
        )}
      </Card>

      {answer !== null && (
        <form className="ui-card" onSubmit={(event) => void save(event)}>
          <div className="ui-card-head">
            <span className="ui-card-title">{production ? "What production says" : "The words"}</span>
            {!production && (
              <Check checked={team} onChange={(on) => { setTeam(on); setWords(wordsOf(on ? answer.team : (answer.yours ?? answer.team))); }}>
                the team's corner
              </Check>
            )}
          </div>
          <div className="lex-body">
            <div className="lex-said">
              <div className="ui-label">Said</div>
              {words.said.length === 0 && <div className="pipe-note">No word is said any other way than written.</div>}
              {words.said.map((one) => (
                <div key={one.word} className="lex-pair">
                  <span className="lex-word">{one.word}</span>
                  <span className="lex-arrow">→</span>
                  <span className="lex-spoken">“{one.spoken}”</span>
                  {!production && (
                    <TextAction danger onClick={() => setWords({ ...words, said: words.said.filter((kept) => kept.word !== one.word) })}>
                      Remove
                    </TextAction>
                  )}
                </div>
              ))}
              {!production && (
                <div className="lex-add">
                  <Input size="sm" value={word} placeholder="the word, as written" onChange={(event) => setWord(event.target.value)} />
                  <Input size="sm" value={spoken} placeholder="how it is said" onChange={(event) => setSpoken(event.target.value)} />
                  <Button size="sm" onClick={add}>
                    Add
                  </Button>
                </div>
              )}
            </div>
            <div className="lex-heard">
              <div className="ui-label">Heard</div>
              {words.heard.length === 0 && <div className="pipe-note">The ears know only what each class declares.</div>}
              <div className="lex-chips">
                {words.heard.map((one) => (
                  <span key={one} className="ui-pill-muted lex-chip">
                    {one}
                    {!production && (
                      <TextAction onClick={() => setWords({ ...words, heard: words.heard.filter((kept) => kept !== one) })}>×</TextAction>
                    )}
                  </span>
                ))}
              </div>
              {!production && (
                <div className="lex-add">
                  <Input size="sm" value={hear} placeholder="words the ears must know, comma-separated" onChange={(event) => setHear(event.target.value)} />
                  <Button size="sm" onClick={addHeard}>
                    Add
                  </Button>
                </div>
              )}
            </div>
          </div>
          {!production && (
            <div className="pipe-save">
              <Input value={note} placeholder="why, for the history" onChange={(event) => setNote(event.target.value)} />
              <Button kind="primary" size="form" type="submit" disabled={saving !== null}>
                {saving ?? "Save as the next version"}
              </Button>
            </div>
          )}
        </form>
      )}

      {said !== null && <div className="ui-empty">{said}</div>}
      <Refused>{refused}</Refused>
    </Page>
  );
}
