# Decisions

One page per thing that was decided, arguing about the code in this repository and no other.
A page is written when a choice cost something to make, and it says what it cost — the
alternatives that were measured, the ones that were tried and reversed, and the date.

The Python half of the product argues about itself in `pinecall/runtime`, and the wire in
`pinecall/protocol`. A page here that needs one of theirs names it; nothing links across a
repository boundary, because such a link rots the moment somebody clones one of them.

## The class a tenant writes

| page | about |
|---|---|
| [agent.md](agent.md) | the Agent base: reactive state, authored writes, tools read out of docstrings |
| [agent-model.md](agent-model.md) | `when` is the primitive and `stage` is how it reads |
| [agent-events.md](agent-events.md) | visibility, the events that reach the class, speaking, the room |
| [views.md](views.md) | JSX that renders to text, the markers the runtime fills, the render props |
| [prompt-regions.md](prompt-regions.md) | why the view is LAST, where each region is cut, what `--show-prompt` shows |

## What carries it

| page | about |
|---|---|
| [client.md](client.md) | `pinecall/client`: one socket, the agents on it, the log it can read |
| [bridge.md](bridge.md) | `src/runtime/`: the only place the class and the socket know about each other |
| [toolchain.md](toolchain.md) | one package, the four tsconfigs, two vitest projects, nothing aliased |

## The verbs

| page | about |
|---|---|
| [tenant-cli.md](tenant-cli.md) | `pinecall <verb>`: the whole list, where the key comes from, what is not built |
| [pinecall-test.md](pinecall-test.md) | ring 1: the goldens, the judges, and what the terminal shows while it runs |
| [simulate.md](simulate.md) | one persona calls the agent, live, and the checks resolve as they land |

## The page it serves

| page | about |
|---|---|
| [console.md](console.md) | why there is a console, why on 127.0.0.1, and why the gateway serves no page |
| [talk.md](talk.md) | the browser's microphone into the agent's room, and the three doors it was not |
| [evals-screen.md](evals-screen.md) | the runs, the deltas, and one call read back |

## The tenants

| page | about |
|---|---|
| [example-clinica-norte.md](example-clinica-norte.md) | the clinic: four stages, an agenda that refuses, ten goldens |
| [example-tienda-sur.md](example-tienda-sur.md) | the shop: a catalogue, a cart, an order that closes only on a yes |
