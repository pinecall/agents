// pinecall: the tenant's side — a class whose fields are the state and whose @tool methods are
// the model's verbs. One export line per module.
//
// What a stranger who types `import { … } from "pinecall"` may reach: the agent, the JSX-to-text
// runtime its `render()` is written in, the call, and the bridge that mounts one on a client. Never a CLI module, never a bridge internal —
// test/index.test.ts pins the list, so adding an export means editing that test.
//
// The socket underneath is a door of its own, `pinecall/client`, because an app that has its own
// way of deciding what to answer wants it without any of this.

export * from "./agent/agent.js";
export * from "./agent/knowledge.js";
export * from "./agent/authors.js";
export * from "./agent/state.js";
export * from "./agent/tools.js";
export * from "./agent/decorators.js";
// Only the word a tenant writes on the class — `stage: Stages<"identify" | "book"> = "identify"`.
// Reading a stage back is the framework's and the CLI's business, so those readers stay inside.
export type { Stages } from "./agent/stages.js";
export * from "./agent/docstrings.js";
export * from "./agent/view.js";
export * from "./agent/lifecycle.js";
export * from "./views/jsx-runtime.js";
export * from "./views/components.js";
// Not `layout` itself: `promptOf(agent)` next door is that function under the name a tenant reads
// it by, and one thing with two names is one name too many.
export { PROMPT_BLOCKS, type Block, type Blocks } from "./views/layout.js";
export * from "./views/render.js";
// The tree a view renders to. The TAGS are `pinecall/panels`, a door of their own: a view is
// written in them and nothing else, and a prompt never imports one by accident.
export { renderToNodes, said, type Panels, type Tone, type ViewNode } from "./views/nodes.js";
// Not the whole module: `runTool` and its error are how a tenant runs one tool the way the bridge
// would, which is what an agent's own ring-0 suite is written against. The rest of run-tool.ts —
// the argument check, the preview cut — is the bridge's business and stays inside.
export { ToolFailed, runTool } from "./runtime/run-tool.js";
export * from "./runtime/connect.js";
export * from "./agent/visibility.js";
export * from "./agent/accepts.js";
export * from "./call/room.js";
export * from "./call/history.js";
export * from "./call/call.js";
export * from "./views/lang.js";
