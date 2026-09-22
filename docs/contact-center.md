# Handing a call to a person

An agent that can only talk is half an agent. These are the verbs that let it hand what it is
doing to somebody else — a colleague on a phone, a supervisor at a desk, your own backend later —
and every one of them is a method on `this.call`, used inside a `@tool` of yours. The platform
never decides what the caller is told: the tool gets back what really happened, in a value, and
the words are the agent's.

```ts
/** Pasa la llamada a una persona del centro. Úsala cuando quien llama pida hablar con alguien. */
@tool({ timeout: 60 })
async transferToHuman(): Promise<string> {
  await this.say("Le paso con un compañero, un momento.");
  const done = await this.call.transfer("+34910000099");
  if (done.ok) return "La llamada pasó a un compañero: no digas nada más.";
  return "No se ha podido pasar la llamada y quien llama sigue contigo: díselo y sigue ayudándole.";
}
```

**Announce it first, and await the announcement.** `say` resolves when the line has been spoken,
and the platform waits for the agent to stop talking before it moves anything — a transfer made
mid-word is heard as a dropped call.

## `transfer` — the caller goes to a number

```ts
const done = await this.call.transfer("+34910000099");        // the platform picks how
const done = await this.call.transfer("+34910000099", { mode: "warm" });
```

Two different things happen behind that one word, and which one you get depends on where the
caller is:

| the caller is | what happens | what the call is afterwards |
|---|---|---|
| on a phone | their own line is sent on to the number (a SIP REFER) | over: they are with the other number and the agent is gone |
| in a browser | the number is dialled INTO this call; the caller hears it ring, and when it answers the agent goes mute and deaf | still running, with the two of them on it; it ends when either hangs up |
| in a chat | nothing: there is no line to send anywhere | unchanged — ask for a person instead |

Unsaid, `mode` is the right one for the call. Say `"cold"` or `"warm"` only to insist, and it is
refused rather than quietly swapped: the two leave different calls behind.

`{ ok, mode, to, error }` comes back. **`ok: false` means nobody moved** — the caller is still on
the line, waiting to hear what happened, and the tool's return value is how the agent knows what to
tell them. Dialling a number into a browser call needs the org's outbound trunk
(`pinecall carrier outbound`, or the console's Numbers screen); without one the transfer answers
`ok: false` and says so.

## `attention` — a person, without sending the caller anywhere

```ts
/** Pide que una persona del equipo entre en la conversación. */
@tool({ timeout: 90 })
async askForAPerson(): Promise<string> {
  await this.say("Aviso a un compañero, un momento.");
  const taken = await this.call.attention("pide un reembolso fuera de plazo", { waitS: 60 });
  if (taken.ok) return "Una persona ha entrado en la conversación: no digas nada más.";
  return "No hay nadie disponible ahora mismo. Díselo con naturalidad y sigue tú.";
}
```

The caller waits — on hold with the melody in a call, simply unanswered in a thread — and the ask
shows up as a call wanting a person: in the console's list, on the call itself, and wherever else a
supervisor is watching. It settles when somebody takes the line, when `waitS` passes with nobody
free, or when the caller hangs up.

Two things to get right:

- **`waitS` has no default.** How long your caller will hold is yours to decide, not the
  platform's.
- **The tool is running the whole time**, so give it a `timeout` longer than `waitS` — otherwise
  the tool lapses first and the model starts talking while the caller is still on hold.

A supervisor who takes the line has it: the agent hears nothing of what is said and, when they
release it, is told only that it missed something. A tool that comes back while they are holding
the line produces no reply at all, so the agent never speaks over a person.

## The rest of the line

```ts
this.call.hold();                      // the melody; the agent goes mute and deaf
this.call.unhold();                    // and back
this.call.dtmf("1,2#");                // touch tones for an IVR on the far end; a comma is a pause
this.call.callback("+34600111222", { when: "mañana por la mañana", note: "quiere el presupuesto" });
this.call.hangup("the caller was served");   // say the goodbye BEFORE this
```

`callback` writes the number into the call's log; your backend reads them with
`GET /v1/callbacks` and places the calls (`pc.agent(...).dial(...)`). `hangup` from the class is
the same ending as the model's own `end_call`, for a call your code decides is over.

None of these four answer anything: they either happen or they leave one error line in the call's
log saying why not — a chat has no line to hold, a browser call has no leg to send tones down.

## What the log says, so you can watch it happen

| entry | when |
|---|---|
| `call.transferred` | a transfer settled, either way: `to`, `mode`, `ok`, `error` |
| `attention.requested` · `attention.answered` | a person was asked for, and somebody came or nobody did |
| `call.line` | the caller went on hold, or came off it |
| `callback.requested` | somebody asked to be rung back |

The gateway's side of all of it — the commands, the outcomes, the refusals — is the runtime's
`docs/protocol/the-line.md`.
