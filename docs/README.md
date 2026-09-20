# Docs

How to build an agent with this package. Nine pages, in the order a person meets them: the first
is a walk from an empty directory to an agent that answers from your documents and remembers who
called, and the rest are the reference it points at.

| page | about |
|---|---|
| [tutorial.md](tutorial.md) | forty minutes, from nothing: the class, a call, what it knows by heart, the documents it searches, memory, the log, and a test |
| [writing-an-agent.md](writing-an-agent.md) | the class: state, tools, stages, channels, hooks, events — what is the world's and not the class's — and the one layout of a project on disk |
| [the-prompt.md](the-prompt.md) | the prompt: named blocks in two regions, `render()`, and where what a lookup found actually lands |
| [testing-an-agent.md](testing-an-agent.md) | the five rings: unit tests, goldens, personas, one call replayed, and the score every real call gets |
| [testing-memory-and-knowledge.md](testing-memory-and-knowledge.md) | the goldens that are not about one call: what the agent remembers, what it recalls, whether the index answers, and why a call has no retrieval score |
| [the-cli.md](the-cli.md) | every verb — `link`, `start`, `serve` and the rest: what it takes, what it prints, where its key comes from, and which gateway doors it knocks at |
| [worlds-and-teams.md](worlds-and-teams.md) | from the invitation to the rollback: one key per person, the production switch, the sandbox and production, where each is watched, testing by phone, a team walked through |
| [the-console.md](the-console.md) | the console, screen by screen — both of them: the mode that IS the world, the org's floor, an agent's tabs, the box's screens, and the way in |
| [production.md](production.md) | running the agent on your own server: the server's token, inside your Node app or as its own process, the documents pushed in the release step, changes with `--prod` |

Beside them, [console-content-brief.md](console-content-brief.md) is the same console at length —
every value, and the door it comes from — which is the working note the page above is drawn from.

What the package IS, file by file, is [../ARCHITECTURE.md](../ARCHITECTURE.md). The example in
`../examples/` is the same material as working code, and it is what CI and the nightly run.

**Writing your own client?** Everything this package does, it does over the gateway's public API,
and that contract is documented door by door in the **runtime** repo's
`docs/protocol/gateway-api.md` — the app socket, the callers, the log, the seats, the knobs, the
vault — with a thirty-line app in it that uses no Pinecall package at all.

> `docs/decisions/` is the maintainer's engineering notebook — dates, measurements, the arguments
> as they happened — and it is git-ignored. A clone has the pages above and no such directory.
