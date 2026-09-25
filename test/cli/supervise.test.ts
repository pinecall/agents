/** `pinecall supervise`: what a typed line means, and what a person at the desk is shown. */

import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { Readable } from "node:stream";

import { describe, expect, it } from "vitest";

import { ALREADY_ENDED, lineOf, moveOf, run } from "../../src/cli/supervise.js";
import { pointingAt } from "./home.js";

// A stream that keeps what was written, so a test reads the CLI's output as a string.
function collected(): { stream: NodeJS.WritableStream; text(): string } {
  const written: string[] = [];
  const stream = { write: (chunk: string) => written.push(chunk) } as unknown as NodeJS.WritableStream;
  return { stream, text: () => written.join("") };
}

describe("what a typed line means", () => {
  it("reads the five moves the desk has", () => {
    expect(moveOf("t")).toEqual({ verb: "takeover" });
    expect(moveOf("x")).toEqual({ verb: "release" });
    expect(moveOf("w no le has dicho el precio")).toEqual({ verb: "whisper", text: "no le has dicho el precio" });
    expect(moveOf("s Le paso con recepción.")).toEqual({ verb: "say", text: "Le paso con recepción." });
    expect(moveOf("e el paciente colgó")).toEqual({ verb: "end", reason: "el paciente colgó" });
  });

  it("ends a call with no reason when nobody gave one", () => {
    expect(moveOf("e")).toEqual({ verb: "end", reason: undefined });
  });

  it("keeps the whole sentence, spaces and all, and not just the first word", () => {
    expect(moveOf("w dile que la doctora Vidal no pasa consulta el jueves")).toEqual({
      verb: "whisper",
      text: "dile que la doctora Vidal no pasa consulta el jueves",
    });
  });

  // A `w` with nothing after it is a person who pressed enter early, not a whisper of "".
  it("refuses a whisper and a say with nothing to said", () => {
    expect(moveOf("w")).toBeNull();
    expect(moveOf("s")).toBeNull();
  });

  it("q leaves the desk and is not a verb anybody is sent", () => {
    expect(moveOf("q")).toBe("leave");
  });

  it("says nothing at all about a line nobody meant", () => {
    expect(moveOf("hola")).toBeNull();
    expect(moveOf("")).toBeNull();
  });
});

describe("what the desk is shown", () => {
  it("prints both speakers with the seq the entry landed under", () => {
    expect(lineOf(12, "turn.user", { text: "¿Tenéis algo el martes?" })).toBe("  12  caller  ¿Tenéis algo el martes?");
    expect(lineOf(13, "turn.agent", { text: "Sí, a las nueve." })).toBe("  13  agent   Sí, a las nueve.");
  });

  it("prints every move a human made, by the name the log gave it", () => {
    expect(lineOf(20, "supervisor.whispered", { text: "el precio" })).toBe("  20  desk    whispered el precio");
    expect(lineOf(21, "supervisor.took_over", {})).toBe("  21  desk    took_over");
  });

  it("prints the end and why", () => {
    expect(lineOf(30, "call.ended", { reason: "agent_hung_up" })).toBe("  30  ——      ended: agent_hung_up");
  });

  // The desk is the conversation. A metric or a prompt change is in the log and not on this screen.
  it("prints nothing a supervisor cannot act on", () => {
    expect(lineOf(4, "metrics.llm", { ttft: 0.3 })).toBeNull();
    expect(lineOf(5, "prompt.changed", { name: "view" })).toBeNull();
  });
});

