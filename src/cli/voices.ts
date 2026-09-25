/** `pinecall voices`: a vendor's voices in a language, and one of them said out loud on this machine. */

import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { parseArgs } from "node:util";

import { VoicesListedSchema, type VoiceSample } from "@pinecall/protocol";

import { theDoor } from "./env.js";
import type { Group } from "./groups.js";
import { aPlayerFor } from "./players.js";
import { asColumns } from "./providers.js";
import { asked, knocked, type Door } from "./testing/gateway.js";
import { refusal } from "./whoami.js";

const USAGE = `usage: pinecall voices [--tts cartesia] [--language es] [--country ES]
       pinecall voices play <voice> ["the words"] [--tts cartesia] [--model sonic-3] [--language es] [--save file.wav]`;

// The vendor a person means when they name none: Cartesia is the one whose catalogue is read from
// the vendor, and the reason this verb exists — its ids are uuids nobody could type from memory.
const A_VENDOR = "cartesia";

export const group: Group = {
  purpose: "a voice vendor's voices, and any one of them heard on this machine before it is chosen",
  usage: `${USAGE}

  With nothing after it: the vendor's voices in that language, one per line — the id the agent's
  voice setting takes, the name, gender, and where the accent is from (ES is Spain, MX Mexico), so
  a Spanish agent that should sound like Madrid is not given a voice from Monterrey. --country
  keeps only the voices from there.

  play says the words in that voice, through the vendor's own plugin exactly as a call would, and
  plays them here — afplay, ffplay, play, aplay or pw-play, whichever this machine has — with how
  long the vendor took to start and to finish. With no words, the gateway reads one line in the
  language. It runs on the org's own key for the vendor when it brought one (pinecall providers
  add), and on the box's otherwise. --save keeps the WAV where you say.

  The voice it plays is chosen with pinecall agent set --tts cartesia --tts-model <model> --voice
  <id>: the model you tried with --model is not kept unless --tts-model says it too.`,
  run,
};

/** What playing a file came to: the player that did, or why nothing was heard. */
export type Played = { player: string } | { failed: string };

/** What the verb can be told besides the argv: where to print, which environment, how to play. */
export interface Choosing {
  out?: NodeJS.WritableStream;
  err?: NodeJS.WritableStream;
  env?: NodeJS.ProcessEnv;
  /** How a WAV on disk is heard. A test hands one in rather than driving a speaker. */
  play?: (file: string) => Played;
}

/** Read the sub-verb and do it: the list, or one voice said out loud. */
export async function run(argv: string[], how: Choosing = {}): Promise<number> {
  const out = how.out ?? process.stdout;
  const err = how.err ?? process.stderr;
  const door = await theDoor(how.env ?? process.env, err);
  if (door === undefined) return 2;
  // The flags are read OUTSIDE the catch below, so one the verb does not take lands as the
  // dispatcher's own sentence and exit 2 (cli/index.ts), not as a refusal from the gateway.
  const playing = argv[0] === "play";
  const parsed = playing ? aPlayParse(argv.slice(1)) : aListParse(argv);
  try {
    if (playing) return await play(door, parsed as PlayArgs, how.play ?? aSpeaker, out, err);
    return await list(door, parsed as ListArgs, out);
  } catch (refused) {
    err.write(`${refusal(refused)}\n`);
    return 1;
  }
}

type ListArgs = { tts?: string; language?: string; country?: string };
type PlayArgs = { voice?: string; text?: string; extra?: string; tts?: string; model?: string; language?: string; save?: string };

function aListParse(argv: string[]): ListArgs {
  return parseArgs({
    args: argv,
    options: { tts: { type: "string" }, language: { type: "string" }, country: { type: "string" } },
  }).values;
}

function aPlayParse(argv: string[]): PlayArgs {
  const { values, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: { tts: { type: "string" }, model: { type: "string" }, language: { type: "string" }, save: { type: "string" } },
  });
  const [voice, text, extra] = positionals;
  return { ...values, ...(voice === undefined ? {} : { voice }), ...(text === undefined ? {} : { text }), ...(extra === undefined ? {} : { extra }) };
}

