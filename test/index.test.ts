// The public surface of `pinecall`, pinned: what a stranger who installs the package can reach,
// by name. Adding an export means editing this list on purpose, which is the point — a CLI module
// or a bridge internal reaching the surface is how `absorb` and `urlFrom` got there once.

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
    "phoneRoute",
    "promptOf",
    "recalled",
    "register",
    "render",
    "renderInline",
    "renderToNodes",
    "renderToText",
    "restore",
    "routesOf",
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
    "webRoute",
    "whatsappRoute",
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
