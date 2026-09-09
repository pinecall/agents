/** This machine's browser: whether it has one to speak of, and how a URL is handed to it. */

import { spawn } from "node:child_process";

// One command per platform. Anything else is treated as a Linux with xdg-open, which is what a
// BSD or a container with a desktop most likely has.
const OPENERS: Record<string, string> = {
  darwin: "open",
  win32: "start",
  linux: "xdg-open",
};

/**
 * Why no page can open here, or null when one can. A talk page needs a microphone, and a
 * microphone is a browser's on a screen: over ssh there is no screen on this end, and a Linux
 * with no display has no browser to hand a URL to. Both are said before a token is minted.
 */
export function headless(env: NodeJS.ProcessEnv = process.env, platform: string = process.platform): string | null {
  if (env["SSH_CONNECTION"] !== undefined) return "this is an ssh session";
  if (platform === "linux" && env["DISPLAY"] === undefined && env["WAYLAND_DISPLAY"] === undefined) {
    return "no DISPLAY and no WAYLAND_DISPLAY";
  }
  return null;
}

/** Hand this URL to the browser and never wait for it: the URL is on screen either way. */
export function openInBrowser(url: string, platform: string = process.platform): void {
  const opener = OPENERS[platform] ?? OPENERS["linux"]!;
  const opened = spawn(opener, [url], { stdio: "ignore", detached: true, shell: platform === "win32" });
  opened.on("error", () => undefined);
  opened.unref();
}
