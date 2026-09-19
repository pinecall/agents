// The sandbox holds one agent per person, so a key that sees the whole team is answered the same
// slug several times. What the console does with that: the selector still offers one row per slug
// — every screen is addressed by slug alone — and the front page says whose each corner is.

import type { HeldAgent } from "@pinecall/protocol";
import { describe, expect, it } from "vitest";

import { bySlug, meIn, somebodyElses, through, whoseCorner } from "../../../../src/cli/ui/console/lib/corners";

const ME = "m_berna";

function held(slug: string, holder?: string, name?: string): HeldAgent {
  return {
    slug,
    channels: ["web"],
    ...(holder === undefined ? {} : { holder: { holder, name: name ?? null } }),
  };
}

const MINE = held("tienda-sur", ME, "berna@clinica.test");
const CARLAS = held("tienda-sur", "m_carla", "carla@clinica.test");
const THE_ORGS = held("clinica-norte");

describe("whose copy a row is", () => {
  it("is nobody's when a machine key holds it: production's, and a shared sandbox's", () => {
    expect(somebodyElses(THE_ORGS, ME)).toBe(false);
    expect(whoseCorner(THE_ORGS)).toBe("the org's");
  });

  it("is mine when the member is me, and somebody else's when it is not", () => {
    expect(somebodyElses(MINE, ME)).toBe(false);
    expect(somebodyElses(CARLAS, ME)).toBe(true);
  });

  // `m_98889a61` names nobody a person can recognise, which is why the row carries the address.
  it("reads as the address, and falls back to the id on a row that has no name", () => {
    expect(whoseCorner(CARLAS)).toBe("carla@clinica.test");
    expect(whoseCorner(held("tienda-sur", "m_ana"))).toBe("m_ana");
  });

  it("is measured against the member this tab is, and nobody for a key that names none", () => {
    expect(meIn({ org: "clinica", key_id: "k_1", env: "sandbox", scopes: [], subject: ME, production: false })).toBe(ME);
    expect(meIn(null)).toBeNull();
  });
});

describe("the filter on the front page", () => {
  it("leaves everything alone, which is what a developer is always shown", () => {
    expect(through([MINE, CARLAS, THE_ORGS], "everything", ME)).toHaveLength(3);
  });

  it("keeps the org's beside mine, because nobody else is holding it", () => {
    expect(through([MINE, CARLAS, THE_ORGS], "mine", ME)).toEqual([MINE, THE_ORGS]);
  });

  it("keeps only the corners that are not this reader's", () => {
    expect(through([MINE, CARLAS, THE_ORGS], "the team's", ME)).toEqual([CARLAS]);
  });
});

describe("what the selector offers", () => {
  // A screen is `/a/<slug>/…` and the door behind it answers in the corner this key opens, so
  // offering a colleague's copy would offer a page that shows the reader their own.
  it("is one row per slug, and the reader's own wins over a colleague's", () => {
    expect(bySlug([CARLAS, MINE, THE_ORGS], ME)).toEqual([MINE, THE_ORGS]);
    expect(bySlug([MINE, CARLAS], ME)).toEqual([MINE]);
  });

  it("keeps a colleague's when it is the only copy there is", () => {
    expect(bySlug([CARLAS, THE_ORGS], ME)).toEqual([CARLAS, THE_ORGS]);
  });
});
