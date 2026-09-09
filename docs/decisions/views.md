# The views: JSX that renders to text, in three regions

A view is a `.tsx` file next to the agent. It is a function of the state and it returns
text. Not DOM, not React: `src/views/jsx-runtime.ts` is a complete
automatic JSX runtime whose elements are a three-field object and whose renderer walks
that tree into a string. The tenant writes `<p>…</p>` because the shape of a prompt is
the shape of a document, and because a conditional paragraph reads better as
`{done && <p>…</p>}` than as an `if` appending to an array.

## The whitespace rule

Written down here because a prompt that changes shape between two turns is a cache miss
and a bug report nobody can reproduce.

- A `<p>` is one paragraph. Everything inside it is inline: the strings the author wrote
  keep their inner spacing exactly (`{name} tiene cita el {day}` needs those spaces), and
  the newlines and indentation the source was formatted with collapse to one space.
- Siblings are separated by exactly one blank line. There is never a blank line at the
  start or the end of a region.
- `null`, `false`, `undefined` and the empty string render nothing at all — not an empty
  line. `{slots.length > 0 && <p>…</p>}` therefore leaves no trace when it is false.
- A bare string in block position is trimmed at both ends and left alone inside.
- Arrays flatten; a `<>` fragment adds nothing of its own.

`renderToText` is the whole public surface of the runtime; `blocks` exists so a component
that joins its children its own way (the rules list, one line each) can do it without
re-implementing the walk. `jsx-dev-runtime.ts` re-exports the same functions and defines
nothing: a dev build and a prod build of the same prompt must not be able to differ.

## Why the static region holds ALL the tools

The static region is the cached prefix. Its contract is not "the stuff at the top", it is
**byte-identical across state changes** — the acceptance criterion, pinned by a test that
books an appointment and compares the region before and after.

`@tool({ when })` makes a tool's *visibility* state-dependent, so putting only the visible
tools' docs in the prefix would break it on the first tool call. The alternative — moving
the tool docs into the dynamic tail — costs a cache miss on the largest state-independent
block we have.

So the prefix lists every declared tool, one line each: `- name: docstring`. Visibility is
a **wire** concern, not a prompt concern: `visibleTools(agent)` is what the runtime puts in
the request, and a model cannot call a tool that is not in that list, whatever the prompt
said. The prompt tells the model what this agent can do; the wire decides what it may do
right now. The line is the docstring, never the JSON schema — the schema is what the wire
carries, and repeating it in prose is tokens spent twice.

## The marker contract

The framework never opens a file, never searches a memory, never retrieves a passage. It
writes a marker on its own line and the gateway replaces that line:

```
<!-- knowledge: ./knowledge/clinica.md -->
<!-- memory: {"kinds":["preference","health"],"limit":5,"fill":"fill-3"} -->
<!-- retrieved: {"k":5,"minScore":0.4} -->
<!-- collapsed: {"seq":7} -->
```

`<!-- name: payload -->`, one per line, payload a path for `knowledge` and JSON for the
rest. Filling a region is a line-by-line pass; anything that is not a marker is prose.

A render prop (`<Memory>{facts => <p>Recuerda: {facts}</p>}</Memory>`) cannot travel inside
a marker, so the function stays in a registry under an id and the marker carries the id as
`fill`. The filler calls `fill(id, data)` and gets text back. `resetFills()` when a call
ends. This is the seam the memory service fills.

## The three regions

`layout(agent, view, context)` returns `{ static, history, dynamic }` and nothing may
reorder them. `static` = class docstring → knowledge marker → the standing rules → the
protocols → the tool docs. `history` is the runtime's: the framework contributes only the
`collapsed` markers a `collapse()` left behind. `dynamic` = the memory and retrieval
markers and the view's text — the view puts them where it wants; an agent configured with
`memory` gets one anyway.

The class docstring only reaches the prefix if somebody handed the class its own source
(`describe(Ctor, source)`), because a JSDoc above a class is not in `Ctor.toString()`.
That is the loader's job — `pinecall run` — and the tests do it explicitly.

## What convo taught, and what we did differently

`~/prueba-abai/convo/prompting/` renders a prompt from Markdown files: `render.py` reads
`prompts/<view>.md` and expands `{% include %}` lines; `layout.py` composes knowledge tag,
view, protocols in a fixed order. Two things we took: **the order is the module's, not the
tenant's** (a view cannot decide to put the protocols last), and **the standing protocols
are one constant block**, identical for every tenant, so they cost nothing to cache.

What we did differently: convo's views are static text chosen by a stage name, and the
state reaches them by picking a different file. We have no stages, so a view is one
function of the whole state and a paragraph appears because `when` the state says so —
which is why the template language had to become code, and why a code template renders to
text through a JSX runtime instead of through a string mixer. And convo cuts the prompt in
one string; we cut it into three regions because the cache boundary is the point.
