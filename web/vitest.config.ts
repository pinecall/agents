// The hook against scripted sources, in a DOM that is not a browser. No gateway, no room, no keys.
// The wire is resolved through its dist, as a published @pinecall/protocol would be, which is why
// `scripts/check` builds before it tests.
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "jsdom",
    include: ["test/**/*.test.ts", "test/**/*.test.tsx"],
  },
});
