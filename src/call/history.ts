/** The conversation so far: finished turns, and the one sentence a long call collapses them to. */

/** One finished turn, from turn.user or turn.agent. Only what was said; the metrics stay in the log. */
export interface Turn {
  who: "user" | "agent";
  text: string;
  /** The id that joins a caller's turn to the reply it triggered. */
  speechId: string;
  /** True when the caller cut the agent off; always false for a caller's own turn. */
  interrupted: boolean;
  at: number;
}

/**
 * The turns this call has finished, oldest first. A turn lands here when its entry does, so the
 * words the model is still speaking are not in it — the log is the record, this is the reading.
 */
export class History {
  readonly #turns: Turn[] = [];
  #summary: string | null = null;

  /** Every finished turn, oldest first. */
  get turns(): readonly Turn[] {
    return this.#turns;
  }

  /** How many turns are being kept. */
  get length(): number {
    return this.#turns.length;
  }

  /** The sentence a `collapse` left in place of the turns before it, or null while none was made. */
  get summary(): string | null {
    return this.#summary;
  }

  /** The last turn, whoever took it. */
  get last(): Turn | undefined {
    return this.#turns[this.#turns.length - 1];
  }

  /** Add a finished turn. The bridge calls this from turn.user and turn.agent; nothing else does. */
  took(turn: Turn): void {
    this.#turns.push(turn);
  }

  /**
   * Drop the turns and keep one sentence in their place. This is the view's memory, not the log's:
   * the call log keeps every turn it ever had, and a summary here never rewrites one.
   */
  collapse(summary: string): void {
    this.#turns.length = 0;
    this.#summary = summary;
  }
}
