/** The org's slug out of its name, the way a person would type it: lowercase, digits, a dash between words. */

// runtime types/org.py `_A_SLUG`: `^[a-z0-9][a-z0-9-]{0,62}$`. The gateway is the judge and
// refuses a bad one in its own words; this is only what the form shows under the name as the
// address the org will have, so nobody is surprised by it after.
const NOT_A_SLUG_CHARACTER = /[^a-z0-9]+/g;
const LONGEST = 63;

/** "Clínica Norte" → "clinica-norte". Empty when nothing of the name survives. */
export function slugOf(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(NOT_A_SLUG_CHARACTER, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, LONGEST)
    .replace(/-+$/g, "");
}
