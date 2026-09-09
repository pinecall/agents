# The second tenant: Tienda Sur

A ferretería in Triana that takes an order by phone, WhatsApp and web. It exists because a fleet of
one agent proves nothing about a multi-tenant gateway, and because the second tenant is where you
find out which of the first one's choices were the framework and which were the clinic.

Read [example-clinica-norte.md](example-clinica-norte.md) first: everything below is a difference
from it. Nothing was copied — same shape, another business, other words — and the shape held. The
class, the view, the fake system, the goldens and the personas are the same five files, and the
framework needed no change to take a shop instead of a clinic.

## What is different, and why

**The readback is a phase, not a field.** The clinic needed `proposed: boolean` because both the
turn where the hour is read back and the turn after the yes are `stage: "book"`: same state, same
paragraph, and the model had to infer the turn from a history the dynamic region does not
summarise. The shop's stages are `browse · cart · confirm · done`, so `proposeOrder()` moves the
stage to `confirm` and the two turns are two different states by construction. A `proposed` beside
that would be the same truth written twice, which is the one thing the hygiene rules forbid. The
lesson is identical and the mechanism is cheaper: **when the readback deserves a name, give it a
stage; when it is one moment inside a stage, give it a field.**

`addToCart` sends the stage back to `cart`, which is the shop's version of `freeSlots` clearing
`proposed`: something added after the readback means the order that was read is not the order the
customer is taking, so it has to be read again.

**`findProduct` and `addToCart` stay visible in `confirm`.** The card fixed them at
`["browse","cart"]`. With that, a customer who says *"y échame también un rollo de cinta"* after the
readback has no tool and the phase is a dead end — nothing can leave it but a yes. Two extra names
in one `stage` list is the whole fix.

**The counter is cumulative, and that is a bug the vitests could not see.** `findProduct` first
REPLACED `found`, the way `freeSlots` replaces `slots`. It is right for the clinic — a patient books
one hour out of the last list — and wrong for a shop, where the cart is built over several turns.
The first end-to-end `pinecall chat` (2026-09-09) is what showed it: the pintura was quoted, a
second search for *"brocha ancha"* came back empty, and it wiped the pintura off the counter, so
`addToCart("pintura plástica blanca")` was refused three turns running and the call ended with the
agent offering to pass the customer to a person. Every vitest was green: each one searched once.

`counter` now holds everything the shop has quoted in this call, newest first — which is what the
refusal's own sentence already claimed (*"Sobre el mostrador hay: …"*). Three tests nail it, one of
them the exact sequence the chat walked.

**The search has two passes.** All the long words of what was said, and only if that finds nothing,
any of them. *"brocha ancha"* is how a brocha is asked for and no ficha reads that way; *"cinta de
carrocero"* must not bring the cinta métrica. One pass cannot have both.

**The shop tutea.** The clinic says usted. It is the business's voice, and as a side effect the two
examples now cover both branches of `RegisterJudge` instead of one.

**No `transfer`.** The clinic has one, stubbed with a TODO until the framework has `call.forward`.
A second stub would be a fork of a stub, and a ferretería with one line has nobody to transfer to;
the static prefix's *"ofrece pasar con una persona"* is the honest fallback and needs no tool.

## The finding that shaped the goldens: `A_PRICE` is `Scope.TEXT`

`pinecall_evals/grounded.py` splits the evidence in two. A price must appear in the **text** — the
knowledge file and the retrieved chunks — while an hour, a date and a person's name may come from a
**tool answer or the state**. The comment there says why: *"A price is published, so it is in the
knowledge."*

That is true of a clinic and false of a shop. Tienda Sur's prices live in `lib/catalog.ts`, behind
`findProduct`, because a catalogue is the one thing in a ferretería that changes without notice —
and the class says so in its own docstring: *un precio sale del catálogo y nunca de tu cabeza*.
Writing the twelve prices into `knowledge/tienda.md` as well, purely so the code check could match
them, would be defining each price twice so that a judge would stop asking.

So the tenant did not do that, and the goldens were written around it: **`grounded: true` only on a
conversation whose facts are knowledge facts, or that states no price at all.**
`no-inventa-un-precio-que-no-esta-en-el-catalogo` is the second kind — the caller asks for a
lavadora, which the shop does not sell, and the golden asks for `grounded` and for the absence of
the word *euros*. The suite runs at **0 judge calls**, which is the point: a code check that cannot
match falls through to a model, and a model costs money on every run forever.

Two smaller traps of the same shape, worth knowing before writing a golden here:

- **`A_DATE` matches a weekday name and looks for it in the CALL half.** The shop's opening hours
  are *de lunes a viernes* in the knowledge, which is the text half — so a `grounded` golden about
  the timetable would break by code and be sent to a judge. Every order in this tenant is delivered
  *esta misma tarde*, which names no day, and no golden asks about the timetable.
- **`says` is a substring of the agent's own turns**, so a phrase a golden expects must be one the
  tool's answer already contains. `dice-que-el-rodillo-esta-agotado-en-vez-de-cerrar` expects
  *agotado*, which is the word `OutOfStock`'s message uses.

If the framework ever wants a tenant to move an extractor's scope, that is its card and not this
one; the shapes are the framework's, and today the scopes are too.

## A golden that was reshaped before it was ever green

`dice-que-el-rodillo-esta-agotado-en-vez-de-cerrar` first seeded `stage: "confirm"` and opened with
a single turn, *"Sí, ciérramelo."* It went red: the agent ran no tool at all and said *"Rosa, te
confirmo el pedido: un rodillo antigoteo de veintidós centímetros, siete euros. ¿Vale así?"*
(`call_e233d2660b34418e97a443887b8413fd`, seq 7 and 14).

That is the right answer. The call had no readback in it — a caller whose first word is *sí* has
been told nothing yet — and the `confirm` paragraph says *léeselo entero si todavía no lo has
hecho*. The golden was testing a cold open, not the shop's refusal. It now starts in `cart` and
takes two turns, exactly like its mirror `cierra-cuando-el-cliente-dice-que-si`, so what it asks
about is what it is named after. The agent was not touched.

## What the goldens are

Eight, 8/8 on haiku at 0 judge calls (`run_9b1bfc8cac9f`, 0.0459 EUR, 31s):
identify the customer · find a product · add to the cart · do not close before the yes
(`not_tools`) · close on the yes · do not invent a price (`grounded`) · the out-of-stock refusal ·
the status of an order from another day. Two personas: `manitas`, who knows what he wants, and
`indecisa`, who describes it instead of naming it.

## The one thing both tenants write twice

`spoken()` here and `loose()` in the clinic are the same function — what was said, made comparable:
NFD, diacritics dropped, casefolded, trimmed. Every tenant that takes a name or a product over the
phone needs it, and neither tenant can import the other. It belongs in `pinecall`, beside
the view helpers, and it is not this card's to put there.
