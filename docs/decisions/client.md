# The SDK

Why the client is the way it is. The code is `src/client/`; the wire it speaks is
`docs/protocol/`, and every shape on it comes from `@pinecall/protocol`, generated.

## One dependency, and it is `ws`

Node 24 ships a `WebSocket` global, and it is the browser's: the constructor takes a URL and a
subprotocol list, and nothing else. The gateway wants the API key as `Authorization: Bearer` on
the upgrade — never in the URL, because a URL ends up in an access log — and the browser API has
no way to set a header on the handshake. That single missing argument is the whole reason `ws`
is here.

Everything else the client needs, Node already has: `fetch` reads the log, its response body is
an async iterable so SSE is a `split("\n\n")` and no parser library, `AbortSignal` stops a
reader, `node:http` is enough to fake the log door in a test. So the dependency list is one
line long and it buys one header.

## The codec is imported, never written

The wire is snake_case; TypeScript is not. There is exactly one correct place to change a key
name and `@pinecall/protocol`'s generated `toCamel`/`toSnake` is it — including the part that is
easy to get wrong, which is where **not** to change one: `state`, `arguments`, `output`,
`metadata` and the other opaque keys are the app's own JSON, and renaming a field inside a
tenant's state would be the platform editing the tenant's data.

So `frames.ts` is the only file in the SDK that builds a frame, it builds it by handing camelCase
to `toSnake`, and then it parses the result with the command's own generated schema. That last
step is not paranoia about our own codec: it means a shape the gateway would refuse is refused
here, in the app's process, with the app's stack trace, instead of coming back as an `error`
entry three network hops later. The schema is used through one structural `{ parse }` type, so
no version of zod is ever named on this side of the workspace.

## Reconnect re-registers, because the registry is memory

`docs/decisions/gateway.md` is explicit: the registry holds socket → agents and nothing durable,
and it dies with the process. That is the right design, and it makes one thing the client's job:
**everything the gateway knows about this app must be true again after every reconnect.** So
`Connection` calls one handler when the socket opens — not when `connect()` is called — and that
handler sends `agent.register` and then `agent.configure` for every agent, every time. The app
writes its declaration once; the client re-asserts it forever.

