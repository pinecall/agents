/** A page follows the system's light or dark, and a person may flip it for as long as the tab lives. */

export type Theme = "dark" | "light";

/** Stamp the system's theme on the document and keep it in step for as long as the page is open. */
export function followTheSystemTheme(): void {
  const light = window.matchMedia("(prefers-color-scheme: light)");
  const stamp = (): void => {
    document.documentElement.dataset["theme"] = light.matches ? "light" : "dark";
  };
  stamp();
  // Never unsubscribed: it lives exactly as long as the document it is stamping.
  light.addEventListener("change", stamp);
}

/** The theme the document wears right now. */
export function currentTheme(): Theme {
  return document.documentElement.dataset["theme"] === "light" ? "light" : "dark";
}

// Remembered nowhere: a page writes nothing into a browser's storage for this, so a flip lasts until
// the tab closes or the system's own theme changes, and then the system has its say again.
/** Flip the theme, and say which one it is now. */
export function toggleTheme(): Theme {
  const next: Theme = currentTheme() === "dark" ? "light" : "dark";
  document.documentElement.dataset["theme"] = next;
  return next;
}
