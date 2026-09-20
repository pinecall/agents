/** A command that cannot run as it was typed: exit 2, the code every usage refusal already uses. */

/**
 * The difference the exit code is for. **1** is a measurement that did not hold — a golden broke,
 * a judge answered broken, the gateway refused what was asked — and a script may reasonably retry
 * it or read the log. **2** is this command cannot run at all: no key, a flag that is not a flag,
 * a name nobody wrote, a project of several agents with none named. Retrying that changes nothing.
 *
 * The dispatcher reads it once (`cli/index.ts`), so a verb throws its own sentence and never a
 * number, and a refusal written deep in `home.ts` gets the same code as one written at the door.
 */
export class CannotRun extends Error {
  override readonly name = "CannotRun";
}

/** The refusal, thrown. Reads as the sentence it is: `throw cannotRun(\`no agent ${slug}…\`)`. */
export function cannotRun(said: string): CannotRun {
  return new CannotRun(said);
}
