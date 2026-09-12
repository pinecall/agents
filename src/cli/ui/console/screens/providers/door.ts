/** The Providers screen's doors: which vendors this org brought of its own, one added, one given back. */

import { z } from "zod";

import { drop, put, read, type Credentials } from "../../../shared/api";

// This door answers vendor NAMES, and that is the whole of what a screen may know — not a value,
// not a prefix, not a fingerprint. The one door that reads a key back is the worker's, and a page
// is not a worker.
const BroughtSchema = z.object({ vendors: z.array(z.string()) });

/** The vendors this org runs on its own account. Every other vendor runs on the box's key. */
export async function readVendors(credentials: Credentials): Promise<string[]> {
  return BroughtSchema.parse(await read(credentials, "/v1/provider-keys")).vendors;
}

/** One key up. It is spent once, on this request, and nothing keeps it on the way. */
export async function addKey(credentials: Credentials, vendor: string, key: string): Promise<void> {
  await put(credentials, `/v1/provider-keys/${encodeURIComponent(vendor)}`, { key });
}

/** One vendor given back to the box's own key, from the next call. */
export async function removeKey(credentials: Credentials, vendor: string): Promise<void> {
  await drop(credentials, `/v1/provider-keys/${encodeURIComponent(vendor)}`);
}
