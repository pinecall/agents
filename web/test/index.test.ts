// The public surface of @pinecall/web, pinned: one hook. The sources and the fold are its business.

import { describe, expect, it } from "vitest";

import * as api from "../src/index.js";

const PUBLIC = ["useCallState"];

describe("@pinecall/web", () => {
  it("exports exactly what a page imports, by name", () => {
    expect(Object.keys(api).sort()).toEqual(PUBLIC);
  });
});
