# `pinecall simulate`: a model plays the caller, and the line can be spoiled on purpose

One chapter of the runtime's `docs/decisions/evals.md`. `pinecall test` replays goldens somebody wrote down; `simulate`
puts a **person** on the line who was never told what to say — a goal, a way of talking, and a
handful of facts about themselves — and lets them improvise against the agent until they get what
they came for or run out of turns. What comes back is a call in the tenant's own log, judged by
ring 4 like every other call (the runtime's `docs/decisions/scoring.md`).

```
pinecall simulate --persona apurado --turns 6 --judge
pinecall simulate --persona apurado --voice --background-noise 15 --packet-loss 2
pinecall personas list | show apurado | try apurado
```

## Why this exists at all: LiveKit's own simulations are Cloud-only

LiveKit ships the same idea and we cannot use it. Their docs say so in one sentence
(`docs.livekit.io/agents/start/testing/simulations`):

> **"Simulations run on LiveKit Cloud using your project's credentials, so the CLI must be
> authenticated to a project."**

`lk agent simulate --scenarios scenarios.yaml` uploads the scenarios, runs the calls on their
infrastructure and grades them with their judge. This runtime has to work on a customer's own box
with no LiveKit Cloud in it — the same reason ring 4's verdict is a log entry and not a session tag
(the runtime's `docs/decisions/scoring.md`) — so the caller is played here, by the model this box already has a key
for, against the agent this box is already serving.

**What is taken is the design, and it is worth naming which three ideas.** All three are on that
page and in their own example, `livekit/agents` at `examples/data_capture_sim/scenarios.yaml`:

| their idea | where | ours |
|---|---|---|
| `instructions` — *"The script for the simulated user: who they are and what they're trying to do."* Their example writes it as `PERSONA: … OPENING LINE: … FACTS: … DO, IN ORDER: …` (`scenarios.yaml:18-27`) | the simulations page; `examples/data_capture_sim/scenarios.yaml:18` | the persona IS the system message. `gateway/evals/caller.py` builds it out of `goal`, `style` and `facts`, and nothing else — no `DO, IN ORDER`, because a caller told the order is a script again |
| `agent_expectations` — *"What a successful run looks like. The judge grades the transcript against this."* | the simulations page; `scenarios.yaml:29-34` | a golden's `expect` block, which is checked by code where it can be, and the four judges of ring 4 for the rest. Never a paragraph of prose handed to a model with a transcript |
| `userdata` — *"An arbitrary nested mapping passed through to your agent at runtime. Use it to drive deterministic mocks."* | the simulations page | a persona's `facts`, and the call's opening `state`. The facts are the caller's own — the model is told to use them and to invent nothing beside them, which is the only kind of repeatability an improvised call can have |

## A persona is a person, not a script

```ts
// examples/clinica-norte/test/personas/apurado.ts
export default {
  goal: "cambiar la cita al martes por la tarde sin dar más datos de los justos",
  style: "frases cortas, interrumpe, da el dato justo y pide la hora ya",
  facts: {
    "cómo se llama": "Ana García",
    "su teléfono": "600 000 001",
    "la cita que tiene ahora": "el jueves a las diez con la doctora Vidal",
  },
  state: { stage: "choose", patient: { /* what the clinic already knows */ } },
};
```

`simulate` was first wired with a `says` array — the caller's lines, written down — and said so
honestly at the time. `says` is **gone**, not deprecated: a script nobody puts on the wire is dead
data, and the improvised caller is the whole point of this card. What a persona still carries is
`state`, which is what the CALL opens in (the clinic already knows Ana), while `facts` is what the
CALLER knows about themselves. They are two different people's knowledge and they are not merged.

The first real run is the proof that the facts are used unprompted: the caller opened with
*"quería cambiar mi cita del jueves con la doctora Vidal"* — a fact nobody had asked for — and
answered the identity question with *"Ana García, 600 000 001"* in one breath.

## The model runs in the runtime, the terminal builds the case

`POST /v1/evals/caller` takes the persona, the conversation so far and how many turns are left, and
answers with one line and whether the caller is hanging up. It is a forced function call at
temperature the vendor's own — the shape livekit's judge uses to read a verdict off arguments
rather than out of prose (`evals/judge.py:155-161`) — because a caller that answers with
`Ana: "hola"` has narrated instead of spoken.

The split is the milestone's rule: **the judgement runs in the runtime, the CLI builds the case.**
The gateway is the process holding the provider keys, the LiveKit pair and the log; the tenant's
terminal holds the persona, the class and the screen. So the terminal asks for a line, puts it on
the wire, and prints what comes back.

The model is the vendor table's own default, which is Haiku — `providers/llm/anthropic.py:11`, the
same model `a_judge` reaches for. Nothing in this feature names a model.

**The transcript the caller is handed is the call's own log**, on both doors: `turn.user` and
`turn.agent`, in seq order. Not a copy the terminal kept — for the same reason ring 4's judges
replay the log rather than a session's history (the runtime's `docs/decisions/scoring.md`), and because on a spoken
call the caller's own turn is *what the STT heard*, which is the line that matters.

## Two doors, one turn loop each, and why they are two

| | written | spoken |
|---|---|---|
| the caller's mouth | `WS /v1/chat`, one frame per turn | a track published into the agent's room |
| where the loop runs | the terminal | the gateway, over `POST /v1/evals/voice` |
| the hangup | closing the socket | the last turn, then leaving the room |
| the app | named in the socket URL (`?app=`) | unnamed: `takesUnclaimed` |

The written loop stays in the terminal because the card asks for a caller *against the gateway's
chat door*, and because that is what makes a breakpoint in a `@tool` reachable while the call is
happening. The spoken loop cannot: the mouth is a LiveKit track, the voice is the box's own speech
tool, and both live where the keys are. So the terminal mints the call id — **a room's name IS the
call id** (`worker/entry.py:82`) — posts it, and polls the log while the runtime holds the call.

That last row is a real difference and it cost a run to find. A written call names this app in its
own socket URL, so the terminal takes nothing it did not open. A spoken call arrives through the
worker, which names no app (`worker/entry.py:82`), and the gateway answered the job with *"agent
clinica-norte is held only by apps that take no call they did not open"*. So a `--voice` run mounts
with `takesUnclaimed: true` — the posture `pinecall run` has — and a written one does not.

## The degraded line

`--background-noise <dB>` mixes an interferer under the caller's own voice; `--packet-loss <%>`
drops that share of her packets. Both are `pinecall_evals/line.py`, both are pure arithmetic over
16-bit mono PCM, and both are unit-tested without a room.

- **The interferer is a television behind the caller** — a second `say` voice reading a sports
  bulletin — and the default level is `15` dB under the caller because that is the level at which
  its five measured calls found two of its sentences becoming `turn.user`
  (the runtime's `docs/decisions/voice-bridge.md`, "The energy gate is gone").
- **The mix is a sum and a clip**, which is livekit's own arithmetic in its own example:
  `examples/avatar/hold_music.py:74-81` sums notes into a buffer and finishes with
  `np.clip(out, -32767.0, 32767.0).astype(np.int16)`. A wrap instead of a clip is a click the
  caller never made and the STT would hear it as one.
- **A lost packet is 10 ms of silence, not a missing frame.** Silence is what a jitter buffer plays
  for a packet that never arrived, and 10 ms is livekit's own frame unit — their echo agent sizes
  its queue as *"10 seconds of audio (1000 frames \* 10ms)"* (`examples/primitives/echo-agent.py:52`).
- **The track is livekit's three lines**, unchanged: `rtc.AudioSource` → `LocalAudioTrack.create_audio_track`
  → `publish_track(..., TrackSource.SOURCE_MICROPHONE)` (`examples/primitives/echo-agent.py:45-50`),
  and frames go in with `await source.capture_frame(frame)` and **no sleep between them** (`:94`) —
  the source paces them itself, and sleeping as well puts the caller on the line at half speed.

**No `--voice` run ever opens an audio device.** `pinecall-runtime worker talk` is livekit's console
and does open the machine's microphone; this caller's microphone is a WAV the box wrote a moment
ago, and the identity it joins under says so: `simulated_caller`.

The box's speech tool is `say` on macOS (asked for `LEI16@48000`, which is what livekit publishes)
and `espeak-ng` on Linux, at whatever rate it chooses — which is why the track is published at the
rate of the **first** thing the caller says, rather than at a number written down here.

## What the report carries, and where every number in it comes from

```
  call_c6333d0a645a0cac96579b5c · 3 caller turn(s) · 3 agent turn(s) · interferer 15 dB under the caller
  e2e_latency 1496ms · llm_node_ttft 618ms · tts_node_ttfb 128ms
```

The three latencies are the **medians of the call's own `turn.agent` metrics entries**, under
livekit's own field names, read by the one reader every report in this tree uses
(`cli/testing/latency.ts`). `e2e_latency` is livekit's measurement from the end of the caller's turn
to the first audio out — the caller-side wait, which is exactly the number a spoken run is about —
and nothing here computes it. A metric the session never measured is absent rather than printed as
a zero.

## `--judge` prints the `call.score`, and an absent `passed` is a third thing

The call hangs up, ring 4 judges it, and the entry the log seals on is read back and printed:

```
✗ a judge answered broken
  ✓ consent    the confirmation gate is deferred (2026-09-06): 1 irreversible tool call ran …
  ✗ grounded   The assistant stated "…con el doctor Ferrán" … not supported by the evidence
  1 judge call · 0.0017 EUR
```

Three headlines and never two, because `passed` has three states: `true`, `false` and **absent**,
which means nobody judged the call and `not_judged` says why. Rendering an absent `passed` as green
or as red would both be wrong, so it is neither: `· nobody judged this call: <the reason>`.

**The exit code is a gate, not a verdict.** It is 0 only when `passed` is `true`; a broken judge and
a call nobody judged are both non-zero, because "nobody looked at this" must not open a gate. The
three states are told apart on the screen, where a verdict belongs.

What `--judge` deliberately does NOT do any more is re-run ring 3's four code checks after every
turn. Ring 3's statuses (`passed · failed · deferred · skipped`) are the operator's vocabulary and a
verdict's four words are the tenant's; scoring.md says the two are deliberately not merged, and
printing both under one flag is exactly the confusion it warns about. `pinecall eval <call>` is
still the verb for the checks.

## What a run costs

One Haiku question per caller turn, plus whatever ring 4 spends under its ceiling
(`PINECALL_JUDGE_CEILING_EUR`, 0.002 by default). The six-turn written run above billed
`0.0017 EUR` of judging on one judge call. A `--voice` run adds real STT and TTS for the length of
the call and is the expensive one; `--turns 3` is the shape to reach for when the question is about
the line rather than about the conversation.
