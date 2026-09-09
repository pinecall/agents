/** How the console says a moment: UTC to the second, or the one dash it says for what is absent. */

/** The console's one dash: a value the log does not carry, said the same way everywhere. */
export const NOTHING = "—";

// A log is read from another timezone as often as not, and two readers comparing a run against the
// call it opened must be reading the same digits. So there is one clock here and none in a screen.
/** Unix seconds as `YYYY-MM-DD hh:mm:ss`, and a dash for a time nothing carries. */
export function started(at: number | null): string {
  if (at === null) {
    return NOTHING;
  }
  return new Date(at * 1000).toISOString().slice(0, 19).replace("T", " ");
}
