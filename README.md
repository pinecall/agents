# pinecall

Write an agent as a class. Its fields are what it remembers, its `@tool` methods are what the
model may do, its docstrings are the prompt, and its `render()` is what it says about right now.

```tsx
export default class ClinicaNorte extends Agent {
  phone = "+34910000000";
  language = "es";

  stage: Stages<"identify" | "choose" | "book"> = "identify";
  patient?: Patient | undefined;
  slot?: Slot | undefined;

  /** Busca al paciente por nombre y teléfono. Pide los dos antes de llamarla. */
  @tool({ stage: "identify", pii: ["name", "phone"] })
  async findPatient(name: string, phone: string): Promise<Patient | null> {
    this.patient = await this.agenda().find(name, phone);
    if (this.patient) this.stage = "choose";
    return this.patient ?? null;
  }

  /** El prompt como función del estado: lo único que cambia entre dos turnos. */
  override render() {
    return (
      <>
        {this.stage === "identify" && <p>Saluda y pide nombre y teléfono.</p>}
        {this.patient && <p>Hablas con {this.patient.name}, ya en la ficha.</p>}
      </>
    );
  }
}
```

One class, three doors: the same agent answers the web, WhatsApp and the telephone, and
remembers the customer across them. What does the real time — the audio, the rooms, the log,
the tenants — is `pinecall/runtime`, a Python distribution this package never imports and only
ever talks to over a socket.

```
npm install pinecall
```

## Install

```bash
npm i -g pinecall        # the CLI and the console, anywhere
npm i pinecall           # or as a dependency, to write an agent in your own project
```

