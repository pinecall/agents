/** `pinecall voices`: a vendor's voices in a language, and one of them said out loud on this machine. */

import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";
import { parseArgs } from "node:util";

import { signed } from "../client/signed.js";
import { theDoor } from "./env.js";
import type { Group } from "./groups.js";
import { asked, Refused, type Door } from "./testing/gateway.js";
import { refusal } from "./whoami.js";

const USAGE = `usage: pinecall voices [--tts cartesia] [--language es] [--country ES]
       pinecall voices play <voice> ["the words"] [--tts cartesia] [--model sonic-3] [--language es] [--save file.wav]`;

// The vendor a person means when they name none: Cartesia is the one whose catalogue is read from
// the vendor, and the reason this verb exists — its ids are uuids nobody could type from memory.
const A_VENDOR = "cartesia";
const A_SENTENCE = "Hola, gracias por llamar. ¿En qué le puedo ayudar?";

export const group: Group = {
  purpose: "a voice vendor's voices, and any one of them heard on this machine before it is chosen",
  usage: `${USAGE}

  With nothing after it: the vendor's voices in that language, one per line — the id the agent's
  voice setting takes, the name, gender, and where the accent is from (ES is Spain, MX Mexico), so
  a Spanish agent that should sound like Madrid is not given a voice from Monterrey. --country
  keeps only the voices from there.

  play says the words in that voice, through the vendor's own plugin exactly as a call would, and
  plays them here — afplay, ffplay, play, aplay or pw-play, whichever this machine has — with how
  long the vendor took to start and to finish. It runs on the org's own key for the vendor when
  it brought one (pinecall providers add), and on the box's otherwise. --save keeps the WAV.

  The voice it plays is chosen with pinecall agent set --tts cartesia --voice <id>.`,
  run,
};

/** What the verb can be told besides the argv: where to print, which environment, how to play. */
export interface Choosing {
  out?: NodeJS.WritableStream;
  err?: NodeJS.WritableStream;
  env?: NodeJS.ProcessEnv;
  /** How a WAV is heard. A test hands one in rather than driving a speaker. */
  play?: (wav: Uint8Array) => string;
}

/** One voice as the gateway lists it. */
interface Listed {
  id: string;
  name: string;
  language: string;
  gender: string;
  country: string;
  accent: string;
}

/** Read the sub-verb and do it: the list, or one voice said out loud. */
export async function run(argv: string[], how: Choosing = {}): Promise<number> {
  const out = how.out ?? process.stdout;
  const err = how.err ?? process.stderr;
  const door = theDoor(how.env ?? process.env, err);
  if (door === undefined) return 2;
  try {
    if (argv[0] === "play") return await play(door, argv.slice(1), how.play ?? aSpeaker, out, err);
    return await list(door, argv, out);
  } catch (refused) {
    if (refused instanceof TypeError && "code" in refused) {
      err.write(`${refused.message}\n${USAGE}\n`);
      return 2;
    }
    err.write(`${refusal(refused)}\n`);
    return 1;
  }
}

async function list(door: Door, argv: string[], out: NodeJS.WritableStream): Promise<number> {
  const { values } = parseArgs({
    args: argv,
    options: { tts: { type: "string" }, language: { type: "string" }, country: { type: "string" } },
  });
  const query = new URLSearchParams({ tts: values.tts ?? A_VENDOR });
  if (values.language !== undefined) query.set("language", values.language);
  const answered = await asked<{ voices: Listed[] }>(door, `/v1/voices?${query}`);
  const country = values.country?.toUpperCase();
  const voices = answered.voices.filter((voice) => country === undefined || voice.country === country);
  if (voices.length === 0) {
    out.write("no voice matches: try another --language or --country\n");
    return 0;
  }
  for (const voice of voices) out.write(`${aLine(voice)}\n`);
  return 0;
}

/** One voice on one line: the id first, because it is the word the setting takes. */
export function aLine(voice: Listed): string {
  const where = [voice.country, voice.accent].filter((word) => word !== "").join(" ");
  return [voice.id.padEnd(38), voice.name.padEnd(36), voice.gender.padEnd(10), where].join(" ").trimEnd();
}

async function play(
  door: Door,
  argv: string[],
  speaker: (wav: Uint8Array) => string,
  out: NodeJS.WritableStream,
  err: NodeJS.WritableStream,
): Promise<number> {
  const { values, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: {
      tts: { type: "string" },
      model: { type: "string" },
      language: { type: "string" },
      save: { type: "string" },
    },
  });
  const [voice, text] = positionals;
  if (voice === undefined) {
    err.write(`${USAGE}\n`);
    return 2;
  }
  const said = await aSample(door, {
    tts: values.tts ?? A_VENDOR,
    voice,
    model: values.model,
    language: values.language,
    text: text ?? A_SENTENCE,
  });
  if (values.save !== undefined) writeFileSync(values.save, said.wav);
  const player = speaker(said.wav);
  out.write(`${voice} · first audio ${said.firstAudioMs} ms · whole sentence ${said.totalMs} ms · ${player}\n`);
  return 0;
}

/** The sentence as the gateway said it, and the two numbers it timed it with. */
export interface Said {
  wav: Uint8Array;
  firstAudioMs: number;
  totalMs: number;
}

// The answer is the WAV itself, not JSON, so this is the one door the verb knocks at by hand.
async function aSample(door: Door, body: Record<string, string | undefined>): Promise<Said> {
  const answered = await fetch(`${door.url.replace(/\/$/, "")}/v1/voices/sample`, {
    method: "POST",
    headers: { ...signed(door.apiKey, door.world), "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!answered.ok) throw new Refused(answered.status, await answered.text());
  const timing = answered.headers.get("server-timing") ?? "";
  return {
    wav: new Uint8Array(await answered.arrayBuffer()),
    firstAudioMs: aDuration(timing, "first-audio"),
    totalMs: aDuration(timing, "total"),
  };
}

/** One metric's `dur` out of a Server-Timing header, or 0 when the gateway sent none. */
export function aDuration(header: string, metric: string): number {
  const found = new RegExp(`(?:^|,)\\s*${metric};dur=([0-9.]+)`).exec(header);
  return found === null ? 0 : Number(found[1]);
}

// A WAV is a file every player on every system opens, so the list is short and needs no flags
// for the format — unlike --listen's, which pipes raw samples (cli/listening.ts).
const PLAYERS: { name: string; args: string[] }[] = [
  { name: "afplay", args: [] },
  { name: "ffplay", args: ["-hide_banner", "-loglevel", "error", "-nodisp", "-autoexit"] },
  { name: "play", args: ["-q"] },
  { name: "aplay", args: ["-q"] },
  { name: "pw-play", args: [] },
];

/** Play the WAV on this machine and say with what; with no player, say where it was left. */
function aSpeaker(wav: Uint8Array): string {
  const dir = mkdtempSync(join(tmpdir(), "pinecall-voice-"));
  const file = join(dir, "sample.wav");
  writeFileSync(file, wav);
  const player = PLAYERS.find((one) => onThePath(one.name));
  if (player === undefined) return `no player here: the sample is ${file}`;
  spawnSync(player.name, [...player.args, file], { stdio: "ignore" });
  rmSync(dir, { recursive: true, force: true });
  return player.name;
}

function onThePath(name: string): boolean {
  return (process.env.PATH ?? "").split(delimiter).some((dir) => existsSync(join(dir, name)));
}
