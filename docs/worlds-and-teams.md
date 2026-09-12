# Two worlds, one team

From the sign-up to the deploy, and what changes when there are five of you. The verbs are
[the-cli.md](the-cli.md); the doors are the runtime's `docs/protocol/gateway-api.md`; the model
from the operator's side is the runtime's `docs/multi-tenancy.md`. This page is the same model as
you walk it from a laptop.

## The two worlds

A gateway holds two worlds — `production` and `development` — and **the world you are in is the
key you hold**. A key opens one of them; every agent it holds, every call it takes, every fact and
every base it writes is that world's. Nothing you do on a development key reaches production, and
nothing production does reaches you.

**Production is the org's.** What is deployed is held by a process somebody put on a box, running
on a key issued for that machine. A key you hold by being logged in does not open `app` there at
all — `pinecall run` on it is refused, in a sentence that names what the key does open — so no
laptop answers the org's numbers by accident.

**Development is yours.** Your development key holds an agent in a corner of your own: your
`pinecall run`, your `pinecall chat`, your suite, your console in development. A colleague running
the same agent is in their own corner, and neither of you takes the other's.

| | production | development |
|---|---|---|
| the agent | the org's: one holder, the box's machine key | **yours**: one per person. CI's, on a key naming nobody, is the org's own, and a person holding none falls back to it |
| `pinecall run` | refused on a person's key | yours |
| web and chat (`pinecall chat`, the console's talk) | the org's agent | your own |
| a phone or WhatsApp number | the org's | **the org's, shared**: the newest `pinecall run` answers it |
| a contact's memory | production's facts | development's facts, apart |
| the knowledge base | the one the telephone answers from | yours; `knowledge push` replaces this one |
| the quotas | the org's | the org's — agents, seats, facts, chunks and numbers are counted over both worlds |

## The path

```console
$ pinecall signup --org tienda-sur --name "Tienda Sur" --email nico@tiendasur.uy --person "Nico"
Password (12 characters at least):
created org tienda-sur on https://box.pinecall.io — signed in as Nico, development key kept in ~/.pinecall/credentials
console  https://box.pinecall.io/?login=lc_…   (opens within five minutes, once)
```

1. **The alta.** `signup` makes the org with you as its admin and keeps this laptop's
   **development** key, so the next verb works: `pinecall run` holds the agent in your corner,
   `pinecall chat` reaches it. The console link signs the browser in to **production**, where the
   org's numbers, people and usage are — Stripe's split, if you know it: the dashboard on live, the
   CLI on test.
2. **Write and run.** Everything in [tutorial.md](tutorial.md) happens here, in development. Your
   memory, your base, your calls.
3. **The key the box runs on.** `pinecall keys issue --label "prod server"` mints a key for a
   machine: production, `app`, naming nobody, printed once. Put it in the box's environment. That
   `pinecall run` is the one that answers the org's numbers, and nothing else can.
4. **Promote knowledge.** A `knowledge push` from your laptop replaced your development base. The
   production base is the same push made with the machine's key:
   `PINECALL_API_KEY=<the machine's> pinecall knowledge push`, from CI or from whoever holds it.
5. **Revoke what is over.** `pinecall keys list` shows fingerprints, never keys; `pinecall keys
   revoke <fingerprint>` stops one. The row stays, because the calls it wrote name it.

A key may not issue a scope it does not itself open, and another org's fingerprint is refused as
one that is nobody's. Every key of a person carries their role's scopes; a machine key carries
what it was issued with — `app` unless `--scope` said otherwise.

## The team

People are rows, not shared keys. The admin invites from the console's Team screen or with `POST
/v1/members`; the person accepts the link, picks a password, and holds keys of their own from
then on — one per device, revoked on their own. A role is a preset of what those keys open:

| role | opens | who |
|---|---|---|
| `qa` | calls, evals | reads finished calls and the suites |
| `supervisor` | + supervise, talk | the live floor: listen, whisper, take the line |
| `manager` | + numbers, keys, providers, usage, team | runs the floor and the org's accounts; never the agent's declaration |
| `developer` | app, calls, talk, supervise, pipeline, knowledge, memory, evals | writes and runs the agent — `app` in development only |
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
`pinecall chat` reaches its own; each console, toggled to development, lists its own. The org's
development **number** is one door — a number exists once in a world — and whichever of them
started last answers it, which is what a shared number being shared means. Berna's test call
writes Berna's development memory and nobody else's. Neither can hold production: the box does.
Both count against the plan once, because a slug is one agent however many corners hold it.

## Traps

- **`this key does not open app: it opens …`** on `pinecall run` — you are on a production key.
  A person's never opens `app` there; issue a machine key (`pinecall keys issue`) and run on that,
  or log in to development.
- **`PINECALL_API_KEY` is exported.** It is read before the row `signup` or `login` kept, so the
  next verb answers for another org and reads as the sign-up having failed. Both verbs say so on
  stderr; `unset` it. `pinecall whoami` says which key a verb would use and in which world.
- **The number answered somebody else's laptop.** The development number is the org's, and the
  newest `pinecall run` took it. Web and chat are yours; the telephone is shared.
- **`knowledge push` "did nothing" to production.** It replaced your development base, which is
  the right thing. Promote with the machine's key.

## The doors underneath

`POST /v1/signup` · `POST /v1/login` · `POST /v1/login/env` (the same person's key in the other
world) · `GET`/`POST /v1/keys`, `POST /v1/keys/{fingerprint}/revoke` · `GET`/`POST /v1/members`,
`PATCH /v1/members/{id}` · `POST /v1/invitations/{token}`. Shapes and refusals: the runtime's
`docs/protocol/people.md` and `gateway-api.md` §1, §5, §7, §8.
