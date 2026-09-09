// The hook on a page: renders when the part it asked for moved, and not otherwise; a widget's cart from the snapshot alone.

import { RoomEvent, type Room } from "livekit-client";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { useCallState, type PublicState } from "../src/index.js";
import { cartChanged, ScriptedSource, userSaid } from "./script.js";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root;
let mount: HTMLDivElement;

beforeEach(() => {
  mount = document.createElement("div");
  root = createRoot(mount);
});

afterEach(() => {
  act(() => root.unmount());
});

describe("useCallState with a selector", () => {
  it("renders once for a cart change and not at all for a turn the caller took", () => {
    const source = new ScriptedSource();
    let renders = 0;
    function Cart(): React.JSX.Element {
      const cart = useCallState(source, (state) => state.app_state["cart"] as string[] | undefined);
      renders += 1;
      return <ul>{(cart ?? []).map((item) => <li key={item}>{item}</li>)}</ul>;
    }
    act(() => root.render(<Cart />));
    const mounted = renders;

    act(() => source.push(cartChanged(1, ["pan"])));
    expect(renders).toBe(mounted + 1);
    expect(mount.textContent).toBe("pan");

    act(() => source.push(userSaid(2, "y leche")));
    expect(renders).toBe(mounted + 1);

    act(() => source.push(cartChanged(3, ["pan", "leche"])));
    expect(renders).toBe(mounted + 2);
    expect(mount.textContent).toBe("panleche");
  });

  it("hands the whole state to a hook that asks for nothing in particular", () => {
    const source = new ScriptedSource();
    let seen: PublicState | null = null;
    function Whole(): null {
      seen = useCallState(source);
      return null;
    }
    act(() => root.render(<Whole />));
    act(() => source.push(userSaid(1, "hola")));
    expect(seen).not.toBeNull();
    expect((seen as unknown as PublicState).turns.map((turn) => turn.text)).toEqual(["hola"]);
  });
});

describe("two components on one call", () => {
  it("share one wire, and unmounting the page closes it", () => {
    const source = new ScriptedSource();
    function Status(): React.JSX.Element {
      return <span>{useCallState(source, (state) => state.status)}</span>;
    }
    function Turns(): React.JSX.Element {
      return <span>{useCallState(source, (state) => state.turns.length)}</span>;
    }
    act(() =>
      root.render(
        <>
          <Status />
          <Turns />
        </>,
      ),
    );
    expect(source.opened).toBe(1);
    act(() => source.push(userSaid(1, "hola")));
    expect(mount.textContent).toBe("idle1");
    act(() => root.unmount());
    expect(source.closed).toBe(1);
  });
});

// A room with nothing in it but what this widget needs of livekit's: the two events it listens
// for and the one it publishes on.
function aRoom(): Room & { say(topic: string, said: unknown): void } {
  const listeners = new Map<string, Set<(...args: unknown[]) => void>>();
  const on = (event: string, listener: (...args: unknown[]) => void): unknown => {
    listeners.set(event, (listeners.get(event) ?? new Set()).add(listener));
    return room;
  };
  const off = (event: string, listener: (...args: unknown[]) => void): unknown => {
    listeners.get(event)?.delete(listener);
    return room;
  };
  const room = {
    on,
    off,
    state: "connected",
    localParticipant: { publishData: (): Promise<void> => Promise.resolve() },
    say(topic: string, said: unknown): void {
      const payload = new TextEncoder().encode(JSON.stringify(said));
      for (const listener of listeners.get(RoomEvent.DataReceived) ?? []) {
        listener(payload, undefined, undefined, topic);
      }
    },
  };
  return room as unknown as Room & { say(topic: string, said: unknown): void };
}

describe("a plain page with the widget", () => {
  it("shows the cart from pinecall.snapshot before any entry arrives", () => {
    const room = aRoom();
    function Cart(): React.JSX.Element {
      const cart = useCallState({ room }, (state) => state.app_state["cart"] as string[] | undefined);
      return <ul>{(cart ?? []).map((item) => <li key={item}>{item}</li>)}</ul>;
    }
    act(() => root.render(<Cart />));
    expect(mount.textContent).toBe("");

    act(() => room.say("pinecall.snapshot", { state: { app_state: { cart: ["pan", "leche"] }, status: "active" }, last_seq: 12 }));
    expect(mount.textContent).toBe("panleche");

    act(() => room.say("pinecall.log", { seq: 13, ts: 13, type: "state.changed", ephemeral: false, data: { state: { cart: ["pan"] }, changed: ["cart"] } }));
    expect(mount.textContent).toBe("pan");
  });
});
