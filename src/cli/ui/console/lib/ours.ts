/** The calls this tab started itself: a conversation you opened is not news, and never pops a window. */

// A module-level set, because it is about this TAB and not about any one screen: Talk starts a
// call, the shell's corner windows ask about it, and neither renders the other.
const started = new Set<string>();

/** This tab opened that call. */
export function ours(call: string): void {
  started.add(call);
}

/** Whether this tab opened it. */
export function isOurs(call: string): boolean {
  return started.has(call);
}
