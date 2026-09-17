# Two worlds, one team

From the sign-up to the deploy, and what changes when there are five of you. The verbs are
[the-cli.md](the-cli.md); the doors are the runtime's `docs/protocol/gateway-api.md`; the model
from the operator's side is the runtime's `docs/multi-tenancy.md`. This page is the same model as
you walk it from a laptop.

## The two worlds

A gateway holds two worlds — `production` and `sandbox` — and **the world you are in is the
key you hold**. A key opens one of them; every agent it holds, every call it takes, every fact and
every base it writes is that world's. Nothing you do on a sandbox key reaches production, and
nothing production does reaches you.

**Production is the org's.** What is deployed is held by a process somebody put on a box, running
on a key issued for that machine. A key you hold by being logged in does not open `app` there at
all — `pinecall run` on it is refused, in a sentence that names what the key does open — so no
laptop answers the org's numbers by accident.

**The sandbox is yours.** Your sandbox key holds an agent in a corner of your own: your
`pinecall run`, your `pinecall chat`, your suite, your console. A colleague running
the same agent is in their own corner, and neither of you takes the other's.

**Each world is watched in its own place.** The gateway's console — the page you sign in to —
shows production and only production: what is deployed, its calls, the org's numbers, keys, people
and usage. The sandbox is watched on your own machine: `pinecall serve` puts the same console on
`http://localhost:4100`, looking at your corner, with nothing to sign in to because the terminal's
key signs what the page asks ([the-cli.md](the-cli.md#serve)). Sentry's split, if you know it: the
hosted dashboard for production, a local sidecar for what you are building.

Yours to hold, not yours to hide: **an admin, and whoever runs the gateway, see every corner of
the sandbox**. The agent listing answers a key that opens `team` with one row per corner and the
member each belongs to, because somebody has to be able to tell what the team is running — a
corner nobody can see is one nobody can help with. What nobody else can do is take it: a corner is
still held by the person whose key registered it.

**Which world you are in is never a flag.** `--env` on `pinecall run` and `pinecall chat` asserts:
it says which world you believe your key opens and the verb stops when it opens the other. Nothing
said means the sandbox, so a deployment says `--env production` out loud. An agent that lands in
production because of whichever key was active is the accident this exists to prevent.

| | production | sandbox |
|---|---|---|
| the agent | the org's: one holder, the box's machine key | **yours**: one per person. CI's, on a key naming nobody, is the org's own, and a person holding none falls back to it |
| `pinecall run` | refused on a person's key | yours |
| web and chat (`pinecall chat`, the console's talk) | the org's agent | your own |
| a phone or WhatsApp number | the org's. A call from a developer's [own phone](#which-phone-is-yours) reaches that developer's sandbox copy while they hold the agent; every other caller reaches production | **optional, and the org's, shared**: a call lands in the corner of whoever's phone dialled it, else on [the line](#the-line) |
| where it is watched | the gateway's console, signed in to | `pinecall serve`, on your machine: `http://localhost:4100` |
| the calls a console lists | production's | the corner's own: a developer sees only their own sandbox calls, and an admin who opens a teammate's copy sees that copy's |
| a contact's memory | production's facts | the sandbox's facts, apart |
| the knowledge base | the one the telephone answers from | yours; `knowledge push` replaces this one |
| the quotas | the org's | the org's — agents, seats, facts, chunks and numbers are counted over both worlds |

## The path

```console
$ pinecall signup --org tienda-sur --name "Tienda Sur" --email nico@tiendasur.uy --person "Nico"
Password (12 characters at least):
created org tienda-sur on https://box.pinecall.io — signed in as Nico, sandbox key kept in ~/.pinecall/credentials
console  https://box.pinecall.io/?login=lc_…   (opens within five minutes, once)
```

1. **The alta.** `signup` makes the org with you as its admin and keeps this laptop's
   **sandbox** key, so the next verb works: `pinecall run` holds the agent in your corner,
   `pinecall chat` reaches it. The console link signs the browser in to **production**, where the
   org's numbers, people and usage are — Stripe's split, if you know it: the dashboard on live, the
   CLI on test.
2. **Write and run.** Everything in [tutorial.md](tutorial.md) happens here, in the sandbox. Your
   memory, your base, your calls — and `pinecall run --serve` puts them on `http://localhost:4100`.
3. **The key the box runs on.** `pinecall keys issue --label "prod server"` mints a key for a
   machine: production, `app`, naming nobody, printed once. Put it in the box's environment. That
   `pinecall run` is the one that answers the org's numbers, and nothing else can.
4. **Promote knowledge.** A `knowledge push` from your laptop replaced your sandbox base. The
   production base is the same push made with the machine's key:
   `pinecall knowledge push --profile prod`, from CI or from whoever holds it.
5. **Revoke what is over.** `pinecall keys list` shows fingerprints, never keys; `pinecall keys
   revoke <fingerprint>` stops one. The row stays, because the calls it wrote name it.

A key may not issue a scope it does not itself open, and another org's fingerprint is refused as
one that is nobody's. Every key of a person carries their role's scopes; a machine key carries
what it was issued with — `app` unless `--scope` said otherwise.

## Signing in

`pinecall login` **prints a link and opens it**. You sign in on that page — in a browser, where a
password belongs, where the browser autofills it and a password manager holds it — and the page
hands the terminal a key of its **own**: minted for you, labelled as that machine, revoked on its
own from the Keys screen. No password reaches a shell, and the day your org signs in with Google
or SAML this verb does not change, because the terminal's half of it knows nothing about how you
proved who you are.

```console
$ pinecall login
gateway  https://box.pinecall.io   (the default — `pinecall login <url>` for your own box)

open this to sign in:
https://box.pinecall.io/cli?c=cli_…

waiting…
▸ box · https://box.pinecall.io · org tienda-sur · sandbox
```

**With no URL it is the cloud, and it says so** in the line above the link, before anything is
kept. The word in the link dies in ten minutes and on first collection — open it twice and the
second time says so. A terminal on a server with no browser prints the same link, and you open it
from your phone: that is why it is a printed link and not a port on localhost.

What it keeps is that machine's **sandbox** key, and `pinecall serve` is where what it holds is
watched. Production is the gateway's console, signed in to with the password; `pinecall keys issue`
is how a box gets a key there.

**A person is their email, and may belong to several orgs.** One password is theirs across every
org they are in, whichever org it was chosen in, and an email is matched trimmed and lower-cased,
so `Nico@TiendaSur.uy ` is the same person. Signing in to the console asks for the email and the
password, and the org only when they belong to several — left empty, it is the oldest of theirs. It
signs in to production, and the key is kept by that browser, so a second tab is the same person.
The console's header then switches between their orgs (`GET /v1/login/orgs` lists them, `POST
/v1/login/org` mints the same person's key in the one they pick). A terminal moves between orgs by
profile — `pinecall use` — and `POST /v1/login/env` is how `pinecall login` turns the key a person
signed in with into their sandbox one. A machine key names nobody, so it has no orgs to switch
between and opens one world.

A machine has no browser and no person: `--key-stdin` reads a key from one line of stdin, and in
a container `pinecall login --key-stdin` writes the same profile, with `PINECALL_HOME` saying where.

## The team

People are rows, not shared keys. The admin invites from the console's Team screen or with `POST
/v1/members`, and gets a **link** to send; the person opens it, chooses a password on the card it
lands on, and holds keys of their own from then on — one per device, revoked on their own. On a
gateway that takes no sign-up, the very first admin is invited the same way by whoever runs the
box (`pinecall-runtime orgs invite`). A role is a preset of what those keys open:

| role | opens | who |
|---|---|---|
| `qa` | calls, evals | reads finished calls and the suites |
| `supervisor` | + supervise, talk | the live floor: listen, whisper, take a call over |
| `manager` | + numbers, keys, providers, usage, team | runs the floor and the org's accounts; never the agent's declaration |
| `developer` | app, calls, talk, supervise, pipeline, knowledge, memory, evals | writes and runs the agent — `app` in the sandbox only |
| `admin` | every door | the org's owner |

The roles are presets and nothing more: every door reads the key's scopes, and a role re-cut
tomorrow changes the next key minted and not one door. `agents` on a member narrows which of the
org's agents they work on; empty is every one.

**Seats.** An invitation takes a seat, and where the org's plan caps them the door answers `429`
in the quota's own words and makes no row. Invited counts — an org at its limit could otherwise
invite forever and seat everybody the moment they accepted. Disabling somebody frees their seat
and revokes every key of theirs; their row stays, because the log names them. Re-inviting an email
the org already holds takes no second seat: a link dies in a week, and sending a new one is never
the thing a full org cannot do.

## Two developers, one agent

Berna and Carla both run `tienda-sur`. Each `pinecall run` holds it in its own corner; each
`pinecall chat` reaches its own; each console, in the sandbox, opens its own copy and lists its own
calls. Berna's test call writes Berna's sandbox memory and nobody else's. Neither can hold
production: the box does. Both count against the plan once, because a slug is one agent however
many corners hold it.

An admin's own console — their `pinecall serve` — lists every copy, Berna's and Carla's, and opens
a teammate's: every request the page makes then carries that member's corner (the
`pinecall-corner` header, which the sidecar forwards as the page sent it), and the gateway answers
each door there, or refuses a key that may not. A developer's lists their own copy and the org's
shared one, which is what they can open anyway. The gateway's console has no copies to list:
production has one, the org's, deployed on the box.

### Which phone is yours

A number exists once in a world, so a call at it rings in **one** place. The number your
customers call is enough to test on: a sandbox number is optional. Which place is answered by the
phone that dialled:

```console
$ pinecall line from +59899111111
calls from +59899111111 reach this terminal
```

Said once, and from then on every call Berna makes to the org's production number, while Berna
is running `tienda-sur`, reaches Berna's sandbox copy, and every call Carla makes reaches Carla's —
at the same time, with no coordination between them — while every customer who calls reaches
production as before. The sandbox log of such a call is marked `diverted_from: production`. An org
that also has a sandbox number gets the same routing there. Stop `pinecall run`, or `pinecall line
forget`, and your calls go back to production.

A phone is a **person's** and not an agent's, so it works on every agent they hold. The gateway
keeps it beside its live table and not in a row, because it is only meaningful next to a socket: a
developer who is running nothing has no corner for a call to land in. Every `pinecall run` says it
again when it starts, for every agent it holds, so a restarted gateway learns it back from the next
one.

### The line

And a call from a number nobody said was theirs — a customer, a colleague's phone, a test from
somewhere else — still has to reach somebody. That is the **line**. With one developer it is not a
decision: the first `pinecall run` to hold the agent answers it and the word never appears.

```console
$ pinecall line
rings in berna@tiendasur.uy · `pinecall line from <+your-number>` routes yours, or `claim` takes it

$ pinecall line claim
rings in this terminal · also running: berna@tiendasur.uy
```

`release` gives it up, and whoever else is still running the agent picks it up — which is also
what happens on its own when the terminal holding it closes. A claim on an agent this terminal is
not running is refused: a ring lands on the line, so a corner with no app in it would take the
call and drop it. Production has one corner and the box holds it, so there is nothing to claim
there — only a developer's own phone is diverted, as above; `pinecall run` prints the line under
the console's URL for any agent that declares a number.

Web and chat need none of this. They name the agent AND the person, so they always reach your own.

## Traps

- **`this key does not open app: it opens …`** on `pinecall run` — you are on a production key.
  A person's never opens `app` there; issue a machine key (`pinecall keys issue`) and run on that,
  or log in to the sandbox.
- **The gateway's console says `no agent called … is held here`.** It shows production, and what
  your laptop holds is in the sandbox: `pinecall serve`, and look at `http://localhost:4100`.
- **`pinecall serve` refused the key.** It is a production key; the sandbox is a person's. `pinecall
  use <profile>` for the one `pinecall login` kept — `pinecall config` lists them.
- **A verb answered for an org you did not expect.** It cannot be an export any more — the CLI
  reads none — so it is the active profile. `pinecall config` says which one, `pinecall use`
  moves it, and `pinecall whoami` says which key that is and in which world.
- **The number answered somebody else's laptop.** You never told it which phone is yours, so the
  call fell through to whoever holds [the line](#the-line). `pinecall line from +<your number>`,
  once, and it stops happening. Web and chat are yours already; only the telephone is shared.
- **Your phone reached production and not your copy.** Your copy is reached only while a
  `pinecall run` of yours holds that agent, from the phone `pinecall line from` named on this
  gateway, in the org that agent is yours in. `pinecall line` says what the gateway knows; a
  `pinecall run` started again says the phone again.
- **`knowledge push` "did nothing" to production.** It replaced your sandbox base, which is
  the right thing. Promote with the machine's key.

## The doors underneath

`POST /v1/signup` · `POST /v1/login` · `POST /v1/login/env` (the same person's key in the other
world) · `GET /v1/login/orgs`, `POST /v1/login/org` (the person's orgs, and their key in another) ·
the four under `/v1/login/pairings` (signing a terminal in) · `GET`/`POST /v1/keys`,
`POST /v1/keys/{fingerprint}/revoke` · `GET`/`POST /v1/members`, `PATCH /v1/members/{id}` ·
`POST /v1/invitations/{token}` · `GET`/`POST`/`DELETE /v1/agents/{slug}/line` ·
`PUT`/`DELETE /v1/line/from` · `GET /v1/agents/{slug}/rings-for` (the worker's, on every
production ring: whose sandbox copy a caller's phone reaches). Shapes and
refusals: the runtime's `docs/protocol/people.md` and `gateway-api.md` §1, §5, §7, §8.
