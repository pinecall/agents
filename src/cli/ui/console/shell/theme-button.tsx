/** The top bar's sun or moon: flips the console between daylight and dark, and shows the theme it would go to. */

import { useSyncExternalStore, type ReactNode } from "react";

import { currentTheme, toggleTheme, watchTheme } from "../../shared/theme";
import { Icon } from "../ui";

export function ThemeButton(): ReactNode {
  // Read from the document and not held in state: the system may change the theme under the button.
  const theme = useSyncExternalStore(watchTheme, currentTheme);
  const goingTo = theme === "dark" ? "light" : "dark";
  return (
    <button type="button" className="top-theme" onClick={() => toggleTheme()} aria-label={`Switch to the ${goingTo} theme`} title={`${goingTo === "dark" ? "Dark" : "Light"} theme`}>
      <Icon name={goingTo === "dark" ? "moon" : "sun"} />
    </button>
  );
}
