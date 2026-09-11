// The console's chat door: which class it is for, one call at a time, and what it refuses.

import { describe, expect, it } from "vitest";

import { chattingFrom, type Line, type Lines } from "../../../src/cli/ui/chatting.js";
import { Refused } from "../../../src/cli/ui/refused.js";

const DOOR = { url: "http://127.0.0.1:1", apiKey: "pk_never_sent_anywhere" };

function quiet(): NodeJS.WritableStream {
  return { write: () => true } as unknown as NodeJS.WritableStream;
}

/** A terminal that opens a call by id and remembers every turn and hangup it was handed. */
function aTerminal(): { said: string[]; ended: string[]; asked: (string | undefined)[]; lines: Lines } {
  const said: string[] = [];
  const ended: string[] = [];
  const asked: (string | undefined)[] = [];
  let opened = 0;
  return {
    said,
    ended,
    asked,
    lines: {
      open: async (contact) => {
        asked.push(contact);
        opened += 1;
        const call = `call_${opened}`;
        const line: Line = { call, say: (text) => said.push(`${call}: ${text}`), end: () => ended.push(call) };
        return line;
      },
      close: async () => {
        ended.push("closed");
      },
    },
  };
}

describe("which class this console chats with", () => {
  it("names the class of the directory `pinecall ui` runs in", async () => {
    const door = chattingFrom(DOOR, "clinica-norte", quiet(), aTerminal().lines);
    expect(await door.roster()).toEqual({ agent: "clinica-norte" });
  });

  it("refuses another agent: the class mounted here is this directory's", async () => {
    const door = chattingFrom(DOOR, "clinica-norte", quiet(), aTerminal().lines);
    await expect(door.start({ agent: "tienda-sur" })).rejects.toBeInstanceOf(Refused);
    await expect(door.start({ agent: "tienda-sur" })).rejects.toMatchObject({ status: 409 });
  });
});

describe("one written call", () => {
  it("opens it, files it under the contact the page named, and carries every turn down it", async () => {
    const terminal = aTerminal();
    const door = chattingFrom(DOOR, "clinica-norte", quiet(), terminal.lines);

    const opened = await door.start({ agent: "clinica-norte", as: "+34600111222" });
    await door.say({ call: opened.call, text: "quiero cambiar la cita" });

    expect(opened).toEqual({ call: "call_1" });
    expect(terminal.asked).toEqual(["+34600111222"]);
    expect(terminal.said).toEqual(["call_1: quiero cambiar la cita"]);
  });

  it("keeps two conversations apart, and each turn goes down its own socket", async () => {
    const terminal = aTerminal();
    const door = chattingFrom(DOOR, "clinica-norte", quiet(), terminal.lines);

    const first = await door.start({ agent: "clinica-norte" });
    const second = await door.start({ agent: "clinica-norte" });
    await door.say({ call: second.call, text: "hola" });
    await door.say({ call: first.call, text: "buenas" });

    expect(terminal.said).toEqual(["call_2: hola", "call_1: buenas"]);
  });

  it("hangs up, and then that call is not one this console holds any more", async () => {
    const terminal = aTerminal();
    const door = chattingFrom(DOOR, "clinica-norte", quiet(), terminal.lines);

    const opened = await door.start({ agent: "clinica-norte" });
    await door.end({ call: opened.call });

    expect(terminal.ended).toEqual(["call_1"]);
    await expect(door.say({ call: opened.call, text: "¿hola?" })).rejects.toMatchObject({ status: 404 });
  });

  it("refuses a call nobody here opened, and a body that is not what the page sends", async () => {
    const door = chattingFrom(DOOR, "clinica-norte", quiet(), aTerminal().lines);
    await expect(door.say({ call: "call_elsewhere", text: "hola" })).rejects.toMatchObject({ status: 404 });
    await expect(door.say({ call: "call_elsewhere" })).rejects.toMatchObject({ status: 422 });
    await expect(door.start({ agent: 3 })).rejects.toMatchObject({ status: 422 });
  });

  // Ctrl-C in the terminal that typed `ui` is the end of every conversation it was holding: a
  // socket left open would be a call the gateway still believes somebody is serving.
  it("ends every call it holds when the console closes", async () => {
    const terminal = aTerminal();
    const door = chattingFrom(DOOR, "clinica-norte", quiet(), terminal.lines);

    await door.start({ agent: "clinica-norte" });
    await door.start({ agent: "clinica-norte" });
    await door.close();

    expect(terminal.ended).toEqual(["call_1", "call_2", "closed"]);
  });
});
