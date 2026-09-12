/** Where the operator's page is mounted: under `/admin`, on the gateway that serves it. */

// The console owns the root; this page owns one prefix below it, so the two never answer for each
// other's URLs. The doors it opens are the gateway's own and live at `/v1/ops/…`, which is why
// this constant is the page's mount and never a prefix for a request.
export const BASE = "/";

/** Where the router mounts, so a deep screen reloads onto itself rather than onto the console. */
export const MOUNTED_AT = "/admin";
