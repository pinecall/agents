/** A refusal from one of the console's own doors: a sentence for the page, and the status it travels under. */

/** Thrown by a door of this process; the server writes it as `{detail}` under `status`, as FastAPI would. */
export class Refused extends Error {
  override readonly name = "Refused";

  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}
