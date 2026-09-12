/** Where this console is mounted: the root of the gateway that serves it. */

// The gateway serves the built page at `/` and answers every non-API path with it, so a deep link
// (`/a/clinica-norte/talk`) lands on the router and the assets are addressed from the root. One
// constant, handed to the router and to every door as the one prefix they share.
export const BASE = "/";
