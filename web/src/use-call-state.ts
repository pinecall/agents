// useCallState: what the agent knows of this call, on the page, re-rendered only when the part asked for moved.

import { useMemo } from "react";
import { useSyncExternalStoreWithSelector } from "use-sync-external-store/with-selector";

import type { PublicState } from "./source.js";
import { keyOf, listen, stateOf, type CallInput } from "./subscriptions.js";

const whole = (state: PublicState): PublicState => state;

/**
 * The call's public state, or the part of it `select` picks. One subscription per call, shared by
 * every hook on the page; the component renders again only when its selection changed by value.
 */
export function useCallState<Selected = PublicState>(
  call: CallInput,
  select: (state: PublicState) => Selected = whole as (state: PublicState) => Selected,
): Selected {
  const key = keyOf(call);
  // The subscription is keyed on what names the call, not on the object that arrived this render:
  // `{ room }` written inline is a new literal every time and must not reopen the wire.
  const store = useMemo(
    () => ({
      subscribe: (onChange: () => void) => listen(call, onChange),
      snapshot: () => stateOf(call),
    }),
    // `key` stands for `call` in these deps, by design.
    [key],
  );
  return useSyncExternalStoreWithSelector(store.subscribe, store.snapshot, store.snapshot, select, sameValue);
}

// The fold hands out a fresh state on every entry, so a selection is compared by what it says,
// not by which object says it: a cart that did not change is the same cart.
function sameValue<T>(a: T, b: T): boolean {
  return a === b || JSON.stringify(a) === JSON.stringify(b);
}
