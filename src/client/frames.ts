// A command frame, built and checked against the schema its type names. Nothing here knows a socket.

import {
  COMMAND_SCHEMAS,
  CommandSchema,
  toSnake,
  type Camel,
  type Command,
  type CommandData,
  type CommandType,
  type EventData,
} from "@pinecall/protocol";

/** Anything the client refuses to do, and anything the gateway refused to do for it. */
export class PinecallError extends Error {
  override readonly name = "PinecallError";
}

/** A refusal the gateway sent back as an `error` entry, with the code a program can match. */
export class Refused extends PinecallError {
  constructor(readonly refusal: Camel<EventData<"error">>) {
    super(`${refusal.code}: ${refusal.message}`);
  }
}

let sent = 0;

/** The next command id, unique in this process: an `error` naming it is an answer to us. */
export function nextId(): string {
  return `c${(sent += 1)}`;
}

// The app writes camelCase and the codec turns it into the wire's keys; the schema then says
// whether the gateway would have accepted it, here, where the stack trace is still the app's.
/** One command frame, its data camelCase in and snake_case on the wire. A bad shape throws here. */
export function frame<K extends CommandType>(
  type: K,
  agent: string,
  call: string | null,
  data: Camel<CommandData<K>>,
  id: string = nextId(),
): Command {
  // zod is @pinecall/protocol's dependency, not ours: the schema is used through the one method
  // this file needs, so no version of zod is ever named on this side.
  const schema = COMMAND_SCHEMAS[type] as { parse(value: unknown): unknown };
  let checked: unknown;
  try {
    checked = schema.parse(toSnake(data));
  } catch (bad) {
    throw new PinecallError(`${type}: ${bad instanceof Error ? bad.message : String(bad)}`);
  }
  return CommandSchema.parse({ type, agent, call, id, data: checked });
}
