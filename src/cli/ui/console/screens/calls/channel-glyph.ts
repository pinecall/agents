/** The one mark that says which door a call came through, for a list that has no room for a word. */

import type { Channel } from "@pinecall/protocol";

const GLYPHS: Record<Channel, string> = { phone: "☎", web: "◍", whatsapp: "✉" };

/** The glyph of a channel; a call that has not said which door it came through gets a dash. */
export function glyphOf(channel: Channel | null): string {
  return channel === null ? "–" : GLYPHS[channel];
}
