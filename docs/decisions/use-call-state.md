# useCallState — one subscription per call, the public projection, a replay per gap

`web/` is the one package here somebody installs without the framework: a customer's page must
not pull in a TypeScript loader to read its own call. livekit-client is the session — the
microphone, the audio, the room — and livekit's own components are the widget. What livekit
cannot know is what the agent knows: the cart, the booking, the pending "yes?". That travels on our
log, and `useCallState(call, select)` is how a tenant's page reads it.

## Why one subscription per call

A page has many components that read the call — a status pill, a cart, a transcript — and a
subscription is a wire: an `EventSource` on the gateway, or listeners on the room's DataChannel. Ten
components must not be ten wires, and the last one to unmount must close the one there is. So
`subscriptions.ts` keeps one `Subscription` per call, keyed by what names the call on the input
(the `Room` object, the call id, or a `CallSource` of one's own), opened by the first `listen` and
closed by the last leave. The registry is emptied as it empties: nothing in the module outlives a
call, and `stateOf` on a call nobody listens to answers the same empty state as any other.

The hook is `useSyncExternalStoreWithSelector` (React's own shim) over that registry. `keyOf` is
the memo key, not the input object: `{ room }` written inline is a fresh literal every render and
must not reopen the wire.

## Why the public projection only

A browser holds a call token, and a call token reads its own call through the public projection
(`docs/protocol/projections.md`): the status, the words, the public `app_state` fields, the room's
seats without their attributes, a confirmation's phrase. The API key never reaches the browser, so
the tenant projection never does either. `PublicState` is that whitelist as a `Pick` of the
protocol's `State`: a field the platform keeps from a guest is absent from the type, not null, so
the page cannot even ask for it.

The fold is the protocol's own `apply`, over a state that starts as `initialState()` and is
overlaid with whatever the snapshot carries. The overlay matters: a public snapshot has no `gaps`,
no `metrics`, no `tools`, and the reducer appends to those lists when it records a gap or a metric.
Starting from the empty state gives every list a place to append to.

## Why a seq gap triggers a replay, and what the hook does while it waits

Every entry carries a `seq`, and the wire promises order but not delivery: a DataChannel packet
can be lost, an SSE stream can drop and resume. An entry whose seq skips past `state.seq + 1` is
held, never folded, and the source is asked once — `replay(state.seq)` — for what lies between.
Held entries fold the moment the gap closes, in order; a second gap while one replay is out asks
nothing more. The answer always ends with `log.caught_up`, whose seq says everything the store had
up to there has been sent: whatever is still missing below it was an ephemeral that is gone, or an
entry the projection dropped, and the held entries fold from there. A `log.gap` that carries a
snapshot is a snapshot; one that carries none records the gap and moves on.

The cost of that rule is worth naming. The public projection drops entries whole — every
`tool.*`, every `metrics.*`, `prompt.changed` — and leaves no trace of their seq, so a guest
sees a gap at nearly every turn and asks for a replay it did not need. The answer is one round
trip and one `log.caught_up`, so the page is right, a beat late. A cheaper wire would tell the
guest which seqs were dropped; that is the sink's to add, not the client's to guess.

Over the DataChannel a replay is `pinecall.replay {after}` to the worker; over the gateway it is
the same `/events` door again from `?after=`. The browser's own `EventSource` is the SSE client —
no parser is written here — and it resends `Last-Event-ID` itself on a drop.

## What the state looks like to React

The reducer appends to the arrays it is given, so the fold hands it a `structuredClone` and keeps
every state it ever published untouched. A selector is then compared by value (`JSON.stringify`),
not by identity: `s => s.app_state.cart` renders once when the cart moves and not at all when the
caller takes a turn, and `s => s.turns` renders when a turn lands. A fresh object per entry costs a
clone of a state the size of a conversation; a wrong render costs a reader's trust.

## Where the wire and the codec disagree today

`publicEntry` completes a guest's envelope with `agent: ""` and `call: null` before `decodeEntry`:
the public envelope drops both (a guest learns nothing of whose fleet answered) and the generated
`EntrySchema` requires both. That is two fields the reducer keeps neither of. The event data is a
different matter: the projection sends `call.started` without `from`/`to`/`caller`, `turn.user`
without `metrics`, `confirm.request` as `phrase` and `ttl_s`, `call.line` without `muted`, and a
`log.gap` snapshot without the tenant's fields — and every one of those is required by the strict
event schema `apply` parses against. The fold refuses such an entry, says so on the console, and
moves the cursor past it, so the state stays consistent and a little poorer. `state.changed`,
`turn.agent`, `user.state`, `agent.state`, the transcripts, `call.ended`, `call.transferred` and
`log.caught_up` decode whole. The fix belongs to the protocol — a generated public schema, or
the projection keeping required fields as null — and is filed on the card, not papered over here.