describe("the verb itself", () => {
  it("says what it needs when nobody named a call", async () => {
    const err = collected();

    expect(await run([], { err: err.stream, out: collected().stream })).toBe(2);
    expect(err.text()).toContain("usage: pinecall supervise <call>");
  });

  // The desk used to open on anything: an id with a typo in it, or a call that ended hours ago,
  // printed a prompt over an empty transcript and took moves nobody could land (2026-09-20).
  it("refuses a desk on a call that has already ended, and says where to read it", async () => {
    const gateway = await aGatewayWhereTheCall({ live: false, last_seq: 58 });
    const err = collected();

    const code = await run(["call_over"], { err: err.stream, out: collected().stream, env: gateway.env });

    expect(code).toBe(2);
    expect(err.text()).toContain(ALREADY_ENDED("call_over"));
    await gateway.close();
  });

  // Piped in — `printf 't\nq\n' | pinecall supervise <call>` — the desk used to send its moves
  // and then throw ERR_USE_AFTER_CLOSE: the transcript kept drawing a prompt on an interface the
  // keyboard had already closed, and the process died on a call it had just taken the line on.
  it("takes its moves from a pipe, sends them, and leaves without a word of its own", async () => {
    const desk = await aDeskWhereTheCallIsLive();
    const out = collected();

    const code = await run(["call_live"], {
      out: out.stream,
      err: collected().stream,
      env: desk.env,
      input: Readable.from(["t\n", "s Buenos días.\n", "q\n"]),
    });

    expect(code).toBe(0);
    expect(desk.verbs).toEqual([{ verb: "takeover" }, { verb: "say", text: "Buenos días." }]);
    // The transcript still prints; what a pipe never gets is the prompt drawn for a keyboard.
    expect(out.text()).toContain("¿Tenéis algo el martes?");
    expect(out.text()).not.toContain(">");
    await desk.close();
  });

  it("refuses a desk on a call this gateway never wrote", async () => {
    const gateway = await aGatewayWhereTheCall(null);
    const err = collected();

    await expect(run(["CA_typo"], { err: err.stream, out: collected().stream, env: gateway.env })).rejects.toThrow(
      "no call CA_typo on this gateway",
    );
    await gateway.close();
  });
});

/** A gateway a desk can really sit at: the call is live, the transcript never ends, verbs land. */
async function aDeskWhereTheCallIsLive(): Promise<{
  env: NodeJS.ProcessEnv;
  verbs: unknown[];
  close(): Promise<void>;
}> {
  const verbs: unknown[] = [];
  const anEntry = {
    seq: 13,
    ts: 1790000000,
    call: "call_live",
    agent: "clinica-norte",
    type: "turn.user",
    ephemeral: false,
    data: { speech_id: "sp_1", text: "¿Tenéis algo el martes?", metrics: {} },
  };
  const server = createServer((request, response) => {
    if (request.url?.endsWith("/verbs") === true) {
      const body: Buffer[] = [];
      request.on("data", (chunk: Buffer) => body.push(chunk));
      request.on("end", () => {
        verbs.push(JSON.parse(Buffer.concat(body).toString()));
        response.writeHead(202, { "content-type": "application/json" });
        response.end("{}");
      });
      return;
    }
    if (request.headers.accept === "text/event-stream") {
      // One turn, then open for as long as the call lasts. The desk leaves it — it is never the
      // stream that ends this — which is the hang this test exists to catch.
      response.writeHead(200, { "content-type": "text/event-stream" });
      response.write(`data: ${JSON.stringify(anEntry)}\n\n`);
      return;
    }
    response.writeHead(200, { "content-type": "application/json" });
    response.end(JSON.stringify({ live: true, last_seq: 12 }));
  });
  await new Promise<void>((bound) => server.listen(0, "127.0.0.1", bound));
  const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  return {
    env: pointingAt(url, "pc_test_a_key"),
    verbs,
    close: async () => {
      server.closeAllConnections();
      await new Promise<void>((closed) => server.close(() => closed()));
    },
  };
}

/** A gateway whose `/state` door answers with that standing, or 404 when there is none. */
async function aGatewayWhereTheCall(standing: { live: boolean; last_seq: number } | null): Promise<{
  env: NodeJS.ProcessEnv;
  close(): Promise<void>;
}> {
  const server = createServer((_request, response) => {
    response.writeHead(standing === null ? 404 : 200, { "content-type": "application/json" });
    response.end(JSON.stringify(standing ?? { detail: "no log for call" }));
  });
  await new Promise<void>((bound) => server.listen(0, "127.0.0.1", bound));
  const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  return {
    env: pointingAt(url, "pc_test_a_key"),
    close: async () => {
      server.closeAllConnections();
      await new Promise<void>((closed) => server.close(() => closed()));
    },
  };
}
