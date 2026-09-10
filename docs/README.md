# Docs

How to build an agent with this package. Five pages, in the order a person meets them: the first
is a walk from an empty directory to an agent that answers from your documents and remembers who
called, and the other four are the reference it points at.

| page | about |
|---|---|
| [tutorial.md](tutorial.md) | forty minutes, from nothing: the class, a call, knowledge, the knowledge base, memory, the log, and a test |
| [writing-an-agent.md](writing-an-agent.md) | the class: state, tools, stages, channels, hooks, events — and the shape of an app on disk |
| [the-prompt.md](the-prompt.md) | the prompt: named blocks in two regions, `render()`, and where what a lookup found actually lands |
| [testing-an-agent.md](testing-an-agent.md) | the four rings: unit tests, goldens, personas, and the score every real call gets |
| [the-cli.md](the-cli.md) | every verb, what it needs, and where its key comes from |

What the package IS, file by file, is [../ARCHITECTURE.md](../ARCHITECTURE.md). The two examples
in `../examples/` are the same material as working code, and they are what CI and the nightly run.

> `docs/decisions/` is the maintainer's engineering notebook — dates, measurements, the arguments
> as they happened — and it is git-ignored. A clone has these four pages and no such directory.
