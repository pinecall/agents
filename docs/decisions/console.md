# The console — local, served by `pinecall ui` on 127.0.0.1

The console is a React app under `src/cli/ui/console/`, inside the package whose verb serves
it. It is not a package of its own — nobody installs it — so it is a browser program living
where its one reader lives, built by vite straight into `dist/cli/ui/console/`. It reads the log
and shows it,
and holds no truth of its own: no reducer and no wire type of its own, both come from
`@pinecall/protocol`, the same reducer the runtime folds a log with in Python. Screens, per
agent: **Talk** (the browser's microphone into the agent's room, the words drawn as the voice says
them), **Calls** (every call as it happens: the transcript, the state, the room, the metrics),
**Sessions** (the finished ones), **Pipeline** and **Evals**. And the fleet's list of agents at `/`.

It was deleted on the morning of 2026-09-08 and came back the same evening. Both are kept here.

## How it is served, and by whom

**The gateway serves no page.** `runtime/tests/gateway/test_no_page.py` pins it: `/`, `/a/<slug>`
and an asset path answer the same JSON 404 every undeclared path answers.

**`pinecall ui [agent]` serves the console** from the tenant's CLI, on the loopback, for the life
of the command (`src/cli/ui/`). Under one random path — sixteen bytes, in the
one URL the command prints and opens — it serves the built console and forwards `v1/*` to the
gateway with the org key on the header. So the page holds no key, sends no key, and keeps
nothing in a browser's storage (`test/cli/ui/console/the-key-is-never-in-the-page.test.ts`); the CLI
signs every request in front of it, and a process on this machine that scans the loopback finds
a port and, without the URL, a 404. Ctrl-C closes the port with the command.

The console reads its base off the path it was opened at (`src/cli/ui/console/lib/base.ts`) and hands it
to the router and to every door; the CLI puts a `<base href>` into the page so the assets are
addressed from there whatever screen the address bar stands on. `talk` is not a verb any more: it
is the first screen of `ui`, and `pinecall ui` in an agent's directory lands on it.

## Why it left, and why it came back

Bernardo, 2026-09-08, morning: *"el servidor a lo suyo, no hacer estas cosas; la consola se
elimina."* The console was then served by the gateway off its own `dist`, with a catch-all route
under every door and a login that kept the key in `sessionStorage`. A control plane that also
ships a bundle is two products in one process, and none of it bought anything the API did not
already give. It was deleted whole, and `pinecall talk` became a page of its own that the CLI
served on 127.0.0.1 ([talk.md](talk.md)).

Bernardo, the same evening, after the first real call from that page: *"me arrepentí, quiero que
la consola exista, y sea el talk: `pinecall ui`, donde esté el talk, logs en vivo."* What had
been wrong was where the console lived and who held the key, not the console. Served by the
CLI, under a nonce, signing with the key it already holds, it is the talk page with every other
screen beside it — the same thing the gateway never had to know about.

## The desk lives in Calls, and the log is its only feedback

The supervisor's six verbs (`docs/decisions/supervise.md`) are a strip in the head of the call
being watched, beside listen — Bernardo, 2026-09-09: *"es el mejor lugar."* A screen of its own
would have been a second place to look for one call, and the timeline under the strip is already
the answer to what a verb did: every verb writes its `supervisor.*` entry, and the console draws
each of the six as one sentence (`src/cli/ui/console/lib/supervisor-mark.ts`), on the Calls timeline and
on the Talk transcript alike. So the panel keeps exactly one piece of state, `holding`, which is
the only thing the log cannot tell it fast enough to keep a button honest; everything else it
knows, it reads.

Two seats, not one. `POST /v1/calls/{call}/listen` mints a hidden, silent ear and
`POST .../supervise` mints a seat that publishes a microphone, and the console holds them in two
hooks with two rooms (`use-listen.ts`, `use-supervise.ts`): a supervisor usually listens for a
while before deciding to speak, and joining with a microphone to read a call would put a
participant in the room for every call anybody opens. The supervise seat is minted the first time
the line is taken and kept until the screen unmounts, because a takeover and the release that
answers it are two clicks minutes apart. Both doors are asked through the CLI's proxy, so the
page still holds no key; the room token it does hold is good for one call and publishes one
microphone.

The microphone is livekit's own `setMicrophoneEnabled` (LocalParticipant), which opens it and
publishes it in one call, and `unpublishTrack(track, true)` on the way back — unpublished and
stopped, never merely muted: a publication left in the room is a recording light on the
supervisor's laptop for a call they are no longer speaking into.

Two of the six moves cannot be taken back, so neither leaves on a stray click: a transfer needs
its number typed into the strip and entered, and `end` asks a second time in the button itself. A
refusal is never rephrased — the gateway's own sentence (`409 the call has ended`,
`ONLY_COLD`, `call.transfer: this call has no SIP leg…`) is what the strip shows.

## What it is not

Not a product's widget: that is `@pinecall/web`, a customer's page reading its own call with a
visitor's token. Not a desktop app: that reads this same API when it is written. And never the
gateway's: the deploy carries `runtime/` and `evals/` and no page.
