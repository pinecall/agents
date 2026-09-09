# The tenant: Clínica Norte

What a customer writes: a class, a view, a markdown, the clinic's own systems and a package.json.
Everything else — the state machine, the confirmation gate, memory, retrieval, the log, the console
— is the platform's. This example exists to prove that division is real and not a slogan.

## What was taken from convo (`~/prueba-abai`), as an idea

- **A tenant is a folder, and its backend is a fake with the real surface.** convo's
  `tenants/clinica-norte/adapters/agenda.py` is a made-up appointment book that is never random;
  ours is `lib/agenda.ts`, the same idea in a class with `byPhone`, `find`, `free` and `book`.
- **One deterministic failure, on purpose.** convo makes the booking system refuse 13:00 so the
  refusal path can be tested at all. We kept the hour and the reason ("ese hueco acaba de
  ocuparse"): every weekday offers a 13:00 slot that is free to look at and taken to write.
- **A knowledge file a receptionist could read aloud.** Prose, not a schema: services, prices,
  hours, the cuadro médico, insurance, cancellation policy, transport, FAQ. Written new here — the
  clinic is the same fictional business, not a word of it is convo's.
- **The same business, so the two can be compared.** Same clinic, same use case (rescheduling), so
  a reader who knows convo sees exactly what the v2 shape removed.

## What is different, and why

- **No stage machine.** convo's project is a graph of stages with a prompt per stage; here the
  four phases are one field of the state, `stage`, and `@tool({ stage })` on four tools — sugar
  the decorator lowers to the same `when(state)` (`docs/decisions/agent-model.md`). There is no
  graph, no prompt per phase and no construct: the field moves inside a tool like any other, and
  the four-phase test asserts the transitions the stage machine used to encode. The view says the
  rest, and reads the same field.
- **The prompt is one function of the state, not seven prompt files.** convo keeps
  `prompts/identify.md`, `choose_slot.md`, `farewell.md`; ours is `views/agent.tsx`, and the
  conditionals in it are the whole difference between those files.
- **Tools are methods, docstrings are the prompt.** No registry, no schema written by hand: the
  class is the declaration, and `describe(ctor, source)` gives the parameter types back.
- **The state writes itself.** `this.patient = …` inside a tool is the entire state API; convo
  needed an explicit event with an author. The author is now the tool's own name.
- **The failed booking does not touch the state.** The design writes `this.slot = slot` before
  calling the agenda; we call the agenda first and assign both fields after it answers, so a hueco
  that was taken between looking and writing never appears in the prompt as the patient's.
- **`Patient | undefined` is written out.** With `exactOptionalPropertyTypes`, a field a tool may
  clear has to say it can hold `undefined`.

## What the view was missing: the turn after the offer

Found 2026-09-08 by `expect.not_tools`, the first time it ran on a clean tree
([pinecall-test.md](pinecall-test.md)). `no-reserva-antes-del-si` booked in **two runs out of
five** on haiku: the caller says *"Me viene bien la de las cuatro"* at seq 7 and `book` runs at
seq 12, before anything has been read back to her. The two red logs and the three green ones
rendered the **same view**, byte for byte — `prompt.changed` region `view`, hash `f1eb568f`, 392
chars, in all five — so the difference was never the state. Nothing in the prompt settled the
question, and haiku answered it one way twice and the other way three times.

What the model saw at the moment it chose:

- **The view ended at how to offer.** With hours on the table it rendered the patient's line, the
  hours, and *"Muestra hasta cinco horas, una por línea."*, and stopped. The next turn is always
  the caller picking one of them, and the dynamic region — the last thing in the prompt, and the
  one this model follows — said nothing about what to do with it.
- **`book`'s docstring read as permission.** *"Reserva la hora que el paciente ha elegido, dicha
  tal y como se la has leído."* She had just chosen, the hour was one that had been read out,
  `stage` was `book` and `when: (s) => s.slots.length > 0` held. Every condition the model could
  see said yes.
- **The one sentence that forbids it was generic and three regions away.** The static prefix's
  `<protocols>` carries *"Antes de una acción irreversible lee en voz alta lo que vas a hacer y
  espera un sí explícito."* Nothing anywhere in the prompt says that booking IS irreversible:
  `side_effect: "irreversible"` and the `confirm` phrase travel in the ToolSpec on the wire, never
  in the text, and the gate that would have used them was deferred on 2026-09-06
  (the runtime's `docs/decisions/confirm.md`). The model had to join *book* to *irreversible* by itself.

So the rule is now said where the model decides, in the two places this tenant already says a rule
twice — the view and the docstring, the shape `freeSlots` has and a test nails:

- the view, under `slots.length > 0`: naming one of these hours does not book it; read it back
  whole — day, hour and doctor — ask, and call `book` only after the yes.
- `book`: *"Reserva la hora que el paciente ya ha confirmado … Nunca antes de su sí."*

Neither of them names a phrase, so neither depends on how the model words its answer.
`no-reserva-antes-del-si` then ran **10/10 on haiku**, with `book` absent from all ten logs and
each one reading the slot back and asking; the ten goldens stayed 10/10 at 0 judge calls. The
golden file was not touched: it is byte for byte the one that went red.

**A prompt was never a permission, and this is a prompt.** The rule is about ORDER — book after
the yes — it lives in `pinecall/domain/consent.py`, and it is enforced by the confirmation gate,
not by this paragraph. Until the gate returns, the paragraph is what makes the model behave and
`not_tools` is what notices when it does not.

## The yes has to be visible to the model as a yes: `propose`

The paragraph above is half a rule. It says *wait for the yes* and it never says *and this is it*,
so it renders identically on the turn where the patient chooses an hour and on the turn where he
confirms it — and a model that obeys it literally on the second turn reads the slot back a second
time and asks a second time. Found 2026-09-08 on Bernardo's matrix run: 19/20, one divergence,
`reserva-cuando-el-paciente-dice-que-si` green on haiku and red on gpt-5.4-mini
(`call_e7d84135d5294153a18a150d508542e5`: seq 7 *"Esa me viene bien."*, seq 31 the readback and the
offer, seq 33 *"Sí, confírmemela."*, seq 64 **the readback again**, hang-up, `book` never ran). It
is the exact mirror of the fix above, caught by the golden that exists to be its mirror — the pair
is the point, and neither half is safe alone.

Nothing in the state told the two turns apart. `stage` was `book` in both, `slots` was the same
list in both, and the view is a function of the state: same state, same paragraph, and the model
was asked to infer the turn from a history the dynamic region does not summarise. So the class was
given the field it was missing.

**`propose(chosen)` is the readback as a tool.** It resolves the hour against the ones on the table
with the same `offered()` that `book` uses, refusing anything else with `NotOnTheTable`, and leaves
it in `proposed`. It touches no system: `side_effect` is `read`, there is no `confirm`, and the
gate has nothing to stop. What it buys is that the view can now render two different paragraphs:

- `proposed` unset — the rule above, unchanged, plus one sentence: name one and call `propose`
  first, then read it out.
- `proposed` set — the hour named whole, and: read it if you have not, wait for his answer, and
  when he says yes call `book` with it in that same turn, without repeating it or asking again.

`freeSlots` clears the field (another day's hours retire the proposal) and `book` clears it on a
booking that went through. A booking the agenda refuses leaves it exactly where it was, because the
hour is still what the patient has in front of him — the existing refusal test is the nail.

**The second paragraph has to be true half a turn early.** The view is re-rendered the moment a
tool writes state, so it reaches the model between `propose` returning and the model speaking — the
readback has not been said yet. That is why it reads *"le estás proponiendo … léesela si todavía no
lo has hecho y espera su respuesta"* and not *"ya se la has leído"*: a sentence that claims the
readback happened would, at that instant, be a lie, and the turn it would license is the one
`no-reserva-antes-del-si` forbids. The wording is measured, not argued: the pair ran ten times on
both models, **40/40**, and the logs show the shape asked for — `propose` at seq 9 on the choosing
turn, the readback at seq 35, `book` at seq 39 immediately after *"Sí, confírmemela."*
(`call_ec5f619576fd4d5fbf396236ae498a7d`). The ten goldens then went 20/20 at 0 judge calls. Neither
golden file was touched.

**A tool is how this framework knows anything.** The alternative was to read the readback off the
last agent turn — a regex over what the model said — and it fails the moment the model words the
readback differently, which is the one thing a two-model matrix guarantees. State changes through
tools; that is the thesis, and "the patient has an hour on the table" is state.

## The view says who is on the line, because the static prefix cannot

The tool list travels in the static prefix, which is the region that does NOT change between turns
([prompt-regions.md](prompt-regions.md)) — so `findPatient` is in front of the model for the whole
call, including the turns after the patient has been identified. With nothing else said, the model
read the visible tool as a thing still to do and asked Ana for her name and telephone a second
time, with her record already on the screen.

So the view opens `choose` and `book` by saying who is on the line and that she is already known:
*"Hablas con Ana García, ya identificada: no vuelvas a pedirle el nombre ni el teléfono. Tiene cita
el jueves a las diez con la doctora Vidal."* It is two sentences and both are load-bearing — the
first is the fact, the second is the instruction, and dropping the second brings the second
identification back. The goldens that hold it are the ones that open already identified —
`consulta-el-dia-que-nombra-aunque-ya-tenga-cita-ese-dia` and `ofrece-las-horas-del-martes`, both
seeded at `stage: choose` with Ana's record and both expecting `freeSlots`: a model that asks for
her name again never gets there, and `tools` goes red.

This is the same shape as the paragraph above it: a rule the platform expresses in a declaration —
here, that a tool's turn has passed — has to be said in words in the dynamic region, because the
declaration is not what the model is reading when it decides.

## `book` takes the hour as it was said, and that is a patch on the framework

`book(chosen: string)` is not the design. The design is `book(slot: Slot)` — the tenant's own type,
the object `freeSlots` handed back — and it was written that way first. It failed: `Slot` is
declared in `lib/agenda.ts` and the framework's schema scraper expands an interface only
when it is declared in the tool's own file, so the model was handed
`{type: "object", additionalProperties: true}` and invented `{day, time, doctor}` — a slot the
agenda had never offered. A golden caught it.

The tenant was patched around the framework: `book` takes the hour the way it was read out loud,
and `offered(chosen)` looks it up among the hours actually on the table, refusing anything else
with `NotOnTheTable`. That is a better tool signature for a phone call by accident — the model
chooses by saying an hour rather than by filling in a form — but it is still a workaround, and the
code says so where it is written.

**The framework fix is still to write**: the scraper resolves a type across the tenant's own
files, and a type it cannot describe becomes a build error naming `file:line` rather than a silent
`additionalProperties: true`. That card restores `book(slot: Slot)` here and re-runs these goldens.
The agenda is no longer module-level: it is one per call, and how it got there is below.

## What is stubbed, and by which card

- `this.last(call.contact)` (resuming a cut call) waits for a store behind `provideLast()` —
  TODO in `onCall`.
- `call.forward(...)` in `transfer` waits for the framework to have it — TODO.
- The terminal walkthrough (`pinecall chat`) is the CLI's. Its in-process
  equivalent is `test/walkthrough.test.ts`: the same four phases and the same `tool.result`s over
  the SDK's FakeGateway, refusal included.
- The agenda is one `FakeAgenda` per call, handed out by `agendaFor(agent)` in `lib/agenda.ts` —
  a `WeakMap` keyed on the instance serving the call, not a module singleton.
- Why: `pinecall test` runs every model's cells in the tenant's one process, so with a singleton
  haiku booked "martes a las cuatro" and gpt-5.4-mini's `book` on the same golden got
  `AgendaRefused: ese hueco acaba de ocuparse`. The cell stayed green because `expect.tools` only
  asks that `book` ran, but the second model never booked and stderr said so every run.
- Why not a field: `src/agent/state.ts` takes every own enumerable non-function
  property as state, so `agenda = new FakeAgenda()` would be diffed, rendered and pinned in
  goldens; a `#private` field escapes that but is unreadable through the Proxy the framework serves
  the agent as (`this` inside a tool is the Proxy, and a private brand lives on the target). Off
  the instance is the only place left. It is a method — `private agenda()` — and not a getter,
  because `gettersOf` reads the prototype's accessors and would take a getter as state too.
- Why keyed on the agent and not on `this.call`: the framework builds one instance per call
  (`runtime/connect.ts` `start()`), so the two are the same lifetime, and `this.call` throws
  outside a served call — the tenant's own vitests build the class with no call at all.
