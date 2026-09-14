/** Whose copy of an agent is whose: the sandbox holds one per person, and some keys see them all. */

import type { HeldAgent } from "@pinecall/protocol";

import type { Whose } from "./whoami";

/** Which corners a page is showing: everybody's, only yours, or only the ones that are not. */
export type Corners = "everything" | "mine" | "the team's";

export const CORNERS: readonly Corners[] = ["everything", "mine", "the team's"];

/**
 * Whether this row is somebody else's copy.
 *
 * The org's own — a machine key's, which is what production always is and what a shared sandbox
 * is — belongs to nobody, so it is never somebody else's and is shown to everyone.
 */
export function somebodyElses(held: HeldAgent, me: string | null | undefined): boolean {
  const whose = held.holder?.holder;
  return whose !== undefined && whose !== null && whose !== me;
}

/** The rows a filter leaves. `everything` is every row, which is what a developer always sees. */
export function through(agents: HeldAgent[], corners: Corners, me: string | null | undefined): HeldAgent[] {
  if (corners === "everything") return agents;
  const theirs = corners === "the team's";
  return agents.filter((held) => somebodyElses(held, me) === theirs);
}

/**
 * One row per slug, this reader's own corner winning.
 *
 * Every screen under an agent is addressed by slug alone — `/a/<slug>/talk` — and the door behind
 * it answers in the corner the key opens. So a selector that offered a colleague's copy would be
 * offering a page that shows you your own: the choice is the slug, and whose is a column.
 */
export function bySlug(agents: HeldAgent[], me: string | null | undefined): HeldAgent[] {
  const kept = new Map<string, HeldAgent>();
  for (const held of agents) {
    const standing = kept.get(held.slug);
    if (standing === undefined || (somebodyElses(standing, me) && !somebodyElses(held, me))) {
      kept.set(held.slug, held);
    }
  }
  return [...kept.values()];
}

/** Whose corner, as a line says it: the address when there is a member, the org's when there is not. */
export function whoseCorner(held: HeldAgent): string {
  const whose = held.holder;
  if (whose === undefined || whose === null) return "the org's";
  return whose.name ?? whose.holder ?? "the org's";
}

/** The member this tab is, or null for a key that names nobody. What `mine` is measured against. */
export function meIn(whose: Whose | null): string | null {
  return whose?.subject ?? null;
}
