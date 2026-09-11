/** The ear as its own process: one room joined, both tracks mixed, raw PCM out on fd 3, nothing else said. */

import { writeSync } from "node:fs";

import { AudioMixer, AudioStream, Room, RoomEvent, TrackKind } from "@livekit/rtc-node";

// This file is a PROGRAM, started by cli/listening.ts and by nothing else. It exists because the
// room library is a native build with a logger that writes to the file descriptor, at debug, and
// is exported nowhere: kept in its own process, its three hundred lines of chatter go to a stdout
// nobody reads, its threads cannot hold the CLI open after the call, and the CLI's own environment
// is never touched to quiet it. The contract is small: the rate and the channel count on argv,
// one JSON line on stdin — `{server_url, participant_token}` — and int16 frames on fd 3 until
// stdin closes, which is the parent saying leave.
const PCM = 3;

/** One line of stdin: the seat. It stays open afterwards, because its closing is the way out. */
function theSeat(): Promise<{ server_url: string; participant_token: string }> {
  return new Promise((answer) => {
    let read = "";
    const take = (chunk: Buffer): void => {
      read += chunk.toString();
      const line = read.indexOf("\n");
      if (line === -1) return;
      process.stdin.off("data", take);
      answer(JSON.parse(read.slice(0, line)) as { server_url: string; participant_token: string });
    };
    process.stdin.on("data", take);
  });
}

async function listen(): Promise<void> {
  const [rate, channels] = process.argv.slice(2).map(Number);
  if (rate === undefined || channels === undefined) throw new Error("usage: ear <rate> <channels>");
  const seat = await theSeat();
  const room = new Room();
  const mixer = new AudioMixer(rate, channels);
  // Both sides of the call are one stream: the caller's track and the agent's, mixed, so the
  // speakers hear the conversation and not whichever track arrived first.
  room.on(RoomEvent.TrackSubscribed, (track) => {
    if (track.kind === TrackKind.KIND_AUDIO) mixer.addStream(new AudioStream(track, rate, channels));
  });
  const leaving = new Promise<void>((left) => {
    process.stdin.once("end", () => left());
    process.stdin.once("close", () => left());
    room.on(RoomEvent.Disconnected, () => left());
  });
  await room.connect(seat.server_url, seat.participant_token, { autoSubscribe: true, dynacast: false });
  void leaving.then(async () => {
    await mixer.aclose();
    await room.disconnect();
    process.exit(0);
  });
  for await (const frame of mixer) {
    writeSync(PCM, Buffer.from(frame.data.buffer, frame.data.byteOffset, frame.data.byteLength));
  }
}

listen().catch((failed: unknown) => {
  process.stderr.write(`${failed instanceof Error ? failed.message : String(failed)}\n`);
  process.exit(1);
});
