# pinecall

Build voice and chat agents as TypeScript classes. Fields are the agent's state, `@tool`
methods are what the model can call, docstrings are the prompt, and `render()` describes the
current turn.

```tsx
export default class ClinicaNorte extends Agent {
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

  /** The prompt as a function of state: the only part that changes between turns. */
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

The same agent answers the web, WhatsApp and the phone, and remembers a customer across them.
Audio, rooms, the call log and tenants are handled by the
[Pinecall runtime](https://github.com/pinecall/runtime), which this package talks to over a
WebSocket.

## Install

```bash
npm i -g pinecall   # the CLI
npm i pinecall      # as a dependency, to write an agent in your project
```

The CLI needs a gateway: use Pinecall's hosted one, or run your own with
[`pip install pinecall`](https://github.com/pinecall/runtime) (see
[from-zero](https://github.com/pinecall/runtime/blob/main/docs/from-zero.md)).

## Quick start

```bash
pnpm install
cd examples/clinica-norte
pnpm exec pinecall link      # sign in through the browser; writes your key to ./.env
pnpm exec pinecall chat      # talk to the agent in this terminal
pnpm exec pinecall start     # run the agent (this is the process you deploy)
pnpm exec pinecall console   # open the sandbox console
pnpm exec pinecall test      # run the goldens
```

Other useful verbs: `pinecall prompt --state <file>` prints the exact prompt a state produces;
`pinecall docs push` uploads a knowledge base and `pinecall docs attach <base>` gives it to the
agent. Every verb runs against the sandbox unless `--prod` is given. The CLI reads `PINECALL_KEY`
and `PINECALL_URL` from the environment or the project's `.env`. Full reference:
[docs/the-cli.md](docs/the-cli.md).

A project holds one or more agents: `agents/<name>/agent.tsx`, their documents in
`docs/<name>/`, their tests in `test/<name>/`. Voice, model, greeting and knowledge are
per-world settings, not class fields. Running in production on your own server:
[docs/production.md](docs/production.md).

## Development

```bash
pnpm test          # the framework and CLI, from sources
pnpm lint          # tsc over src and test
scripts/build      # the published build (dist/)
scripts/check      # build, lint, test — what CI runs
```

`package.json` exports point at `src/` and `publishConfig` switches them to `dist/` on publish,
so tests and the example run from sources with no build step.

| `src/` | |
|---|---|
| `agent/` | the `Agent` class, `@tool`, `@render`, `@state`, stages, hooks |
| `views/` | JSX-to-text rendering and the prompt's named blocks |
| `call/` | the live call as a value, reduced from log entries |
| `client/` | `pinecall/client`: the WebSocket client and the wire, nothing else |
| `runtime/` | the bridge between the class and the wire |
| `cli/` | the `pinecall` CLI |

`test/the-imports.test.ts` enforces which directory may import which. The public exports are
`pinecall`, `pinecall/client` and `pinecall/tsconfig.tenant.json`, pinned by
`test/index.test.ts` and `test/client/index.test.ts`.

The wire is the runtime's, kept in `src/wire/`; the runtime's golden call log, in
`test/wire/golden/`, is how this package and the runtime are checked to fold a log identically.

## Documentation

| | |
|---|---|
| [docs/tutorial.md](docs/tutorial.md) | from an empty directory to an agent with knowledge and memory |
| [docs/writing-an-agent.md](docs/writing-an-agent.md) | state, tools, stages, channels, knowledge, memory, hooks |
| [docs/the-prompt.md](docs/the-prompt.md) | how the prompt is built and cached |
| [docs/testing-an-agent.md](docs/testing-an-agent.md) | unit tests, goldens, personas, replays, scores |
| [docs/the-cli.md](docs/the-cli.md) | every CLI verb |
| [docs/worlds-and-teams.md](docs/worlds-and-teams.md) | keys, sandbox and production, teams |
| [docs/production.md](docs/production.md) | running an agent on your own server |
| [ARCHITECTURE.md](ARCHITECTURE.md) | the package file by file |

## License

[Apache-2.0](LICENSE), including its patent grant. No CLA.
