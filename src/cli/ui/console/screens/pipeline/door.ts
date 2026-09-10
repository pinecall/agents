/** The envelope `GET /v1/agents/{slug}/pipeline` answers in, and the body its overrides door takes. */

import { z } from "zod";

import { put, read, type Credentials } from "../../lib/api";
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

/** The five knobs an operator may turn. A knob left out of a PUT stops being overridden. */
export const OverriddenSchema = z.object({
  voice: z.string().nullable(),
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