async function list(door: Door, args: ListArgs, out: NodeJS.WritableStream): Promise<number> {
  const query = new URLSearchParams({ tts: args.tts ?? A_VENDOR });
  if (args.language !== undefined) query.set("language", args.language);
  // The wire's own schema: a 200 that is not the list — a proxy's page, an older gateway — is
  // refused in its words rather than read as a list with nothing in it.
  const listed = VoicesListedSchema.parse(await asked<unknown>(door, `/v1/voices?${query}`));
  const country = args.country?.toUpperCase();
  const voices = listed.voices.filter((voice) => country === undefined || voice.country === country);
  if (voices.length === 0) {
    out.write("no voice matches: try another --language or --country\n");
    return 0;
  }
  const rows = voices.map((voice) => [voice.id, voice.name, voice.gender, [voice.country, voice.accent].filter((word) => word !== "").join(" ")]);
  for (const line of asColumns(rows)) out.write(`${line}\n`);
  return 0;
}

async function play(door: Door, args: PlayArgs, speaker: (file: string) => Played, out: NodeJS.WritableStream, err: NodeJS.WritableStream): Promise<number> {
  if (args.voice === undefined || args.extra !== undefined) {
    err.write(`${USAGE}\n`);
    return 2;
  }
  // The words are the vendor's to hear and nobody else's to invent: with none given, the body
  // carries none and the gateway reads one line in the language.
  const body: VoiceSample = {
    tts: args.tts ?? A_VENDOR,
    voice: args.voice,
    model: args.model ?? null,
    language: args.language ?? null,
    text: args.text ?? null,
  };
  const said = await aSample(door, body);
  const kept = args.save === undefined ? null : resolve(args.save);
  const file = kept ?? join(mkdtempSync(join(tmpdir(), "pinecall-voice-")), "sample.wav");
  writeFileSync(file, said.wav);
  const played = speaker(file);
  const wait = said.firstAudioMs === null ? "—" : `${said.firstAudioMs} ms`;
  const whole = said.totalMs === null ? "—" : `${said.totalMs} ms`;
  if ("failed" in played) {
    err.write(`${played.failed}: the sample is ${file}\n`);
    return 1;
  }
  if (kept === null) rmSync(file, { force: true });
  out.write(`${args.voice} · first audio ${wait} · whole sentence ${whole} · ${played.player}${kept === null ? "" : ` · saved ${kept}`}\n`);
  return 0;
}

/** The sentence as the gateway said it, and the two numbers it timed it with, when it did. */
export interface Said {
  wav: Uint8Array;
  firstAudioMs: number | null;
  totalMs: number | null;
}

// The answer is the WAV itself, not JSON, so it is read as bytes off the same signed knock.
async function aSample(door: Door, body: VoiceSample): Promise<Said> {
  const answered = await knocked(door, "/v1/voices/sample", { method: "POST", body });
  const timing = answered.headers.get("server-timing") ?? "";
  return {
    wav: new Uint8Array(await answered.arrayBuffer()),
    firstAudioMs: aDuration(timing, "first-audio"),
    totalMs: aDuration(timing, "total"),
  };
}

const DURATIONS = {
  "first-audio": /(?:^|,)\s*first-audio;dur=([0-9.]+)/,
  total: /(?:^|,)\s*total;dur=([0-9.]+)/,
};

/** One metric's `dur` out of a Server-Timing header, or null when the gateway sent none. */
export function aDuration(header: string, metric: keyof typeof DURATIONS): number | null {
  const found = DURATIONS[metric].exec(header);
  return found === null ? null : Number(found[1]);
}

/** Play the file on this machine with the first player it has, and say which — or why not. */
function aSpeaker(file: string): Played {
  const player = aPlayerFor("file");
  if (player === null) return { failed: "no player on this machine (afplay, ffplay, play, aplay or pw-play)" };
  const ran = spawnSync(player.name, [...player.file, file], { stdio: "ignore" });
  if (ran.error !== undefined) return { failed: `${player.name} could not start (${ran.error.message})` };
  if (ran.status !== 0) return { failed: `${player.name} could not play it (exit ${ran.status ?? "?"})` };
  return { player: player.name };
}