You need a gateway for the CLI to talk to — `pip install pinecall` is that, and
[from-zero](https://github.com/pinecall/runtime/blob/main/docs/from-zero.md) walks both halves up
on a laptop in one sitting. To read this code or run the example, clone instead:

## Five minutes

```
pnpm install                       nothing to build: the checkout runs from its sources
cd examples/clinica-norte
pnpm exec pinecall link            sign in through a browser, pick the org: your key, in ./.env
pnpm exec pinecall chat            the agent in this terminal, and a prompt against it
pnpm exec pinecall prompt --state test/clinica-norte/prompts/states.json   the exact prompt a state produces
pnpm exec pinecall start           the app: the process you deploy
pnpm exec pinecall console         the sandbox's console, in a browser, signed in as this key
pnpm exec pinecall docs push       docs/clinica-norte/ to the gateway, as the base the agent searches
pnpm exec pinecall docs attach clinica-norte --k 4   the agent reads that base, in your corner
pnpm exec pinecall agent knowledge edit              what it knows by heart, in $EDITOR, as a setting
pnpm exec pinecall test            ring 1: the goldens, through the app in this process
```

Two consoles, one per world, and both are the box's own pages: it answers to two names, and the one
you open decides which world you are looking at — `sandbox.pinecall.io` for what you are running,
`box.pinecall.io` for production. `pinecall console` opens the first and `--prod` the second,
signed in as this project's key without it ever leaving the terminal.
[docs/the-cli.md](docs/the-cli.md#console).

Every verb reads `PINECALL_KEY` (and `PINECALL_URL`, when the gateway is not the cloud) from the
environment, else from the project's `.env`, which `pinecall link` wrote; each is the sandbox until
`--prod` says production, for a person whose org lets them act there. On a server the agent runs
on a server's token from the console's Tokens screen, as `pinecall start --prod` or mounted inside
your own Node app — [docs/production.md](docs/production.md). `pinecall agent list --prod` says
which process holds each agent, on which machine, since when, and `pinecall agent stop <app>` stops
one.

A tenant that installed `pinecall` from npm has it on the PATH and writes `pinecall start`. One
layout, one agent or five: the class in `agents/<name>/agent.tsx`, what it searches in
`docs/<name>/`, its goldens and memory cases under `test/<name>/`, and one `pinecall
start` at the root holds them all — [docs/the-cli.md](docs/the-cli.md#the-project). The class is
the contract — doors, language, state, tools, `render()` — and what it runs on is the world's:
voice, model, opening, what it knows by heart and which base it searches are settings, per world
and versioned, never fields of the class.

Working on the framework itself:

```
pnpm test          the framework and its CLI, from the sources
pnpm lint          tsc over src and test, then over the console against the DOM
scripts/build      what is published: dist/, and the console bundle inside it
scripts/check      build, then lint, then test — what CI runs
```

`package.json` exports point at `src/`, and `publishConfig` swaps them for `dist/` at publish
time. So a checkout — this one, and every example in it — imports the framework's sources
through `node_modules` like any package, and there is no build between a change and a test.

## The map

`src/` is the package. Six directories, and the import table in `test/the-imports.test.ts` is
what keeps them apart — a directory earns its place there by having a line. What each one is,
file by file, is [ARCHITECTURE.md](ARCHITECTURE.md).

| directory | what it is |
|---|---|
| `agent/` | the class a tenant extends: the Proxy, `@tool`, `@render`, `@state`, the stages, the hooks |
| `views/` | the JSX-to-text runtime, and the prompt as named blocks in two regions |
| `call/` | the live call as a value: the room, the turns, the verbs. Reduced from entries |
| `client/` | `pinecall/client` — the socket, and nothing above it. Knows only the wire |
| `runtime/` | the bridge: what the class does, become what the wire sees |
| `cli/` | `pinecall <verb>`, and under `cli/ui/` what `start` answers a console with. The page itself is `../console` |

Beside it:

| | |
|---|---|
| `examples/` | `clinica-norte`: one tenant, written as a customer writes one |
| `test/` | mirrors `src/`, plus the four that pin the shape: the tree, the imports, and the two public surfaces |

## The three doors out of this package

- `pinecall` — the framework: the class, the JSX-to-text runtime, the call, and `mount()`.
- `pinecall/client` — the socket alone, for an app that decides for itself what to answer.
- `pinecall/tsconfig.tenant.json` — the compiler flags an agent needs, so a tenant writes none.

`test/index.test.ts` and `test/client/index.test.ts` pin the first two by name. Adding an export
means editing a list on purpose, which is the point.

## Where the rest is

| | |
|---|---|
| [ARCHITECTURE.md](ARCHITECTURE.md) | what this package is, file by file: the entities, the bridge, the CLI, the console, the import table, and where LiveKit is and is not |
| the runtime's `docs/from-zero.md` | **self-hosting**: a runtime of your own, from nothing, through to this clinic answering — every command run, every output what came back |
| [docs/tutorial.md](docs/tutorial.md) | from an empty directory to an agent that answers from your documents and remembers who called |
| [docs/writing-an-agent.md](docs/writing-an-agent.md) | the class: state, tools, stages, channels, knowledge · docs · memory, hooks, events |
| [docs/the-prompt.md](docs/the-prompt.md) | the prompt: named blocks in two regions, `render()`, where what a lookup found lands, and where a rule belongs |
| [docs/testing-an-agent.md](docs/testing-an-agent.md) | the five rings: unit tests, goldens, personas, one call replayed, the score every call gets |
| [docs/testing-memory-and-knowledge.md](docs/testing-memory-and-knowledge.md) | memory's own goldens, the index's, and why a call has no retrieval score |
| [docs/the-cli.md](docs/the-cli.md) | every verb, what it needs, and where its key comes from — one agent, or a project of several |
| [docs/worlds-and-teams.md](docs/worlds-and-teams.md) | one key per person, the production switch, the two worlds, a team from the invitation to the rollback |
| [docs/production.md](docs/production.md) | running the agent on your own server: the server's token, the two ways, the release push, changes with `--prod` |
| [CHANGELOG.md](CHANGELOG.md) · [CLAUDE.md](CLAUDE.md) | what changed · the working agreement |

## The wire

`@pinecall/protocol` is generated from JSON Schema in `pinecall/protocol` and committed there,
so nothing here runs a generator. `pnpm-workspace.yaml` names that checkout as a workspace
package until it is published, and that package exports its sources the same way. The golden call log comes from the same package, which is how a
log folded here and a log folded in Python are proved to be the same log.

## License

[Apache-2.0](LICENSE). Use it, change it, run it in production, sell what you build with it —
commercially or not, on your own box or somebody else's. The licence carries an explicit patent
grant, which is why it is the one this stack uses (LiveKit's is the same). There is no NOTICE
file, so nothing has to be reproduced downstream beyond the licence itself, and there is no CLA:
a patch is yours and stays under the same terms.

`pinecall` on npm, `pinecall/client` beside it. `@pinecall/protocol` is Apache-2.0 too.
