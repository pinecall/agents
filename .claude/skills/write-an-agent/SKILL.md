---
name: write-an-agent
description: Write or change a tenant's agent — the class, its tools, its view — in examples/ or in a customer's app. Use when adding a @tool, a stage, a channel, an event or a view branch, or when a model is doing the wrong thing in a call.
---

# Writing a tenant's agent

The class is the app. Everything below is what the framework refuses, what it will not tell you,
and what the two examples already paid for. The long form is `docs/writing-an-agent.md` and
`docs/the-prompt.md`.

## NEVER

- **Never add a `paths` mapping for `pinecall`** in a tenant's `tsconfig.json` or
  `vitest.config.ts`. The app resolves it through `node_modules` like a customer; a mapping hands
  `pinecall run` a second copy of the framework, and the two disagree about every WeakMap in it.
- **Never write state outside a tool or a hook.** It throws `UnauthoredWrite`, on purpose: every
  change carries the name of who made it, and that is what the log and the console read.
- **Never put a collaborator in a getter.** `get agenda()` becomes state: it lands in the prompt,
  in `state.set` and in every golden. A collaborator is a `private method()`.
- **Never ask the model for a record.** `book(chosen: string)` and resolve it against what is on
  the table. Asked for a whole `Slot`, a model invents one and the agenda gets a slot nobody
  offered — a golden caught exactly this.
- Never restart your reasoning from the prompt when a tool did not run. Read the log first.

## The loop

```bash
cd examples/clinica-norte
pnpm exec pinecall prompt --state test/prompts/states.json   # offline: no key, no gateway
pnpm test                                                    # ring 0: the class as software
pnpm exec pinecall chat                                      # the app in this terminal
pnpm exec pinecall test --grep <name> --watch                # ring 1, while writing one golden
```

`prompt` and `run --show-prompt` are free and instant. Use them before every ring-1 run: half of
what looks like a model problem is a block that says the wrong thing.

## Adding a tool — the five things that are checked

1. **A `/** one line */` docstring above the method.** Without one the declaration is refused:
   no model can choose a tool it cannot read. This is the description the model sees; the JSON
   schema it never sees.
2. **The signature is the schema.** Parameter names and types are read out of the class's own
   source with oxc. `string`, `number`, `boolean` map directly; anything else arrives as an open
   object unless you pass `params: z.object({…})`.
3. **Visibility is `when(state)`.** `stage: "book"` is sugar lowered to one, and it is
   type-checked against your own `stage` field — but only if the class *has* one, or the
   declaration is refused at mount.
4. **`confirm` is what makes a tool irreversible.** With it, the platform reads the sentence back
   and waits for an explicit yes before the method runs. `{{result.field}}` and `{{slot.field}}`
   are filled from the args and the state.
5. **`pii: ["name"]` must name real parameters** — an unknown one is refused — and `preview: n`
   cuts only what the model sees, never the state field.

A tool that throws answers the model: the rejection becomes one `tool.result` with `error` in it.
Throw a sentence the model can act on.

## When the model does the wrong thing

Read in this order. Each line is a real diagnosis from these two examples:

| symptom | usually |
|---|---|
| asks again for something it already has | the tool's docstring is in the static `tools` block whether or not the tool is visible. The view has to say "you already know who you are talking to" |
| does the irreversible thing without the yes | the standing rule lives in `identity`, static and generic. `side_effect` and `confirm` travel in the declaration, not in the text: the **view** has to say that *this* is the turn to wait in |
| reads the same option back forever | one view branch is covering two different turns. Add the state field that tells them apart (`proposed`) and write a branch for each |
| invents an option | the state that was on the table moved and the view did not clear it, or the tool resolved a free-text argument loosely |
| never leaves the first stage | a stage with no way out. Every stage needs a tool that can move it — including the "not on file" path |

## Views

- The view is a **dynamic** block, the last one, and only a dynamic block may change between two
  turns. Never write into the class docstring per call; never reorder the blocks. Data a tool
  feeds that the view only reads back — a slot list, a cart — can be a dynamic block of its own
  (`static prompt = { dynamic: ["availability"] }`, `views/availability.tsx`); prose the model
  should read once and cached is a static one, and it may read no state.
- `{condition && <p>…</p>}` is the whole control flow: `false`, `null` and `undefined` render
  nothing. `<p>` is a paragraph; siblings are one blank line apart.
- `<Memory>`, `<Retrieved>` and `<Knowledge>` render markers the **gateway** fills. This package
  opens no file and retrieves nothing.
- Say what to do **in this turn**, not in general. A rule that is true of the whole call belongs
  in `<Rules>`; a rule about the turn the state is in belongs in a branch.

## Before you call it done

- `pnpm lint && pnpm test` in the app, and `pinecall prompt` printed for each state you changed.
- A golden for the behaviour, in `test/goldens/`, named after what it is about
  (`no-reserva-antes-del-si.json`). See the `write-a-golden` skill.
- With `exactOptionalPropertyTypes`, a field a tool can empty again is `field?: T | undefined`.
- If the change is in `examples/`, the nightly drives it on two models: a rule that only holds on
  one of them is a finding, not a green.
