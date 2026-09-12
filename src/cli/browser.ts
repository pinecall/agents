/** Opening a URL in whatever this machine calls a browser, and saying so when it has none. */

import { spawn } from "node:child_process";

// One command per platform, and nothing clever: `open` is macOS's, `xdg-open` is the freedesktop
// standard every Linux desktop implements, and `start` is cmd's built-in — which is why Windows
// needs a shell to run it and the other two do not.
const OPENERS: Record<string, [string, string[]]> = {
  darwin: ["open", []],
  win32: ["cmd", ["/c", "start", ""]],
};
const ELSEWHERE: [string, string[]] = ["xdg-open", []];

/**
 * Try to put this URL in front of the person. Whether it worked is not knowable and does not
 * matter: the URL is printed either way, and a terminal on a server with no browser — over SSH,
 * in a container — is the case this flow exists to serve. The person opens it wherever they are.
 */
export function openInABrowser(url: string, platform: string = process.platform): void {
  const [command, args] = OPENERS[platform] ?? ELSEWHERE;
  try {
    // Detached and with both ends of its output thrown away: a browser that writes to stderr must
    // not land in the middle of the terminal's own lines, and this process must not wait for it.
    spawn(command, [...args, url], { detached: true, stdio: "ignore" }).unref();
  } catch {
    // A machine with no such command is a machine where the printed URL is the whole answer.
  }
}
