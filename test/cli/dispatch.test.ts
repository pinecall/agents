// The dispatcher: every group of the design is declared, and the ones not written yet say so.

import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { PLANNED, notBuiltYet, plannedGroup } from "../../src/cli/groups.js";
import { groupNames, main, usage } from "../../src/cli/index.js";
import { written } from "./said.js";

// A stream that keeps what was written, so a test reads the CLI's output as a string.
function collected(): { stream: NodeJS.WritableStream; text(): string } {
  const written: string[] = [];
  const stream = { write: (chunk: string) => written.push(chunk) } as unknown as NodeJS.WritableStream;
  return { stream, text: () => written.join("") };
}

describe("the groups the CLI answers to", () => {
  // `phones` was the design's word for it and the verb is `numbers`: the gateway's door, the
  // console's screen and the runtime's CLI all say numbers, and one idea gets one name.
  it("declares every group of the design's verb list", () => {
    const declared = groupNames();

    expect(declared).not.toContain("phones");

    for (const group of ["new", "g", "link", "start", "chat", "prompt", "test", "simulate", "runs", "personas", "eval", "sessions", "docs", "memory", "login", "whoami", "tokens", "numbers", "agent", "lexicon", "supervise", "observe", "call", "costs", "deploy"]) {
      expect(declared).toContain(group);
    }
  });

  it("tells a person what a group that does not exist yet will be, and leaves with a zero", async () => {
    const out = collected();

    const code = await main(["costs"], out.stream);

    expect(out.text()).toBe("costs is not built yet: what the calls cost, by agent, model or channel\n");
    expect(code).toBe(0);
  });

  // `talk` spawned the operator's Python worker once, was planned again as a microphone in the
  // terminal, and was a page of its own for an evening; it is the first screen of the console,
  // which the GATEWAY serves at /a/<agent>/talk. Neither is a verb here, and `ui` left too.
  it("holds no `console` verb and no `talk` of its own", () => {
    expect(Object.keys(PLANNED)).not.toContain("console");
    expect(Object.keys(PLANNED)).not.toContain("talk");
    expect(groupNames()).not.toContain("talk");
  });

  it("names the verb and its purpose, so the line reads without the table beside it", () => {
    expect(notBuiltYet("deploy", PLANNED["deploy"]!)).toBe(
      "deploy is not built yet: put this app on a box and keep it there",
    );
  });

  it("refuses a group nobody declared, with the usage a person can read", async () => {
    const out = collected();
    const err = collected();

    const code = await main(["fly"], out.stream, err.stream);

    expect(code).toBe(2);
    expect(err.text()).toContain("no such group: fly");
  });

  it("prints every group under --help, built and planned alike", async () => {
    const out = collected();

    expect(await main(["--help"], out.stream)).toBe(0);
    expect(out.text()).toContain("start     the app and its doors");
    expect(out.text()).toContain("supervise");
  });

  // The flags belong to the group, so `pinecall start --help` is where a person reads them — and
  // where the three page-serving flags the console replaced must not come back.
  it("prints a group's own help under its own name, and names no console flag", async () => {
    const out = collected();

    expect(await main(["start", "--help"], out.stream)).toBe(0);

    expect(out.text()).toContain("pinecall start — the app and its doors");
    expect(out.text()).toContain("--show-prompt");
    expect(out.text()).not.toContain("--console");
    expect(out.text()).not.toContain("--open");
  });

  it("marks every planned group as such in the usage, so no verb reads as built", () => {
    for (const [name, purpose] of Object.entries(PLANNED)) {
      expect(usage()).toContain(`${name.padEnd(10)}${purpose} — not built yet`);
    }
  });

  // `--prod` says which world ONE command runs in, and a verb that asks nobody anything has no
  // world to name: `pinecall prompt --prod` took the flag and rendered the same offline prompt,
  // which reads as production having been consulted (2026-09-20).
  it("refuses --prod on a verb that reaches no gateway", async () => {
    const err = collected();

    const code = await main(["prompt", "--prod", "--state", "nothing.json"], collected().stream, err.stream);

    expect(code).toBe(2);
    expect(err.text()).toContain("prompt reaches no gateway, so --prod names nothing");
  });

  // Node's own sentence for a flag nobody wrote names `--` and positional arguments; a person
  // wants the verb whose flag it was not, and the page that lists the flags it does take.
  it("names the verb and its help when a flag is not one of that verb's", async () => {
    const err = collected();

    const code = await main(["whoami", "--json"], collected().stream, err.stream);

    expect(code).toBe(2);
    expect(err.text()).toContain("pinecall: no such flag for whoami: '--json'");
    expect(err.text()).toContain("`pinecall whoami --help`");
  });

  it("prints nothing but the line when a planned group runs", () => {
    const out = collected();

    plannedGroup("deploy", PLANNED["deploy"]!, out.stream).run([]);

    expect(out.text()).toBe("deploy is not built yet: put this app on a box and keep it there\n");
  });
});

