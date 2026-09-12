/** Every verb this process answers itself: what only the terminal in the agent's directory can do. */

import type { DevVerb } from "@pinecall/protocol";

import { DevRefused, type DevHandler } from "../../client/index.js";
import { refusedAs } from "./refusal.js";

import type { Chatting } from "./chatting.js";
import type { Drifting } from "./drifting.js";
import type { Knowing } from "./knowing.js";
import type { Promoting } from "./promoting.js";
import type { Remembering } from "./remembering.js";
import type { Reproducing } from "./reproducing.js";
import type { Simulating } from "./simulating.js";
import type { Testing } from "./testing.js";

/**
 * One door of this process. `path` is what follows `ui/` exactly, and a door answers one verb or
 * both; a path nobody registered is a 404 from the server, which knows nothing else about them.
 */
export interface OwnDoor {
  path: string;
  get?: () => Promise<unknown>;
  post?: (asked: unknown) => Promise<unknown>;
}

/** What `pinecall ui` hands in. Every field is what one page of the console needs from this process. */
export interface Own {
  simulating?: Simulating | undefined;
  testing?: Testing | undefined;
  chatting?: Chatting | undefined;
  knowing?: Knowing | undefined;
  remembering?: Remembering | undefined;
  promoting?: Promoting | undefined;
  drifting?: Drifting | undefined;
  reproducing?: Reproducing | undefined;
}

/** One verb of this process, as the wire names it and as the console's body reaches it. */
export type Verbs = Partial<Record<DevVerb, (asked: unknown) => Promise<unknown>>>;

/**
 * The table, keyed by the wire's verb. A screen that needs something only this process can do —
 * the class of this directory, its personas, its goldens, its files — adds ONE module and ONE
 * row here; `pinecall run` answers the gateway's dev.request off it and knows nothing else.
 */
export function ownVerbs(own: Own): Verbs {
  const verbs: Verbs = {};
  const { simulating, testing, chatting, knowing, remembering, promoting, drifting, reproducing } = own;
  if (simulating !== undefined) {
    verbs["simulate.roster"] = () => simulating.roster();
    verbs["simulate.start"] = (asked) => simulating.start(asked);
  }
  if (testing !== undefined) {
    verbs["goldens.roster"] = () => testing.roster();
    verbs["goldens.run"] = (asked) => testing.start(asked);
  }
  if (chatting !== undefined) {
    verbs["chat.roster"] = () => chatting.roster();
    verbs["chat.start"] = (asked) => chatting.start(asked);
    verbs["chat.say"] = (asked) => chatting.say(asked);
    verbs["chat.end"] = (asked) => chatting.end(asked);
  }
  if (knowing !== undefined) {
    verbs["knowledge.roster"] = () => knowing.roster();
    verbs["knowledge.push"] = (asked) => knowing.push(asked);
    verbs["knowledge.eval"] = (asked) => knowing.measure(asked);
  }
  if (remembering !== undefined) {
    verbs["memory.roster"] = () => remembering.roster();
    verbs["memory.eval"] = (asked) => remembering.recall(asked);
    verbs["memory.extraction"] = (asked) => remembering.extract(asked);
  }
  if (promoting !== undefined) {
    verbs["promote.roster"] = () => promoting.roster();
    verbs["promote.write"] = (asked) => promoting.promote(asked);
  }
  if (drifting !== undefined) {
    verbs["drift.read"] = (asked) => drifting.read(asked);
  }
  if (reproducing !== undefined) {
    verbs["reproductions.roster"] = (asked) => reproducing.roster(asked);
    verbs["reproductions.read"] = (asked) => reproducing.read(asked);
  }
  return verbs;
}

// A verb nobody registered — a `pinecall run` in a directory with no personas, asked to simulate.
const NOT_HERE = (verb: string): string => `this process answers no ${verb}: nothing of it is in this directory`;

/**
 * The table as the client's Agent takes it. A refusal keeps its status and its sentence — the
 * module's own, or the gateway's when the module was refused by the gateway — through the one
 * place the three shapes become one (`refusedAs`); the console shows exactly that.
 */
export function devHandler(verbs: Verbs): DevHandler {
  return async (verb, data) => {
    const answer = verbs[verb];
    if (answer === undefined) throw new DevRefused(404, NOT_HERE(verb));
    try {
      return (await answer(data)) as Record<string, unknown>;
    } catch (failed) {
      const said = refusedAs(failed);
      throw new DevRefused(said.status, said.detail);
    }
  };
}

/**
 * The same table by path, for `pinecall ui`'s own server, for as long as that verb exists.
 */
export function ownDoors(own: Own): OwnDoor[] {
  const doors: OwnDoor[] = [];
  const { simulating, testing, chatting, knowing, remembering, promoting, drifting, reproducing } = own;
  if (simulating !== undefined) {
    doors.push({ path: "personas", get: () => simulating.roster() });
    doors.push({ path: "simulate", post: (asked) => simulating.start(asked) });
  }
  if (testing !== undefined) {
    doors.push({ path: "goldens", get: () => testing.roster() });
    doors.push({ path: "test", post: (asked) => testing.start(asked) });
  }
  if (chatting !== undefined) {
    doors.push({ path: "chat", get: () => chatting.roster(), post: (asked) => chatting.start(asked) });
    doors.push({ path: "chat/say", post: (asked) => chatting.say(asked) });
    doors.push({ path: "chat/end", post: (asked) => chatting.end(asked) });
  }
  if (knowing !== undefined) {
    doors.push({ path: "knowledge", get: () => knowing.roster() });
    doors.push({ path: "knowledge/push", post: (asked) => knowing.push(asked) });
    doors.push({ path: "knowledge/eval", post: (asked) => knowing.measure(asked) });
  }
  if (remembering !== undefined) {
    doors.push({ path: "memory", get: () => remembering.roster() });
    doors.push({ path: "memory/eval", post: (asked) => remembering.recall(asked) });
    doors.push({ path: "memory/extraction", post: (asked) => remembering.extract(asked) });
  }
  if (promoting !== undefined) {
    doors.push({ path: "candidates", get: () => promoting.roster() });
    doors.push({ path: "promote", post: (asked) => promoting.promote(asked) });
  }
  if (drifting !== undefined) {
    doors.push({ path: "drift", post: (asked) => drifting.read(asked) });
  }
  if (reproducing !== undefined) {
    doors.push({ path: "reproductions", post: (asked) => reproducing.roster(asked) });
    doors.push({ path: "reproduction", post: (asked) => reproducing.read(asked) });
  }
  return doors;
}
