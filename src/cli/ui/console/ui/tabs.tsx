/** A page's tabs: an underlined row of names, the one showing marked in the accent. */

import type { ReactNode } from "react";

export interface TabItem<T extends string> {
  tab: T;
  name: string;
  /** Drawn after the name: a dot, a count. */
  mark?: ReactNode | undefined;
}

/** The row. Which tab is showing is the screen's to keep — in the address, so a link lands on it. */
export function Tabs<T extends string>({
  label,
  tabs,
  on,
  onPick,
}: {
  label: string;
  tabs: readonly TabItem<T>[];
  on: T;
  onPick: (tab: T) => void;
}): ReactNode {
  return (
    <nav className="ui-tabs" aria-label={label}>
      {tabs.map((one) => (
        <button
          key={one.tab}
          type="button"
          className={on === one.tab ? "ui-tab ui-tab-on" : "ui-tab"}
          aria-current={on === one.tab ? "page" : undefined}
          onClick={() => onPick(one.tab)}
        >
          {one.name}
          {one.mark}
        </button>
      ))}
    </nav>
  );
}
