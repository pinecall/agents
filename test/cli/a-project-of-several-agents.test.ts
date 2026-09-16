// A project of several agents: agents/<name>.tsx at the root, and every folder shared by name.

import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { homeOf, homesFor } from "../../src/cli/home.js";
import { agentFilesOfTheProject } from "../../src/cli/load.js";

function aProject(files: string[]): string {
  const root = mkdtempSync(join(tmpdir(), "a-project-"));
  for (const file of files) {
    mkdirSync(join(root, file, ".."), { recursive: true });
    writeFileSync(join(root, file), "");
  }
  return root;
}

describe("the agents of a project", () => {
  it("are the files under agents/, sorted, and never a test or a declaration beside them", () => {
    const root = aProject(["agents/sales.tsx", "agents/dispatch.tsx", "agents/sales.test.ts", "agents/types.d.ts"]);

    expect(agentFilesOfTheProject(root)).toEqual([join(root, "agents/dispatch.tsx"), join(root, "agents/sales.tsx")]);
  });

  it("are none in a directory that holds an agent.tsx of its own: that is one agent's folder", () => {
    const root = aProject(["agent.tsx", "agents/sales.tsx"]);

    expect(agentFilesOfTheProject(root)).toEqual([]);
  });
});

describe("an agent's home", () => {
  it("in a project, is every shared folder by the agent's name", () => {
    const root = aProject(["agents/sales.tsx"]);

    const home = homeOf(join(root, "agents/sales.tsx"));

    expect(home).toEqual({
      file: join(root, "agents/sales.tsx"),
      name: "sales",
      root,
      goldens: join(root, "test/goldens/sales"),
      personas: join(root, "test/personas/sales"),
      docs: join(root, "knowledge/sales"),
      knowledgeGolden: join(root, "knowledge/sales.golden.json"),
      memoryGolden: join(root, "memory/sales.golden.json"),
      memoryCases: join(root, "test/memory/sales"),
    });
  });

  it("alone in its folder, is the folders beside its agent.tsx, as they always were", () => {
    const root = aProject(["agent.tsx"]);

    const home = homeOf(join(root, "agent.tsx"));

    expect([home.goldens, home.personas, home.docs, home.knowledgeGolden]).toEqual([
      join(root, "test/goldens"),
      join(root, "test/personas"),
      join(root, "knowledge/docs"),
      join(root, "knowledge/golden.json"),
    ]);
  });

  it("is found for every agent at the root, or for the one --agent names by its name", async () => {
    const root = aProject(["agents/dispatch.tsx", "agents/sales.tsx"]);
    const was = process.cwd();
    process.chdir(root);
    try {
      expect((await homesFor()).map((home) => home.name)).toEqual(["dispatch", "sales"]);
      expect((await homesFor(undefined, "sales")).map((home) => home.name)).toEqual(["sales"]);
    } finally {
      process.chdir(was);
    }
  });
});
