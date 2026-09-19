/** A page follows the system's light or dark; a person may flip it, and the flip is kept until the system changes its mind. */

export type Theme = "dark" | "light";

// What a flip keeps: the theme chosen, and the system's theme at the moment of choosing. The
// second is how a page opened tomorrow knows the system changed while it was closed.
interface Kept {
  theme: Theme;
  systemWas: Theme;
}

const KEPT_UNDER = "pinecall.theme";

const SYSTEM_LIGHT = "(prefers-color-scheme: light)";

/** The theme the system asks for right now. */
function systemTheme(): Theme {
  return window.matchMedia(SYSTEM_LIGHT).matches ? "light" : "dark";
}

function stamp(theme: Theme): void {
  document.documentElement.dataset["theme"] = theme;
}

function isTheme(value: unknown): value is Theme {
  return value === "dark" || value === "light";
}

// Storage is a nicety here: a browser that refuses it (a private window, site data blocked) gets a
// page that follows the system and a flip that lasts as long as the tab.
/** The flip this browser kept, while the system still says what it said when the person flipped. */
function keptTheme(): Theme | null {
  let kept: Partial<Kept> | null = null;
  try {
    kept = JSON.parse(window.localStorage.getItem(KEPT_UNDER) ?? "null") as Partial<Kept> | null;
  } catch {
    return null;
  }
  if (kept === null || !isTheme(kept.theme) || kept.systemWas !== systemTheme()) {
    forgetTheme();
    return null;
  }
  return kept.theme;
}

function keepTheme(kept: Kept): void {
  try {
    window.localStorage.setItem(KEPT_UNDER, JSON.stringify(kept));
  } catch {
    // Not kept: the flip lasts as long as the tab.
  }
}

function forgetTheme(): void {
  try {
    window.localStorage.removeItem(KEPT_UNDER);
  } catch {
    // Nothing was kept to forget.
  }
}

/**
 * Stamp the kept flip, or else the system's theme, on the document, and keep it in step: when the
 * system changes, the system wins and the flip is forgotten.
 */
export function followTheSystemTheme(): void {
  stamp(keptTheme() ?? systemTheme());
  // Never unsubscribed: it lives exactly as long as the document it is stamping.
  window.matchMedia(SYSTEM_LIGHT).addEventListener("change", () => {
    forgetTheme();
    stamp(systemTheme());
  });
}

/** The theme the document wears right now. */
export function currentTheme(): Theme {
  return document.documentElement.dataset["theme"] === "light" ? "light" : "dark";
}

/** Flip the theme, keep the flip, and say which one it is now. A flip back to the system's is no flip to keep. */
export function toggleTheme(): Theme {
  const next: Theme = currentTheme() === "dark" ? "light" : "dark";
  const system = systemTheme();
  if (next === system) forgetTheme();
  else keepTheme({ theme: next, systemWas: system });
  stamp(next);
  return next;
}

/** Call back whenever the document's theme changes, whoever changed it; returns the way to stop. */
export function watchTheme(changed: () => void): () => void {
  const watching = new MutationObserver(changed);
  watching.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  return () => watching.disconnect();
}
