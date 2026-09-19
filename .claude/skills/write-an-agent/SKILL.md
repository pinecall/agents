---
name: write-an-agent
description: Write or change a tenant's agent — the class, its tools, its render() — in examples/ or in a customer's app. Use when adding a @tool, a stage, a channel, an event or a branch of the view, or when a model is doing the wrong thing in a call.
---

# Writing a tenant's agent

The class is the app. Everything below is what the framework refuses, what it will not tell you,
and what the example already paid for. The long form is `docs/writing-an-agent.md` and
`docs/the-prompt.md`.

## NEVER

- **Never add a `paths` mapping for `pinecall`** in a tenant's `tsconfig.json` or
  `vitest.config.ts`. The app resolves it through `node_modules` like a customer; a mapping hands
  `pinecall start` a second copy of the framework, and the two disagree about every WeakMap in it.
- **Never write state outside a tool or a hook.** It throws `UnauthoredWrite`, on purpose: every
  change carries the name of who made it, and that is what the log and the console read.
- **Never put a collaborator in a getter.** `get agenda()` becomes state: it lands in the prompt,
  in `state.set` and in every golden. A collaborator is a `private method()`.
- **Never ask the model for a record.** `book(chosen: string)` and resolve it against what is on
  the table. Asked for a whole `Slot`, a model invents one and the agenda gets a slot nobody
  offered — a golden caught exactly this.
- **Never declare the world on the class.** `voice`, `llm`, `stt`, `greeting`, `hangup`, `says`,
  `hears`, `memory`, `knowledge`, `docs` are refused at load with the verb that sets each: they
  are settings, per world and corner, versioned (`pinecall agent`, `pinecall lexicon`, `pinecall
  memory policy`, `pinecall docs attach`). The class declares the contract — the doors, `language`,
  the state, the tools, `render()` — and nothing else.
- **Never write the business into the repository.** What the agent knows by heart is a setting,
  `pinecall agent knowledge edit` or Settings ▸ Knowledge, read whole on every call. `docs/<name>/`
  holds only what a turn searches, and a tool reaches it with `await this.knowledge.search(q, { k })`.
- Never restart your reasoning from the prompt when a tool did not run. Read the log first.

## The loop

```bash
cd examples/clinica-norte
pnpm exec pinecall link                                      # once: your key for the org, in ./.env
pnpm exec pinecall prompt --state test/clinica-norte/prompts/states.json   # offline: no key, no gateway
pnpm test                                                    # ring 0: the class as software
pnpm exec pinecall chat                                      # the app in this terminal
pnpm exec pinecall test --grep <name> --watch                # ring 1, while writing one golden
```

`prompt` and `start --show-prompt` are free and instant. Use them before every ring-1 run: half of
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

Read in this order. Each line is a real diagnosis from the example:

| symptom | usually |
|---|---|
| asks again for something it already has | the tool's docstring is in the static `tools` block whether or not the tool is visible. The view has to say "you already know who you are talking to" |
| does the irreversible thing without the yes | the standing rule lives in `identity`, static and generic. `side_effect` and `confirm` travel in the declaration, not in the text: the **view** has to say that *this* is the turn to wait in |
| reads the same option back forever | one branch of `render()` is covering two different turns. Add the state field that tells them apart (`proposed`) and write a branch for each |
| invents an option | the state that was on the table moved and the view did not clear it, or the tool resolved a free-text argument loosely |
| never leaves the first stage | a stage with no way out. Every stage needs a tool that can move it — including the "not on file" path |

## The view — `render()` on the class

- The view is a **method of the class**, `render()`, returning JSX; the file is `agent.tsx` for
  that reason and for no other. There is no `views/` directory, no props and no second file: `this`
  is the state. A class that renders nothing sends an empty view, which is a fine agent.
- A prompt that has grown gets a function beside the class and `@render(ThePrompt)` on it — exactly
  `render() { return ThePrompt(this); }`. The props ARE the instance (`Prompt<T> = (agent: T) =>
  Child`), so destructure the fields and call the methods on the agent: `remembers` destructured
  loses its `this`. **Never both spellings on one class**; it is refused when the class is defined.
- It is the whole **dynamic** region, the last block, and the only one that may change between two
  turns. Never write into the class docstring per call; never reorder the blocks.
- `{condition && <p>…</p>}` is the whole control flow: `false`, `null` and `undefined` render
  nothing. `<p>` is a paragraph; siblings are one blank line apart. A render past one screen has
  two ideas in it: give one a `private method()` that returns JSX and call it.
- **Never splice a lookup into the view.** What memory recalled and what the knowledge base
  returned reach the model as `tool_result` blocks, JSON-encoded, because they came from outside
  the conversation and the view carries the operator's authority
  (`runtime/docs/security/prompt-injection.md`). What the class may ask is
  `this.remembers("médico habitual")` — a question about this call, never the fact's text.
- `this.call.channel` is how one class says two hours out loud and five in writing. It throws
  outside a call, so a ring-0 test gives one:
  `setCall(agent, new CallWorld({ id, contact, channel }, () => {}))`.
- Say what to do **in this turn**, not in general. A rule that is true of the whole call belongs
  in `<Rules>`; a rule about the turn the state is in belongs in a branch.

## `@state`, and what it turns off

- Three spellings, one declaration: `@state`, `@state({ pii: true })`, `@state({ visibility })`.
  `pii: true` beside a different `visibility` is refused by name.
- **Decorating one field decides them all.** No `@state` anywhere: every own field is state, as
  the example has it. `@state` on any field: *these and nothing else*, and an undecorated field
  is scratch — out of the snapshot, the prompt, `state.changed` and the console, and writable with
  no tool running. It is the only way to keep a helper field out of the log; reach for it on
  purpose, never by forgetting a decorator on a field that IS state.

## Before you call it done

- `pnpm lint && pnpm test` in the app, and `pinecall prompt` printed for each state you changed.
- A golden for the behaviour, in `test/<name>/goldens/`, named after what it is about
  (`no-reserva-antes-del-si.json`). See the `write-a-golden` skill.
- With `exactOptionalPropertyTypes`, a field a tool can empty again is `field?: T | undefined`.
- If the change is in `examples/`, the nightly drives it on two models: a rule that only holds on
  one of them is a finding, not a green.
