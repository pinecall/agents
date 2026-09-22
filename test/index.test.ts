// The public surface of `pinecall`, pinned: what a stranger who installs the package can reach,
// by name. Adding an export means editing this list on purpose, which is the point — a CLI module
// or a bridge internal reaching the surface is how `absorb` and `urlFrom` got there once.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import * as api from "../src/index.js";

// Sorted, so the list reads as a list and a new name lands where it belongs rather than at the end.
const PUBLIC = [
    "Agent",
    "CONFIG_FIELDS",
    "CallWorld",
    "DEFAULT_LANGUAGE",
    "DeclarationRefused",
    "Example",
    "Fragment",
    "History",
    "NO_GATEWAY_TO_SEARCH",
    "PROMPT_BLOCKS",
    "ParticipantHandle",
    "Protocols",
    "Room",
    "Rule",
    "Rules",
    "Section",
    "ToolFailed",
    "UnauthoredWrite",
    "accepts",
    "blocks",
    "changes",
    "classDoc",
    "collapse",
    "currentAuthor",
    "declaredStateOf",
    "describe",
    "diff",
    "docOf",
    "docsOf",
    "docsVersion",
    "emitEvent",
    "eventsOf",
    "headerFor",
    "internalsOf",
    "isConfigField",
    "jsx",
    "jsxDEV",
    "jsxs",
    "languages",
    "logOf",
    "methodDoc",
    "methodParams",
    "mount",
    "onChange",
    "onLog",
    "optionsFor",
    "p",
    "parametersOf",
    "parseClassSource",
    "promptOf",
    "recalled",
    "register",
    "render",
    "renderInline",
    "renderToNodes",
    "renderToText",
    "restore",
    "runHook",
    "runTool",
    "said",
    "seal",
    "setCall",
    "setLast",
    "showPrompt",
    "slugOf",
    "snapshot",
    "state",
    "tagged",
    "tool",
    "toolNamed",
    "toolsOf",
    "view",
    "viewOf",
    "visibilityOf",
    "visibleTools",
    "visibleToolsOf",
    "withAuthor",
    "withAuthorAsync",
    "wordsFor",
];

describe("the package's public surface", () => {
  it("exports these names and no others", () => {
    expect(Object.keys(api).sort()).toEqual(PUBLIC);
  });

  it("exports nothing from the CLI and nothing the bridge only talks to itself with", () => {
    const internals = ["absorb", "screenFor", "draw", "urlFrom", "apiKeyFrom", "load", "mountOptions", "inOrder", "dispatch", "validate", "argumentsFor", "preview", "connectedLine", "talk"];
    expect(internals.filter((name) => name in api)).toEqual([]);
  });
});

describe("what npm actually serves", () => {
  // A tenant imports `publishConfig.exports`; this checkout resolves `exports`. A subpath in one
  // and not the other is a door that works here and is missing for everybody else — which is
  // exactly how `pinecall/panels` shipped in 0.8.16 with nothing reachable behind it.
  it("publishes every subpath it develops against", () => {
    const pkg = JSON.parse(
      readFileSync(fileURLToPath(new URL("../package.json", import.meta.url)), "utf8"),
    ) as { exports: Record<string, unknown>; publishConfig: { exports: Record<string, unknown> } };
    expect(Object.keys(pkg.publishConfig.exports).sort()).toEqual(Object.keys(pkg.exports).sort());
  });
});
