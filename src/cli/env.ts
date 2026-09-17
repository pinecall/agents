/** Where the CLI is pointed and what opens the door: the one place that decides both, for every verb. */

import { pinecallHome } from "./credentials.js";
import { chosenGateway, profileFor, theChosenProfile } from "./profiles.js";

/** Pinecall's own cloud: where every verb goes until `pinecall gateway <url>` says otherwise. */
export const CLOUD_URL = "https://box.pinecall.io";

/** The gateway a developer runs on their own machine: what `pinecall gateway` is for. */
export const OWN_BOX_URL = "http://localhost:8080";

/** Where the key came from, so a verb can say it and a person can check it without grepping. */
export type Source = "profile" | "none";

/** What the resolution found: the gateway, the key if there is one, and where the key came from. */
export interface Found {
  url: string;
  apiKey: string | undefined;
  source: Source;
}

/** A gateway with the key in hand: what a verb holds after `theDoor` answered. */
export interface Open {
  url: string;
  apiKey: string;
  source: Source;
}

/**
 * Which gateway and which key: one profile, and there is nothing else.
 *
 * There used to be four files and three variables answering these two questions, in an order
 * nobody was ever told — and the one that won was the one you had not chosen. `pinecall login`
 * kept a key, an export from another project beat it, and a verb registered into another org in
 * another world with every line reading exactly the same.
 *
 * Now: the profile `--profile` names, or the active one. `pinecall config` prints which. A
 * machine with no browser writes one off stdin — `pinecall login --key-stdin` — so a key is never
 * in an environment every child process and every `ps` can read. `PINECALL_HOME` says where the
 * file is, and that is the only variable this file knows about.
 */
export function doorFrom(
  env: NodeJS.ProcessEnv = process.env,
  home: string = pinecallHome(env),
  profile: string | undefined = theChosenProfile(),
): Found {
  const chosen = profileFor(profile, home);
  // No profile yet: the gateway is whichever this machine was pointed at, and the cloud until
  // somebody points it elsewhere. A localhost default sent every first verb at a box that is not
  // running, and the refusal read as the CLI being broken.
  if (chosen === undefined) return { url: chosenGateway(home) ?? CLOUD_URL, apiKey: undefined, source: "none" };
  return { url: chosen.url, apiKey: chosen.key, source: "profile" };
}

/** The gateway a verb knocks at, or nothing once it has said why it cannot: every verb's first act. */
export function theDoor(
  env: NodeJS.ProcessEnv = process.env,
  err: NodeJS.WritableStream = process.stderr,
): Open | undefined {
  const found = doorFrom(env);
  if (found.apiKey === undefined) {
    err.write(`${noKey(found.url)}\n`);
    return undefined;
  }
  return { url: found.url, apiKey: found.apiKey, source: found.source };
}

/** What to say when this machine holds no key: the verb that fixes it, and where it would go. */
export function noKey(url: string): string {
  return (
    `not signed in to ${url}: \`pinecall login\`, \`pinecall gateway <url>\` for another gateway,`
    + " or `pinecall use <profile>` for one already kept (`pinecall config` lists them)"
  );
}

/** The first line a verb that connects prints: which gateway, and where its key was found. */
export function doorLine(door: Open): string {
  return `gateway ${door.url} · key from ${door.source}`;
}
