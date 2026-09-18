/** The envelope `GET /v1/agents/{slug}/pipeline` answers in, and the body its overrides door takes. */

import { z } from "zod";

import { answered, doorUrl, headersFor, put, read, type Credentials } from "../../../shared/api";
import { ProviderSchema } from "../../lib/catalogue";
import { MEASURES } from "../../lib/metrics";

// The shapes are read here and nowhere else in the console, the way lib/doors.ts holds the two the
// log doors wrap the protocol in: `protocol/schema` describes a call, not an operator's screen.
/** One of the three: the vendor that runs it, the model, and the one knob worth showing. */
export const StageSchema = z.object({
  vendor: z.string(),
  model: z.string().nullable(),
  voice_id: z.string().nullable(),
  language: z.string().nullable(),
});
export type Stage = z.infer<typeof StageSchema>;

/** The six knobs an operator may turn. A knob left out of a PUT stops being overridden. */
export const OverriddenSchema = z.object({
  voice: z.string().nullable(),
  // `tts` is the vendor that speaks, written like the other two: `cartesia`, or `cartesia/sonic-3`.
  // It is the newest of the six, and the speaking stage was the one an operator could not move.
  tts: z.string().nullable(),
  tts_model: z.string().nullable(),
  stt: z.string().nullable(),
  llm: z.string().nullable(),
  greeting: z.string().nullable(),
});
export type Overridden = z.infer<typeof OverriddenSchema>;

// `name` is one of MEASURES: the door reads it off the runtime's log/latencies.py, which is
// the same five in the same order, so the screen never meets a metric lib/metrics.ts has not heard of.
/** One latency over the agent's recent calls: livekit's name, the median, how many turns carried it. */
export const MeasuredSchema = z.object({
  name: z.enum(MEASURES),
  seconds: z.number(),
  turns: z.int(),
});
export type Measured = z.infer<typeof MeasuredSchema>;

/** How the class opens a call: exactly one of the two verbs, as the wire carries it. */
export const GreetingSchema = z.object({
  say: z.string().nullable(),
  reply: z.string().nullable(),
  allow_interruptions: z.boolean().nullable(),
});
export type Greeting = z.infer<typeof GreetingSchema>;

/** The whole screen in one answer: the stages, their cost, what is turned, what may be asked. */
export const ReportSchema = z.object({
  agent: z.string(),
  hears: StageSchema,
  decides: StageSchema,
  speaks: StageSchema,
  greeting: GreetingSchema.nullable(),
  overrides: OverriddenSchema,
  // The names the voice knob may be turned to, off the runtime's one voices table. The console
  // keeps no list of its own: a name this build does not curate is an id no vendor answers for.
  voices: z.array(z.string()),
  // Every vendor each stage could be turned onto, with whether this box can run it — the same rows
  // GET /v1/providers answers, so the two screens cannot disagree about what exists.
  providers: z.array(ProviderSchema),
  calls: z.int(),
  medians: z.array(MeasuredSchema),
  unavailable_reasons: z.record(z.string(), z.string()),
});
export type Report = z.infer<typeof ReportSchema>;

/** What this agent hears, decides and speaks with right now. */
export async function readPipeline(credentials: Credentials, agent: string): Promise<Report> {
  return ReportSchema.parse(await read(credentials, door(agent)));
}

// The door answers the whole report, so the screen redraws from what the gateway now holds rather
// than from what the form believed it had sent.
/** Turn the knobs. The body is the whole set; the answer is the pipeline as it now stands. */
export async function turnKnobs(
  credentials: Credentials,
  agent: string,
  knobs: Partial<Overridden>,
): Promise<Report> {
  return ReportSchema.parse(await put(credentials, `${door(agent)}/overrides`, knobs));
}

function door(agent: string): string {
  return `/v1/agents/${encodeURIComponent(agent)}/pipeline`;
}

// The knob below the line is a text box and therefore always sets words, so the screen has to say
// which of the two the class declared: typing over an improvised opening changes what it IS, and
// an operator about to press save should be able to see that before they do.
/** What the class declared, as the one line the control shows above its box. */
export function greetingLine(greeting: Greeting | null): string {
  if (greeting === null) return "";
  if (greeting.say !== null && greeting.say !== undefined) return greeting.say;
  return `the class improvises: ${greeting.reply ?? ""}`;
}

// The hold melody has doors of its own and is not a seventh knob: the overrides PUT replaces the
// whole set, so a console that did not know about it would have silenced it by saving a voice.
/** What an agent plays while a tool runs: the runtime's own melody, none, or a file of yours. */
export const HoldAudioSchema = z.object({
  played: z.enum(["default", "off", "custom"]),
  name: z.string().nullable(),
  seconds: z.number().nullable(),
  sha256: z.string().nullable(),
});
export type HoldAudio = z.infer<typeof HoldAudioSchema>;

/** Which melody this agent plays while a tool runs. */
export async function readHoldAudio(credentials: Credentials, agent: string): Promise<HoldAudio> {
  return HoldAudioSchema.parse(await read(credentials, `${door(agent)}/hold-audio`));
}

// The body IS the file: the gateway decodes whatever PyAV reads and converts it once, so the page
// sends the bytes as they are and the name beside them — no form, no multipart.
/** A file of yours as the melody. The answer is what the gateway kept. */
export async function uploadHoldAudio(credentials: Credentials, agent: string, file: File): Promise<HoldAudio> {
  const answer = await fetch(doorUrl(credentials, `${door(agent)}/hold-audio`, { name: file.name }), {
    method: "PUT",
    headers: { ...headersFor(credentials), "content-type": file.type || "application/octet-stream" },
    body: file,
  });
  return HoldAudioSchema.parse(await answered(answer));
}

/** The runtime's melody back, or none at all. */
export async function chooseHoldAudio(credentials: Credentials, agent: string, played: "default" | "off"): Promise<HoldAudio> {
  return HoldAudioSchema.parse(await put(credentials, `${door(agent)}/hold-audio/played`, { played }));
}

// An <audio src> sends no header and a key never rides a URL, so the bytes are fetched with the
// key and handed to the player as a blob — the way the session screen plays a recording.
/** The file that plays, as a URL the page's player can open. The caller revokes it. */
export async function holdAudioBlob(credentials: Credentials, agent: string): Promise<string> {
  const answer = await fetch(doorUrl(credentials, `${door(agent)}/hold-audio/audio`), { headers: headersFor(credentials) });
  if (!answer.ok) await answered(answer);
  return URL.createObjectURL(await answer.blob());
}
