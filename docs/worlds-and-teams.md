# Two worlds, one team

From the invitation to the deploy, and what changes when there are five of you. The verbs are
[the-cli.md](the-cli.md); running the agent on a server is [production.md](production.md); the
doors are the runtime's `docs/protocol/gateway-api.md` and `docs/protocol/people.md`; the model
from the operator's side is the runtime's `docs/multi-tenancy.md`. This page is the same model as
you walk it from a laptop.

## The model, in four sentences

**One key per person, per device; the role says what they do; a production switch, set by an
admin, says whether they may do it in production** — an admin's is always on. **A project folder
is linked to one org** (`pinecall link` writes the key into its `.env`); a second org is a second
folder. **Every command runs in the sandbox unless it says `--prod`**, and the gateway lets `--prod`
through only while the switch is on. **Production's agent runs on the org's own server**, on a
server's token from the console's Tokens screen, restarted by every deploy.

## The two worlds

A gateway holds two worlds — `production` and `sandbox` — and **the world is the request's**: every
request and every socket names it with the `pinecall-env` header, and none named is the sandbox.
Every agent a command holds, every call it takes, every fact and every base it writes is that
world's. Nothing you do in the sandbox reaches production, and nothing production does reaches you.

**Production is the org's.** What is deployed is held by a process on the org's own server, on a
server's token — the org's, not a person's, so it keeps running when whoever made it leaves. A
person with production access can act there too, one command at a time: `pinecall sessions --prod`,
`pinecall agent set … --prod`, even `pinecall start --prod` from a terminal. A person without it is
refused every `--prod` in one sentence, so no laptop answers the org's numbers by accident.

**The sandbox is yours.** Your key holds an agent in a corner of your own: your `pinecall start`,
your `pinecall chat`, your suite, your console. A colleague running the same agent is in their own
corner, and neither of you takes the other's.

**Each world is watched in its own place.** The gateway's console — the page you sign in to —
shows production and only production: what is deployed, its calls, the org's numbers, tokens,
people and usage; a person without production access who signs in there is shown **No production
access** and where their sandbox is. The sandbox is watched on your own machine: `pinecall serve`
puts the same console on `http://localhost:4100`, looking at your corner, with nothing to sign in
to because the project's key signs what the page asks ([the-cli.md](the-cli.md#serve)). Sentry's
split, if you know it: the hosted dashboard for production, a local sidecar for what you are
building.

Yours to hold, not yours to hide: **an admin, and whoever runs the gateway, see every corner of
the sandbox**. The agent listing answers a key that opens `team` with one row per corner and the
member each belongs to, because somebody has to be able to tell what the team is running — a
corner nobody can see is one nobody can help with. What nobody else can do is take it: a corner is
still held by the person whose key registered it.

