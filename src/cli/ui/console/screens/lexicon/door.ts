/** The lexicon doors as the console reads them: the three corners, a set, and the two hops of promote. */

import { LexiconAnswerSchema, PromotedSchema, type LexiconAnswer, type LexiconBody, type Promoted } from "@pinecall/protocol";

import { post, put, read, type Credentials } from "../../../shared/api";

const LEXICON = "/v1/lexicon";

/** The org's words as this key sees them: yours, the team's, production's. */
export async function readLexicon(credentials: Credentials): Promise<LexiconAnswer> {
  return LexiconAnswerSchema.parse(await read(credentials, LEXICON));
}

/** The whole lexicon as the corner's next version, checked against the version it was read at. */
export async function setLexicon(credentials: Credentials, lexicon: LexiconBody, ifVersion: number | null, note: string | null, team: boolean): Promise<LexiconAnswer> {
  return LexiconAnswerSchema.parse(await put(credentials, LEXICON, { lexicon, if_version: ifVersion, note, team }));
}

/** One hop: yours to the team's, or the team's sandbox to production. No goldens between. */
export async function promoteLexicon(credentials: Credentials, to: "team" | "production"): Promise<Promoted> {
  return PromotedSchema.parse(await post(credentials, `${LEXICON}/promote`, { to, note: null }));
}
