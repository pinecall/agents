// pinecall/client: an app registers its agents over the gateway's WS door, answers their tool
// calls, and reads any log its key can reach. The wire's own shapes come from @pinecall/protocol.
//
// This is the socket, and nothing above it: no Agent class, no view, no CLI. An app that has
// its own way of deciding what to answer imports this and never the framework.

export { Agent } from "./agent.js";
export type { AgentGateway, AgentOptions, DevHandler, Tool } from "./agent.js";
export { Call, CallBook } from "./calls.js";
export type { CallGateway, CallStatus } from "./calls.js";
export { Pinecall } from "./client.js";
export type { Found, PinecallOptions } from "./client.js";
export { Connection } from "./connection.js";
export type { Backoff, ConnectionHandlers, ConnectionOptions } from "./connection.js";
export { agentLogUrl, appsUrl, callLogUrl, lookupUrl } from "./endpoints.js";
export { DevRefused, PinecallError, Refused, frame, nextId } from "./frames.js";
export { Listeners, camelEvent } from "./listeners.js";
export type { AnyListener, CamelEvent, Listener, Payload } from "./listeners.js";
export { history, observe } from "./observe.js";
export type { LogTarget, Observation, Page, ReadOptions } from "./observe.js";
export type { World } from "./signed.js";
