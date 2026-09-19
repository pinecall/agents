/** The lexicon doors as the console reads them: the three corners, and a set. */

import { LexiconAnswerSchema, type LexiconAnswer, type LexiconBody } from "@pinecall/protocol";

import { put, read, type Credentials } from "../../../shared/api";

const LEXICON = "/v1/lexicon";

/** The org's words as this key sees them: yours, the team's, production's. */
export async function readLexicon(credentials: Credentials): Promise<LexiconAnswer> {
  return LexiconAnswerSchema.parse(await read(credentials, LEXICON));
}

/** The whole lexicon as the corner's next version, checked against the version it was read at. */
export async function setLexicon(credentials: Credentials, lexicon: LexiconBody, ifVersion: number | null, note: string | null, team: boolean): Promise<LexiconAnswer> {
  return LexiconAnswerSchema.parse(await put(credentials, LEXICON, { lexicon, if_version: ifVersion, note, team }));
}
