// The header's right-hand end answers `whoami` on a screen: whose org, which key, who is looking.
// It showed `org` — the id every door takes — for as long as the page had existed, so on an org
// the box made it read `org_98889a61509c` at a person, which tells them nothing. The CLI decided
// this the other way on purpose (`cli/whoami.ts:orgOf`); this is the same rule, in the browser.

import { describe, expect, it } from "vitest";

import { orgOf } from "../../../../src/cli/ui/console/lib/whoami";

const A_KEY = { key_id: "k_1", env: "sandbox" as const, scopes: [], production: false };

describe("whose org the header names", () => {
  it("is the slug, the word its people type", () => {
    expect(orgOf({ ...A_KEY, org: "org_98889a61509c", slug: "pinecall" })).toBe("pinecall");
  });

  it("falls back to the id when there is no slug, rather than showing nothing", () => {
    expect(orgOf({ ...A_KEY, org: "org_98889a61509c" })).toBe("org_98889a61509c");
    expect(orgOf({ ...A_KEY, org: "org_98889a61509c", slug: null })).toBe("org_98889a61509c");
  });
});
