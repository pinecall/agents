---
name: add-a-console-screen
description: Add or change a screen of the console — the gateway's (production) or the one `pinecall serve` puts on this machine (the sandbox) — Talk, Calls, Sessions, Settings, Tokens, Team and the rest. Use for any edit under src/cli/ui/console — a route, a panel, a stylesheet, a door the page reads.
---

# A screen of the console

`src/cli/ui/console/` is a **browser program that happens to live inside a Node package**. It has
its own laws, and three of them are held by tests written after the bug they describe.

## NEVER

- **Never import the framework.** `cli/ui/console/` may reach `@pinecall/protocol`, `react`,
  `react-dom`, `react-router`, `livekit-client`, `zod` and vite — and nothing else, ours included
  (`test/the-imports.test.ts`). None of `agent/`, `views/`, `runtime/` or `client/` would run in a
  browser, and a build that pulled a TypeScript parser into the bundle is a build nobody notices.
- **Never touch a key outside `lib/session-key.ts`, and never write a header by hand.** The
  gateway's console keeps ONE key — the person's — in `localStorage`, through that file alone;
  `shared/api.ts:headersFor` puts it on every request as a Bearer, with the world (`pinecall-env:
  production` on the hosted console) and the corner. The local console holds no key at all:
  `pinecall serve` signs what it forwards. `signing-out-forgets-the-key.test.ts` pins the sign-out.
- **Never ask which world a screen is in to decide what it may do.** The mode IS the world
  (`lib/mode.ts`): the hosted console is production and edits production's corner — Settings and
  Lexicon included, with history and rollback, and no promote anywhere — while the local one edits
  your corner or the team's. A person without production access is stopped at the way in
  (`screens/login/no-production.tsx`), not screen by screen.
- **Never build a URL by hand.** `shared/api.ts` is the only place a request to the gateway is
  built (`read`, `put`, and the SSE in `lib/stream.ts`). Everything is relative to `BASE`, the path
  the console was opened at.
- **Never rename or reorder a route in `router.tsx`.** It is a seam: append, never reshuffle. And
  import a screen by its **directory** (`./screens/evals`), never a file inside it.
- **Never invent a metric name or a verdict word.** `lib/metrics.ts` is the only file that names a
  metric, drawn field by field under livekit's own names; `passed` absent on `call.score` is a
  THIRD state — nobody judged — and reads as neither green nor red.

## Adding a screen

1. `screens/<name>/index.ts` — the door: `export { Name } from "./name";` and one line saying what
   is behind it. Nothing outside the directory reaches deeper than this file.
2. `screens/<name>/<name>.tsx` — the screen. Data comes from a `use-<thing>.ts` hook beside it;
   the envelope a door answers in is a zod schema in `door.ts`, parsed, never trusted.
3. `screens/<name>/<name>.css` — its own stylesheet, **and every class prefixed by the thing it
   belongs to**. Vite bundles every stylesheet into one file the whole console wears, so a class
   is global whatever directory it was written in: `.mark` was the Talk transcript's line *and*
   the Sessions timeline's cell, and a `width: 1.5em` meant for the table squeezed the paragraph
   to one character per line. `styles/page.css` is the one deliberately shared vocabulary.
4. `lib/mode.ts` — one row in `ORG_SCREENS` or `AGENT_SCREENS`, saying which console has it
   (`hosted`, `local`, or both): the sidebar draws that table and `router.tsx` routes it, so a
   screen a console does not have is neither linked nor reachable. `lib/scopes.ts` gates it by the
   scope that opens its doors; a screen nobody gated is open to every key (Tokens is).
5. `router.tsx` — the screen's import, by its directory, appended.

**The URL is the state.** Which agent, which screen, which call: nothing the console holds in
memory decides what is on screen, so a reload lands on exactly the same thing. The console keeps
no selection of its own — the rail is highlighted by the URL.

## Reading the log

- One call as it happens: `use-call.ts` — the folded state for the first paint, then every entry
  over SSE, painted ten times a second.
- A finished call, whole: `log-pages.ts` — page by page, oldest first, until a short page.
- A verdict: `lib/score.ts` — the log **seals** on `call.score`, so on a finished call it is the
  entry at `last_seq`; read from one below it rather than paging a whole conversation.
- Anything a person reads as a sentence — a supervisor's move, a state change, a confirmation —
  goes through one function (`supervisor-mark.ts`, `timeline-rows.ts`) so every screen draws it
  the same way.

## The room, and the only livekit in this repository

Three files touch `livekit-client`, all here: `screens/talk/use-room.ts`, `lib/use-listen.ts`,
`lib/use-supervise.ts`. They receive a **seat** minted through the CLI's door; the page never
holds a key and never talks to LiveKit's API. The desk sends **one** verb per gesture and asks for
**one** seat — `the-desk-sends-one-verb.test.ts` counts both, with livekit mocked.

## Verify

```bash
pnpm lint                     # includes tsc -p tsconfig.console.json: the page against the DOM
pnpm test                     # the console is the second vitest project; the key test builds its own bundle
scripts/build                 # vite → dist/cli/ui/console, the path `pinecall serve` serves
cd examples/clinica-norte && pnpm exec pinecall serve
```

A checkout must be built once before `pinecall serve` shows anything: a browser reads no TypeScript,
and the verb says exactly that when the bundle is missing.
