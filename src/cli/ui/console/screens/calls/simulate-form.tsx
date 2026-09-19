/** Simulate: pick a persona, choose the line, and put a synthetic caller on an agent from the page. */

import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { useNavigate } from "react-router";

import { GatewayError } from "../../../shared/api";
import { useCredentials } from "../../../shared/credentials";
import { Button, Check, Field, Input, Select } from "../../ui";
import { readRoster, startSimulation, type Roster } from "./simulating";
import "./simulate.css";

// How many turns a caller improvises when nobody said: the same six `pinecall simulate` uses.
const TURNS = 6;

// The television behind the caller at the level the hearing calls measured, and no packets lost:
// the same defaults the terminal verb has, so the two doors spoil a line the same way.
const NOISE_DB = 15;
const LOSS_PERCENT = 0;

/**
 * The form. It asks the process holding the agent, through the gateway: a simulation mounts the
 * class of the directory `pinecall start` runs in, so only that process can start one. The call is
 * answered by its id and the page goes to it on the floor — the log is the transcript, and on a
 * spoken line the desk's Listen is the speakers `--listen` never had.
 */
export function SimulateForm({
  agent: fixed,
  agents,
  onClose,
  onStarted,
  spoken,
}: {
  /** The agent to call, when the screen is one agent's. */
  agent?: string | undefined;
  /** The agents to choose from, when the screen is the org's floor. */
  agents?: readonly string[] | undefined;
  /** Where the form closes to; a form that is the screen's own has nowhere to close to. */
  onClose?: (() => void) | undefined;
  /** Told the call's id when it starts, instead of going to it on the floor. */
  onStarted?: ((call: string, agent: string, spoken: boolean) => void) | undefined;
  /** Start on a spoken line: the screen that is for listening opens with the voice on. */
  spoken?: boolean | undefined;
}): ReactNode {
  const credentials = useCredentials();
  const navigate = useNavigate();
  const [agent, setAgent] = useState(fixed ?? agents?.[0] ?? "");
  const [roster, setRoster] = useState<Roster | null>(null);
  const [persona, setPersona] = useState("");
  const [voice, setVoice] = useState(spoken === true);
  const [judge, setJudge] = useState(false);
  const [turns, setTurns] = useState(TURNS);
  const [noise, setNoise] = useState(NOISE_DB);
  const [loss, setLoss] = useState(LOSS_PERCENT);
  const [spoiled, setSpoiled] = useState(false);
  const [starting, setStarting] = useState(false);
  const [refused, setRefused] = useState<string | null>(null);

  // The org's agents arrive after the page does: the first one is picked once there is one.
  const first = agents?.[0] ?? "";
  useEffect(() => {
    if (agent === "" && first !== "") setAgent(first);
  }, [agent, first]);

  useEffect(() => {
    if (agent === "") return;
    let gone = false;
    setRoster(null);
    setRefused(null);
    readRoster(credentials, agent).then(
      (read) => {
        if (gone) return;
        setRoster(read);
        setPersona(read.personas[0]?.name ?? "");
      },
      (failed: unknown) => {
        if (!gone) setRefused(failed instanceof Error ? failed.message : String(failed));
      },
    );
    return () => {
      gone = true;
    };
  }, [credentials, agent]);

  const chosen = roster?.personas.find((one) => one.name === persona);
  const why = whyNot(roster, agent);

  const start = async (event: FormEvent): Promise<void> => {
    event.preventDefault();
    setStarting(true);
    setRefused(null);
    try {
      const call = await startSimulation(credentials, {
        agent,
        persona,
        voice,
        judge,
        turns,
        ...(voice && spoiled ? { background_noise: noise, packet_loss: loss } : {}),
      });
      if (onStarted !== undefined) {
        onStarted(call, agent, voice);
      } else {
        onClose?.();
        void navigate(`/live/${call}`);
      }
    } catch (failed) {
      setRefused(failed instanceof GatewayError ? failed.message : String(failed));
    } finally {
      setStarting(false);
    }
  };

  return (
    <form className="sim" onSubmit={(event) => void start(event)}>
      <div className="sim-head">
        <span className="sim-title">Simulate a caller</span>
        {onClose !== undefined && (
          <button type="button" className="sim-close" onClick={onClose} aria-label="close">
            ×
          </button>
        )}
      </div>
      {agents !== undefined && (
        <Field label="Agent">
          <Select size="sm" value={agent} onChange={(event) => setAgent(event.target.value)}>
            {agents.map((one) => (
              <option key={one} value={one}>
                {one}
              </option>
            ))}
          </Select>
        </Field>
      )}
      {roster === null && refused === null && <p className="sim-note">Asking the process that holds {agent || "the agent"} for its personas…</p>}
      {why !== null && <p className="sim-note">{why}</p>}
      {roster !== null && why === null && (
        <>
          <Field label="Persona">
            <Select size="sm" value={persona} onChange={(event) => setPersona(event.target.value)}>
              {roster.personas.map((one) => (
                <option key={one.name} value={one.name}>
                  {one.name}
                </option>
              ))}
            </Select>
          </Field>
          {chosen !== undefined && <p className="sim-note">Goal: {chosen.goal}</p>}
          <div className="sim-pair">
            <Field label="Max turns">
              <Input size="sm" type="number" min={1} max={30} value={turns} onChange={(event) => setTurns(Number(event.target.value))} />
            </Field>
            {voice && spoiled && (
              <Field label="Noise, dB under">
                <Input size="sm" type="number" min={0} max={60} value={noise} onChange={(event) => setNoise(Number(event.target.value))} />
              </Field>
            )}
            {voice && spoiled && (
              <Field label="Packets lost, %">
                <Input size="sm" type="number" min={0} max={100} value={loss} onChange={(event) => setLoss(Number(event.target.value))} />
              </Field>
            )}
          </div>
          <div className="sim-checks">
            <Check checked={voice} onChange={setVoice}>
              Voice <span className="sim-aside">a real line, and you can listen</span>
            </Check>
            <Check checked={judge} onChange={setJudge}>
              Judge at hang-up
            </Check>
            {voice && (
              <Check checked={spoiled} onChange={setSpoiled}>
                Noisy line <span className="sim-aside">a TV behind the caller, packets lost</span>
              </Check>
            )}
          </div>
          <Button type="submit" kind="primary" size="md" disabled={starting || persona === ""}>
            {starting ? "Calling…" : "Call the agent"}
          </Button>
        </>
      )}
      {refused !== null && <p className="sim-refused">{refused}</p>}
    </form>
  );
}

// The three answers the roster can give that are not "here are the callers", each in one sentence.
function whyNot(roster: Roster | null, agent: string): string | null {
  if (roster === null) return null;
  if (roster.agent === null) return "No agent class in the directory the agent's `pinecall start` runs in, so nothing to simulate against.";
  if (roster.agent !== agent) return `The process holding the agent runs in ${roster.agent}'s directory; a simulated caller is for that agent.`;
  if (roster.personas.length === 0) return "No personas in test/personas: one file per caller, default-exporting one.";
  return null;
}
