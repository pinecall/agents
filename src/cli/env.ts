/** Where the CLI is pointed and what opens the door: the one place that decides both, for every verb. */

import { pinecallHome } from "./credentials.js";
import { choose, chosenGateway, readConfig, theChosenProfile, theChosenWorld, type ProjectOrg, type World } from "./profiles.js";

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
  /** The package.json that chose the profile, when one did: printed, so nobody wonders why. */
  project?: ProjectOrg;
  /** The profile's name, when a project chose it. */
  profile?: string;
  /** `production` when `--prod` asked for that world's key for this one command. */
  world?: World;
}

/** A gateway with the key in hand: what a verb holds after `theDoor` answered. */
export interface Open {
  url: string;
  apiKey: string;
  source: Source;
  project?: ProjectOrg;
  profile?: string;
  world?: World;
}

/**
 * Which gateway and which key: one profile, and there is nothing else.
 *
 * There used to be four files and three variables answering these two questions, in an order
 * nobody was ever told — and the one that won was the one you had not chosen. `pinecall login`
 * kept a key, an export from another project beat it, and a verb registered into another org in
 * another world with every line reading exactly the same.
 *
 * Now: the profile `--profile` names; else, inside a project whose package.json says
 * `"pinecall": { "org": "<slug>" }`, that org's profile; else the active one. `pinecall config`
 * prints which. A
 * machine with no browser writes one off stdin — `pinecall login --key-stdin` — so a key is never
 * in an environment every child process and every `ps` can read. `PINECALL_HOME` says where the
 * file is, and that is the only variable this file knows about.
 */
export function doorFrom(
  env: NodeJS.ProcessEnv = process.env,
  home: string = pinecallHome(env),
  profile: string | undefined = theChosenProfile(),
  from: string = process.cwd(),
  world: World | undefined = theChosenWorld(),
): Found {
  const config = readConfig(home);
  const choice = choose(profile, config, from);
  const held = choice.name === undefined ? undefined : config.profiles[choice.name];
  // `--prod` takes the production key the login kept beside the sandbox one, for this command
  // only: the profile's key in hand is not touched, so the next command is in the sandbox again.
  const chosen = held === undefined || world === undefined ? held : { ...held, key: keyIn(held, world) };
  // A project that names an org this machine holds no profile of is refused, never handed the
  // active profile: that one is another org's, and running there is the accident this prevents.
  if (chosen === undefined && choice.project !== undefined) {
    return { url: chosenGateway(home) ?? CLOUD_URL, apiKey: undefined, source: "none", project: choice.project };
  }
  // No profile yet: the gateway is whichever this machine was pointed at, and the cloud until
  // somebody points it elsewhere. A localhost default sent every first verb at a box that is not
  // running, and the refusal read as the CLI being broken.
  if (chosen === undefined) return { url: chosenGateway(home) ?? CLOUD_URL, apiKey: undefined, source: "none" };
  const asked = world === undefined ? {} : { world, profile: choice.name! };
  if (choice.project !== undefined) {
    return { url: chosen.url, apiKey: chosen.key, source: "profile", project: choice.project, ...asked, profile: choice.name! };
  }
  return { url: chosen.url, apiKey: chosen.key, source: "profile", ...asked };
}

/** A profile's key in one world: the one the login kept, or the one in hand when it opens that world. */
function keyIn(profile: { key: string; keys?: Partial<Record<World, string>>; env?: string }, world: World): string {
  return profile.keys?.[world] ?? (profile.env === world ? profile.key : "");
}

/** The gateway a verb knocks at, or nothing once it has said why it cannot: every verb's first act. */
export function theDoor(
  env: NodeJS.ProcessEnv = process.env,
  err: NodeJS.WritableStream = process.stderr,
): Open | undefined {
  const found = doorFrom(env);
  if (found.apiKey === undefined) {
    err.write(`${found.project === undefined ? noKey(found.url) : notThisOrg(found.project)}\n`);
    return undefined;
  }
  if (found.apiKey === "") {
    err.write(`${noProductionKey(found.profile ?? "this profile")}\n`);
    return undefined;
  }
  const { apiKey, ...rest } = found;
  return { ...rest, apiKey };
}

/** What to say when this machine holds no key: the verb that fixes it, and where it would go. */
export function noKey(url: string): string {
  return (
    `not signed in to ${url}: \`pinecall login\`, \`pinecall gateway <url>\` for another gateway,`
    + " or `pinecall use <profile>` for one already kept (`pinecall config` lists them)"
  );
}

/** What to say when the project names an org this machine holds no profile of. */
export function notThisOrg(project: ProjectOrg): string {
  return (
    `this project is org ${project.org} (${project.file}), and this machine holds no profile of it:`
    + ` \`pinecall login\` as a member of ${project.org}, or \`--profile <name>\` for one already kept`
    + " (`pinecall config` lists them)"
  );
}

/** What to say when `--prod` asked a profile for a production key it does not hold. */
export function noProductionKey(profile: string): string {
  return `--prod asks for ${profile}'s production key, and it holds none: \`pinecall login\` again keeps both worlds' keys`;
}

/** The first line a verb that connects prints: which gateway, and where its key was found. */
export function doorLine(door: Open): string {
  const world = door.world === undefined ? "" : ` · ${door.world} (--prod)`;
  if (door.project !== undefined) {
    return `gateway ${door.url} · key from profile ${door.profile ?? door.project.org} · org ${door.project.org} from ${door.project.file}${world}`;
  }
  return `gateway ${door.url} · key from ${door.source}${world}`;
}
