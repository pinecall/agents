/** The dev runtime: the same text factory under the name a dev-mode JSX transform imports. */

// One re-export and no second implementation: a dev build and a prod build of the same prompt
// must not be able to differ. `jsxDEV` is already an alias of `jsx` next door.
export * from "./jsx-runtime.js";