| | production | sandbox |
|---|---|---|
| the agent | the org's: one holder, the server's token | **yours**: one per person. CI's, on a token naming nobody, is the org's own, and a person holding none falls back to it |
| `pinecall start` | `--prod`: the server's token, or a person with the switch | yours |
| web and chat (`pinecall chat`, the console's talk) | the org's agent | your own |
| a phone or WhatsApp number | the org's. A call from a developer's [own phone](#which-phone-is-yours) reaches that developer's sandbox copy while they hold the agent; every other caller reaches production | **optional, and the org's, shared**: a call lands in the corner of whoever's phone dialled it, else on [the line](#the-line) |
| settings and the lexicon | one corner, written with `--prod` or from the gateway's console; history and rollback | yours, and the team's with `--team` |
| where it is watched | the gateway's console, signed in to | `pinecall serve`, on your machine: `http://localhost:4100` |
| the calls a console lists | production's | the corner's own: a developer sees only their own sandbox calls, and an admin who opens a teammate's copy sees that copy's |
| a contact's memory | production's facts | the sandbox's facts, apart |
| what the agent knows by heart | production's Settings ▸ Knowledge, one corner | yours, and the team's with `--team` — `pinecall agent knowledge edit` |
| the bases it searches | the ones the telephone answers from, pushed in a release | yours; `pinecall docs push` replaces this one, and `docs attach` says which the agent reads |
| the quotas | the org's | the org's — agents, seats, facts, chunks and numbers are counted over both worlds |

## A team, from the invitation to the rollback

**Clínica Norte** has four people. **Laura** is the admin. **Ana** and **Bruno** are developers:
Ana has production access, Bruno does not yet. **Carla** is a supervisor on the phone floor, with
production access, because the floor she supervises is production's.

**1. The invitations.** Laura, on the Team screen of the gateway's console, invites each with a
role and the **Production** switch (an admin's reads *always*): Ana on, Bruno off, Carla on. Each
gets a one-use link, chooses a password, and is in. The switch moves later from the same table,
and it is read at every request: switched off, the very next `--prod` is refused.

**2. Linking the project.** Ana and Bruno clone the repository and link it:

```console
~/clinica-norte $ pinecall link
open this to sign in:
https://box.pinecall.io/cli?c=cli_…

waiting…
signed in to https://box.pinecall.io as Ana García
▸ clinica · PINECALL_KEY written to .env
```

The key is Ana's, one for this device, in the project's `.env` (which `.gitignore` names). Bruno's
`.env` holds Bruno's. Neither is committed; neither is shared.

**3. Work in the sandbox.** Everything in [tutorial.md](tutorial.md) happens here. Ana's `pinecall
start --serve` holds `clinica-norte` in Ana's corner and Bruno's in Bruno's; each tries a voice with
`pinecall agent set --voice …` without the other hearing it. What they agree on goes to the org's
own sandbox corner with `--team`, which every corner that set nothing reads.

**4. Goldens in CI.** Before anything reaches production, CI holds the agent to its goldens —
`pinecall test`, `pinecall docs eval`, `pinecall remember` — on a **sandbox** server token
from Tokens, and a red run stops the deploy ([testing-an-agent.md](testing-an-agent.md)). There is
no promote at the gateway: the gate is CI's.

**5. The server's token.** Ana opens **Tokens ▸ New server token**, names it `clinica web`, picks
`production`, and is shown `PINECALL_KEY=pc_live_…` once. She pastes it into the server's secrets.
The row lists it as *the org's · made by Ana*. Bruno's form offers `sandbox` only: production's is
made by somebody the org lets act there.

**6. The deploy.** The agent runs on Clínica Norte's own server, either inside their Node app — the
SDK's `mount` in the server's startup — or as a process of its own under the manager they already
use: a Procfile's `agent: pinecall start --prod`, with `release: pinecall docs push --prod`
replacing production's base like a migration. Every deploy restarts it. [production.md](production.md)
is both ways, end to end.

**7. Changes without a deploy.** The greeting is too long. Ana, from her laptop:

```console
$ pinecall agent set --greeting "Clínica Norte, ¿en qué le ayudo?" --note "shorter" --prod
```

Or the same edit on the agent's **Settings** tab in the gateway's console. Carla hears *Vidal* said
wrong all morning and fixes it herself, on the console's **Lexicon** screen or with `pinecall lexicon
add Vidal --say "Bidal" --prod` — the words are a supervisor's to fix, without a developer and
without a deploy. The prices went up on Monday: Carla opens the agent's **Settings** tab, rewrites
the line under *Knowledge* — what the agent knows by heart, in Markdown, read whole on every call —
and saves; the next call quotes the new price. Nothing in the repository changed, because the
repository never held it: the class is the code, and what the business knows is the world's.

**8. The refusals.** Bruno types `pinecall sessions --prod` and is told `403 Bruno has no
production access: an admin gives it in Team`; the gateway's console shows him **No production
access**, and his sandbox is where it always was. Carla tries `pinecall agent set --llm … --prod`
and is refused by name — `llm: the pipeline's, and this key does not open pipeline: it opens …` —
because a supervisor sets words, never which model answers.

**9. The rollback.** The shorter greeting reads as curt. `pinecall agent history --prod` lists
every version with who set it and why; `pinecall agent rollback 11 --prod` brings the one before
back as the next version, and the history says so.

**10. Somebody leaves.** Ana moves on; Laura removes her on the Team screen. Every key of Ana's is
revoked — her laptop's `.env` opens nothing now — and **the server keeps running**: its token was
the org's, *made by Ana*, never hers. Laura turns Bruno's switch on, and he takes over.

## Signing in, and linking

`pinecall link` in a project's folder is the one verb a person types to start. When the machine is
not signed in it does what `pinecall login` does: **prints a link and opens it**. You sign in on
that page — in a browser, where a password belongs, where the browser autofills it and a password
manager holds it — and the page hands the terminal a key of its **own**: minted for you, labelled
as that machine, revoked on its own from the Tokens screen. No password reaches a shell, and the day
your org signs in with Google or SAML this does not change, because the terminal's half of it knows
nothing about how you proved who you are. The word in the link dies in ten minutes and on first
collection; a terminal with no browser prints the same link, and you open it from your phone.

That sign-in is the machine's (`~/.pinecall/session.json`), and nothing runs on it. `link` then
lists your orgs, asks which one this project is, mints your key there, and writes it into the
project's `.env` — the file every verb in that folder reads. A project of another org is another
folder, linked on its own; there is nothing to switch between.

**A person is their email, and may belong to several orgs.** One password is theirs across every
org they are in, whichever org it was chosen in, and an email is matched trimmed and lower-cased,
so `Nico@TiendaSur.uy ` is the same person. Signing in to the console asks for the email and the
password, and then offers the workspaces those open when they belong to several (`POST
/v1/login/orgs`, which mints nothing). It signs in to production, and the one key is kept by that
browser, so a second tab is the same person. The console's workspace menu and its switcher then
move between their orgs (`GET /v1/login/orgs` lists them, `POST /v1/login/org` mints the same
person's key in the one they pick) — the same two doors `pinecall link` asks.

A server has no browser, no person and no login: it runs on a server's token, kept in its secrets
as `PINECALL_KEY` ([production.md](production.md)).

## The team

People are rows, not shared keys. The admin invites from the console's Team screen or with `POST
/v1/members`. On a gateway that can send mail the person gets a **letter** with a one-use link —
and the admin is shown the same link, to hand over where mail is not set up; the person opens it,
chooses a password on the card it lands on, and holds keys of their own from then on — one per
device, revoked on their own. On a gateway that takes no sign-up, the very first admin is invited
the same way by whoever runs the box (`pinecall-runtime orgs invite`). A role is a preset of what
those keys open, in whichever world the request runs:

| role | opens | who |
|---|---|---|
| `qa` | calls, evals | reads finished calls and the suites |
| `supervisor` | + supervise, talk, memory, words | the live floor: listen, whisper, take a call over, what the agent remembers about the caller — and the words: the opening, the lexicon, what is remembered, what the agent knows by heart, fixed by whoever hears them wrong |
| `manager` | + numbers, keys, providers, usage, team | runs the floor and the org's accounts, and the words; never which vendor or model the agent runs on |
| `developer` | app, calls, talk, supervise, pipeline, words, knowledge, memory, evals | writes and runs the agent |
| `admin` | every door | the org's owner |

**The production switch** is the other half: the role says what a person does, and their row's
`production`, set by an admin, says whether they may do it in production — read at every request,
so switching it off closes the very next one. An admin's is always on, and the gateway refuses to
turn it off. The Team screen has it on every row and in the invitation form.

The roles are presets and nothing more: every door reads the key's scopes, and a role re-cut
tomorrow changes the next key minted and not one door. `agents` on a member narrows which of the
org's agents they work on; empty is every one. The Team screen is where all of it is done — the
invitation, a role, the agents or the switch changed in place, **Resend invite**, **Disable** and
**Bring back** — and it draws this table beside the people, so whoever invites reads what a role
opens.

**A forgotten password** is the admin's to hand back: **Reset password** on an active member
(`POST /v1/members/{id}/reset`) answers a one-use link like an invitation's, which the admin passes
on; it opens the same password card and spends every older link of theirs.

**Single sign-on.** An org may sign its people in with its own identity provider — Google
Workspace, Okta, Entra, anything that speaks OpenID Connect — wired by an admin on the Team screen:
the issuer, the client, the email domains it admits, the role somebody nobody invited arrives with
(none, unless said), and whether a password still opens the org at all. The sign-in card's
*Continue with SSO* finds the workspace by the email's domain and comes back with the one-use code
the console already spends; the flow, the doors and the operator's break-glass are the runtime's
`docs/protocol/people.md`.

**Disabling, and removing.** Disabling keeps the row and shuts the person out; **removing** takes
them out of the org for good — every key of theirs revoked, their pending invitation spent, the
seat free, and every server token they made still running, because it is the org's (`DELETE /v1/members/{id}`, the Team screen's *Remove*). What the log already named them
by stays readable either way, because a call names an id and not a row. The door refuses two
removals: your own, and the org's last active admin.

**Seats.** An invitation takes a seat, and where the org's plan caps them the door answers `429`
in the quota's own words and makes no row. Invited counts — an org at its limit could otherwise
invite forever and seat everybody the moment they accepted. Disabling somebody frees their seat
and revokes every key of theirs; their row stays, because the log names them. Re-inviting an email
the org already holds takes no second seat: a link dies in a week, and sending a new one is never
the thing a full org cannot do.

## Two developers, one agent

Ana and Bruno both run `clinica-norte`. Each `pinecall start` holds it in its own corner; each
`pinecall chat` reaches its own; each `pinecall serve`, on its own machine, opens its own copy and
lists its own calls. Ana's test call writes Ana's sandbox memory and nobody else's. What holds
production is the server. Both count against the plan once, because a slug is one agent however
many corners hold it.

An admin's own console — their `pinecall serve` — lists every copy, Ana's and Bruno's, and opens
a teammate's: every request the page makes then carries that member's corner (the
`pinecall-corner` header, which the sidecar forwards as the page sent it), and the gateway answers
each door there, or refuses a key that may not. A developer's lists their own copy and the org's
shared one, which is what they can open anyway. The gateway's console has no copies to list:
production has one, the org's, deployed on the server.

### Which phone is yours

A number exists once in a world, so a call at it rings in **one** place. The number your
customers call is enough to test on: a sandbox number is optional. Which place is answered by the
phone that dialled:

```console
$ pinecall line from +59899111111
calls from +59899111111 reach this terminal
```

Said once, and from then on every call Ana makes to the org's production number, while Ana is
running `clinica-norte`, reaches Ana's sandbox copy, and every call Bruno makes reaches Bruno's —
at the same time, with no coordination between them — while every customer who calls reaches
production as before. The sandbox log of such a call is marked `diverted_from: production`. An org
that also has a sandbox number gets the same routing there. Stop `pinecall start`, or `pinecall line
forget`, and your calls go back to production.

A phone is a **person's** and not an agent's, so it works on every agent they hold. The gateway
keeps it beside its live table and not in a row, because it is only meaningful next to a socket: a
developer who is running nothing has no corner for a call to land in. Every `pinecall start` says it
again when it starts, for every agent it holds, so a restarted gateway learns it back from the next
one.

### The line

And a call from a number nobody said was theirs — a customer, a colleague's phone, a test from
somewhere else — still has to reach somebody. That is the **line**. With one developer it is not a
decision: the first `pinecall start` to hold the agent answers it and the word never appears.

```console
$ pinecall line
rings in ana@clinica.test · `pinecall line from <+your-number>` routes yours, or `claim` takes it

$ pinecall line claim
rings in this terminal · also running: ana@clinica.test
```

`release` gives it up, and whoever else is still running the agent picks it up — which is also
what happens on its own when the terminal holding it closes. A claim on an agent this terminal is
not running is refused: a ring lands on the line, so a corner with no app in it would take the
call and drop it. Production has one corner and the server holds it, so there is nothing to claim
there — only a developer's own phone is diverted, as above; `pinecall start` prints the line under
the console's line for any agent that declares a number.

Web and chat need none of this. They name the agent AND the person, so they always reach your own.

### Calling somebody back

An agent can place a call too, once the org's carrier has an outbound trunk — set up from the
Numbers screen (*Outbound calls*: the plan first, then Confirm) for a Twilio account or a SIP peer
that declared where it takes calls. Then *Call back* in an agent's Calls inbox, or `POST
/v1/agents/{slug}/dial {to}` with a key that opens `talk`, rings the person from one of the org's
own numbers, and the call is a log like any other, `outbound`. It is fenced, and only whoever runs
the gateway moves the fence: by default a number that has already called or written to the org,
six dials a minute and two hundred a day, ten minutes a
call. Which countries it may reach is the carrier account's own setting (Twilio's geo
permissions), never a fence of ours. The door and its guards: the runtime's
`docs/protocol/console-api.md` §4.

## Traps

- **`403 <name> has no production access: an admin gives it in Team`** on a `--prod` — your switch
  is off. An admin turns it on in Team; until then the sandbox is yours, and a server runs on its
  own token, not on yours.
- **`no PINECALL_KEY here`** — this folder, and none above it, has a `.env` with a key, and none is
  exported. `pinecall link` in the project's folder.
- **The gateway's console says `no agent called … is held here`.** It shows production, and what
  your laptop holds is in the sandbox: `pinecall serve`, and look at `http://localhost:4100`.
- **The local console says *This project is not linked*.** The gateway refused the key in `.env` —
  revoked, or you were removed. `pinecall link` again, then `pinecall serve`.
- **A verb answered for an org you did not expect.** The first line says where the key came from
  (`key from the environment` or `key from ../.env`): an exported `PINECALL_KEY` wins over the
  project's file, and a `.env` in a parent folder is found when the project has none.
  `pinecall whoami` says which org that key is.
- **The number answered somebody else's laptop.** You never told it which phone is yours, so the
  call fell through to whoever holds [the line](#the-line). `pinecall line from +<your number>`,
  once, and it stops happening. Web and chat are yours already; only the telephone is shared.
- **Your phone reached production and not your copy.** Your copy is reached only while a
  `pinecall start` of yours holds that agent, from the phone `pinecall line from` named on this
  gateway, in the org that agent is yours in. `pinecall line` says what the gateway knows; a
  `pinecall start` started again says the phone again.
- **`docs push` "did nothing" to production.** It replaced your sandbox base, which is the
  right thing. Production's is `pinecall docs push --prod`, in the release step.
- **The class is refused at load: `` `voice` is the world's now, not the class's ``.** The voice,
  the model, the greeting, the words, the memory policy, what it knows by heart and the bases it
  searches are settings, per world and per corner — the refusal names the verb that sets each.
  Remove the field from the class; nothing else changes.

## The doors underneath

`POST /v1/signup` · `POST /v1/login` · `GET /v1/login/orgs`, `POST /v1/login/org` (the person's
orgs, and their key in another) · the four under `/v1/login/pairings` (signing a terminal in) ·
`GET`/`POST /v1/keys`, `POST /v1/keys/{fingerprint}/revoke` (the Tokens screen) · `GET`/`POST
/v1/members`, `PATCH /v1/members/{id}` (`production` among its fields) · `POST
/v1/invitations/{token}` · `GET`/`POST`/`DELETE /v1/agents/{slug}/line` · `PUT`/`DELETE
/v1/line/from` · `GET /v1/agents/{slug}/rings-for` (the worker's, on every production ring: whose
sandbox copy a caller's phone reaches) · the `pinecall-env` header on every one of them. Shapes and
refusals: the runtime's `docs/protocol/people.md` and `gateway-api.md` §1, §5, §7, §8.
