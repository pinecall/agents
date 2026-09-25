/** The audio players a machine might have, and the first one on this shell's PATH. */

import { existsSync } from "node:fs";
import { delimiter, join } from "node:path";

/**
 * One player, in the order they are tried: how it takes raw 16-bit PCM on stdin (`--listen`, which
 * pipes a room's samples), and how it takes a file (`voices play`, which has a WAV). `afplay`
 * opens files and nothing else, so it has no raw form.
 */
export interface Player {
  name: string;
  raw: ((rate: number, channels: number) => string[]) | null;
  file: string[];
}

export const PLAYERS: readonly Player[] = [
  { name: "afplay", raw: null, file: [] },
  {
    name: "ffplay",
    raw: (rate, channels) => ["-hide_banner", "-loglevel", "error", "-nodisp", "-autoexit", "-f", "s16le", "-ar", String(rate), "-ac", String(channels), "-i", "-"],
    file: ["-hide_banner", "-loglevel", "error", "-nodisp", "-autoexit"],
  },
  { name: "play", raw: (rate, channels) => ["-q", "-t", "raw", "-r", String(rate), "-e", "signed", "-b", "16", "-c", String(channels), "-"], file: ["-q"] },
  { name: "aplay", raw: (rate, channels) => ["-q", "-f", "S16_LE", "-r", String(rate), "-c", String(channels), "-"], file: ["-q"] },
  { name: "pw-play", raw: (rate, channels) => [`--format=s16`, `--rate=${rate}`, `--channels=${channels}`, "-"], file: [] },
];

/** The first of these players that is on the PATH and can play this way, or null. */
export function aPlayerFor(way: "raw" | "file"): Player | null {
  return PLAYERS.find((one) => (way === "file" || one.raw !== null) && onThePath(one.name)) ?? null;
}

/** Is this program on this shell's PATH? Asked without starting anything to find out. */
export function onThePath(name: string): boolean {
  // An empty segment in PATH would read as the cwd, and a file called `play` there is not a player.
  return (process.env["PATH"] ?? "").split(delimiter).some((where) => where !== "" && existsSync(join(where, name)));
}
