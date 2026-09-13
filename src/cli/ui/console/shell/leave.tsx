/** Sign out: the way back to the login, beside whose console this is. */

import type { ReactNode } from "react";

import { useLeaving } from "../lib/leaving";

/**
 * There was no way out at all until this. A key is this tab's and dies with it, so closing the tab
 * was the only way to stop being signed in — which is not something a person should have to know,
 * and is no use at all to somebody who wants to come back as somebody else.
 */
export function Leave(): ReactNode {
  const leaving = useLeaving();
  return (
    <button type="button" className="head-leave" onClick={leaving} title="sign out of this console">
      sign out
    </button>
  );
}
