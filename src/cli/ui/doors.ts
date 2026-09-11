/** Every door this process answers itself, under `ui/`: what only the terminal in the agent's directory can do. */

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

/**
 * The table. A screen that needs something only this process can do — the class of this directory,
 * its personas, its goldens, its files — adds ONE module and ONE row here, and the server that
 * serves them changes not at all.
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