Backoff is exponential with full jitter, capped at thirty seconds: every client that lost the
same gateway comes back at a different moment. A second socket registering a live slug is taken,
not refused — many processes may hold one agent and a new call goes to the newest, which is what
lets a rolling deploy start before it stops (see the runtime's `docs/decisions/dispatch.md`) — so the declaration
this client re-asserts is what the next call of that agent runs on.

The one asymmetry: the **first** connection failing throws out of `connect()`, and every close
after one that worked is retried silently. A wrong key or a host nobody is on is a mistake the
app should hear at startup; a socket that dropped at 3am is not, and an app that crashed on it
would be worse than one that reconnected. The same rule holds for `observe()`.

## A command is sent, an answer is read

Almost nothing on this wire is a request/response pair. A command lands as one or more entries
with a seq, and those arrive on the socket like every other entry; `PRODUCES` in the protocol
says which. So `call.say(…)` returns nothing and the app hears `turn.agent` when it happens.

Two commands are awaited, because an app cannot sensibly continue without their answer:
`agent.register` and `agent.configure`. Each is sent with an `id`, and settles on the event it
lands as or on an `error` naming that id — which is the protocol's own answer shape, not an
invention of the client's.

A `tool.call` is the mirror image: the model called a function whose code is in this process, and
whatever it answers — a value, a rejection, a name nobody declared — becomes exactly one
`tool.result` against the model's own `call_id`, because a turn that never gets one waits forever.

A rejection is a value the model reads, never an error the process prints. An app that
refuses a call on purpose — the slot is not on the table — has handled it, so `#onToolCall` hands
the message to the model as `error` and calls nothing else: `onError` stays what its name says, the
path for a listener that threw where nobody was waiting. The refusal is on the log as that same
`tool.result`, which is how a person reads it afterwards, instead of as a stack trace through nine
frames of `dist/` in the middle of whatever the terminal was drawing.

## A page says where to go next itself

The JSON flavour of the two reading endpoints answers `{ entries, live, next }`, not a bare array,
and `history()` returns that plus the fold: `{ entries, state, live, next }`. The two extra fields
are the two things a reader cannot work out from the entries it happened to receive. `next` is the
cursor to ask from — an empty page of a live log still has one, and a bare array leaves the reader
inferring it from a last entry that may not exist. `live` says whether more will follow at all,
which is the difference between polling forever and knowing the call is over. A client that had to
guess either would guess wrong exactly at the edges, which is where a cursor protocol earns its
keep.

## What a Call knows, and what it does not

Every field on `Call` was read off the log: `channel`, `from`, `to` and `contact` come from
`call.ringing`/`call.dialing`/`call.started`, `state` from `state.changed`, `today` from the ts of
the entry that opened it. Nothing on it is invented, which is why `metadata` is **not** there:
`call.dial` carries metadata to the session, no event carries it back, and a field that is always
empty is worse than a field that is absent. It arrives the day an event says it.

`today` is the day the call opened, `YYYY-MM-DD`, in the app process's timezone — the answer to
what a prompt means by "today", which is otherwise the most common thing an agent gets wrong.

## The fake gateway ships

The client's promise is that an app can be tested without a gateway, a key, or a model. A
promise like that has to be shipped, not rewritten in every app's test folder, so
`pinecall/client/testing` exports a `FakeGateway` — the three commands the app socket answers
itself, a seq counter, a `taken` list of slugs it refuses outright, and a `cut()` that looks
like a deploy — and a `FakeLog` with the two reading doors over a list. `taken` is the only
refusal it has: an agent may be held by many sockets, so a second `agent.register` for the same
slug is answered exactly like the first, and what the real registry turns away is a door another
agent already answers. The SDK's own suite uses no other
server, and so does the example's walkthrough, which drives the real bridge against it.

Both fakes listen on `127.0.0.1` — the address their `url` hands out — and never on the
wildcard. It reads like a detail and it is not: `new WebSocketServer({ port: 0 })` takes the
IPv6 wildcard, and the kernel grants a port another program on the machine already holds on
IPv4. The two listeners then coexist, and a client dialling `127.0.0.1:<port>` is served by
that other program, which answers whatever protocol it speaks: the upgrade dies with
`Parse Error: Expected HTTP/, RTSP/ or ICE/`, or hangs up, and a test that had nothing to do
with any of it goes red about one run in sixty. Caught on 2026-09-07 with Spotify's peer
listener on `*:57621` (`lsof` named it, mid-failure). Binding loopback both fixes the delivery
— the specific address wins the demux over a wildcard — and keeps the fake honest: it answers
where it says it answers.

## The fakes stay on TCP, and a unix socket is why not

A loopback port is still a port: binding `127.0.0.1` narrows the window above, it does not close
it. A UNIX domain socket would — the address is a path we name, so nothing can collide by
construction. It does not survive contact with the client, and the reason is that both doors
would have to learn about socket paths in PRODUCTION code, which is a price no test double is
worth. Everything below was measured on 2026-09-07, node 24.19, `ws` 8.21.3.

The app socket: `ws` does dial one, as `ws+unix:<path>:<route>` — it splits `opts.path` on the
colon (`ws/lib/websocket.js:807`). But `PINECALL_URL` goes through `endpoints.ts`, which joins
the route onto `url.pathname` with a slash. Given `ws+unix:///tmp/fake.sock`, `appsUrl` returns
`ws+unix:///tmp/fake.sock/v1/apps`, `ws` reads all of that as the socket path, and the dial dies
`connect ENOTDIR /tmp/fake.sock/v1/apps`. Making it work means a `ws+unix:` branch inside
`doorAt` — a scheme the real gateway will never speak.

The reading doors are worse. `observe` and `history` call global `fetch`, and undici has no
route to a socket path at all: `http://unix:/tmp/fake.sock:/v1/…` is `getaddrinfo ENOTFOUND
unix`, `http+unix://…` is `unknown scheme`. The only way in is `dispatcher: new Agent({ connect:
{ socketPath } })`, which means a dispatcher option on the SDK's public read surface, existing
for nothing but the address of a fake.

So: TCP, on loopback, on a port the kernel picks. A collision is still possible — `SO_REUSEADDR`
lets a specific address take a port a wildcard already holds — but it no longer misdelivers,
because the specific bind wins the demux. That is the whole difference the loopback fix bought,
and it is the answer that stands.

## The gateway forgets a socket that errors; the log has nothing to forget

`FakeGateway` listens for `error` on every socket it accepts. Node throws an `error` event
nobody listens for, and `ws` raises one for any frame it cannot parse —
`WS_ERR_UNEXPECTED_RSV_1` on a byte the peer had no business sending. Without the listener that
is an uncaught exception: one confused connection ends the run rather than itself, with a stack
inside `ws` and no hint that a fake was involved. `sdk/test/fakes.test.ts` pins it — the file
exits 1 with the listener removed and 0 with it there.

`FakeLog` was checked for the same shape and does not need one, which is why the two files do
not match. Its readers are `ServerResponse`s, and node destroys one the moment its client goes:
an RST under an open SSE stream, a half-close then a write until EPIPE, a `write()` after
`end()`, a `write()` into an already-destroyed response — all four were tried and none emitted
`error`, because node's `onError` returns early on a destroyed message. `close` is the only
event that door ever gets, so a listener there would be a line with no reachable cause.
