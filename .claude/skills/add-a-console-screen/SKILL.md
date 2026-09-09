---
name: add-a-console-screen
description: Add or change a screen of the console `pinecall ui` serves (Talk, Calls, Sessions, Pipeline, Evals). Use for any edit under src/cli/ui/console — a route, a panel, a stylesheet, a door the page reads.
---

# A screen of the console

`src/cli/ui/console/` is a **browser program that happens to live inside a Node package**. It has
its own laws, and three of them are held by tests written after the bug they describe.

## NEVER

- **Never import the framework.** `cli/ui/console/` may reach `@pinecall/protocol`, `react`,
  `react-dom`, `react-router`, `livekit-client`, `zod` and vite — and nothing else, ours included
  (`test/the-imports.test.ts`). None of `agent/`, `views/`, `runtime/` or `client/` would run in a
  browser, and a build that pulled a TypeScript parser into the bundle is a build nobody notices.
- **Never touch a key, never send an `authorization` header, never store anything.** The page
  holds no key: `pinecall ui` signs every request in front of it, so there is nothing to remember.
  `the-key-is-never-in-the-page.test.ts` greps the source for `localStorage`, `sessionStorage` and
  `authorization`, and then **builds the console itself** into a temp directory and greps the
  bundle for anything shaped like a key and for `PINECALL_(API|DEV)_KEY`.
- **Never build a URL by hand.** `lib/api.ts` is the only place a request to the gateway is built
  (`read`, `put`, and the SSE in `lib/stream.ts`). Everything is relative to `BASE`, the path the
  console was opened at.
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
4. `router.tsx` — one route under `/a/:agent/…`, appended.
5. `shell/rail.tsx` — one entry in `SCREENS`, if a person should be able to walk to it.

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
scripts/build                 # vite → dist/cli/ui/console, the path `pinecall ui` serves
cd examples/clinica-norte && pnpm exec pinecall ui
```

A checkout must be built once before `pinecall ui` shows anything: a browser reads no TypeScript,
and the verb says exactly that when the bundle is missing.
