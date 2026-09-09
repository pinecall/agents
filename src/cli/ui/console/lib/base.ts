/** Where this console is mounted: the first segment of the path `pinecall ui` opened it at. */

// The CLI serves the console under a random path and forwards the gateway's doors under the same
// one, so the base is a fact of the address bar and not a setting: read once, when the page
// loads, and handed to the router and to every door as the one prefix they share.
export const BASE = `/${window.location.pathname.split("/")[1] ?? ""}`;
