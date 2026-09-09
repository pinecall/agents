# pinecall

Write an agent as a class. Its fields are what it remembers, its `@tool` methods are what the
model may do, its docstrings are the prompt, and its `.tsx` view is what it knows right now.

```ts
export default class ClinicaNorte extends Agent {
  phone = "+34910000000";
  language = "es";

  stage: Stages<"identify" | "choose" | "book"> = "identify";
  patient?: Patient;
  slot?: Slot;

  /** Busca al paciente por nombre y teléfono. Pide los dos antes de llamarla. */
  @tool({ stage: "identify" })
  async findPatient(name: string, phone: string): Promise<Patient | null> {
    this.patient = await agenda.find(name, phone);
    if (this.patient) this.stage = "choose";
    return this.patient;
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

## Five minutes

```
pnpm install                       nothing to build: the checkout runs from its sources
cd examples/clinica-norte
pnpm exec pinecall chat            the agent in this terminal, and a prompt against it
pnpm exec pinecall prompt --state test/prompts/states.json   the exact prompt a state produces
pnpm exec pinecall run             the app: the process you deploy
pnpm exec pinecall test            ring 1: the goldens, through the app in this process
scripts/build && pnpm exec pinecall ui     the console on 127.0.0.1 — the one thing a browser
                                           cannot read from TypeScript, so it is bundled first
```

A tenant that installed `pinecall` from npm has it on the PATH and writes `pinecall run`.

Working on the framework itself:

```
pnpm test          the framework and the console, in two vitest projects, from the sources
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
| `agent/` | the class a tenant extends: the Proxy, `@tool`, the state, the stages, the hooks |
| `views/` | the JSX-to-text runtime: the three regions, the markers the runtime fills |
| `call/` | the live call as a value: the room, the turns, the verbs. Reduced from entries |
| `client/` | `pinecall/client` — the socket, and nothing above it. Knows only the wire |
| `runtime/` | the bridge: what the class does, become what the wire sees |
| `cli/` | `pinecall <verb>`, and under `cli/ui/console/` the page one of them serves |

Beside it:

| | |
|---|---|
| `examples/` | `clinica-norte` and `tienda-sur`: two tenants, written as a customer writes one |
| `test/` | mirrors `src/`, plus the three that pin the shape: the tree, the imports, the surface |

## The three doors out of this package

- `pinecall` — the framework: the class, the views, the call, and `mount()`.
- `pinecall/client` — the socket alone, for an app that decides for itself what to answer.
- `pinecall/tsconfig.tenant.json` — the compiler flags an agent needs, so a tenant writes none.

`test/index.test.ts` and `test/client/index.test.ts` pin the first two by name. Adding an export
means editing a list on purpose, which is the point.

## Where the rest is

| | |
|---|---|
| [ARCHITECTURE.md](ARCHITECTURE.md) | what this package is, file by file: the entities, the bridge, the CLI, the console, the import table, and where LiveKit is and is not |
| [docs/writing-an-agent.md](docs/writing-an-agent.md) | the class: state, tools, stages, channels, hooks, events |
| [docs/the-prompt.md](docs/the-prompt.md) | the view: three regions, and where a rule belongs |
| [docs/testing-an-agent.md](docs/testing-an-agent.md) | the four rings: unit tests, goldens, personas, the score every call gets |
| [docs/the-cli.md](docs/the-cli.md) | every verb, what it needs, and where its key comes from |
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
