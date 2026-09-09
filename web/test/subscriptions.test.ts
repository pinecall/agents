// One wire per call: opened by the first hook, shared, and closed when the last one leaves.

import { afterEach, describe, expect, it, vi } from "vitest";

import { listen, stateOf } from "../src/subscriptions.js";
import { cartChanged, entry, ScriptedSource } from "./script.js";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("two listeners on one call", () => {
  it("open one source, and the second to leave is the one that closes it", () => {
    const source = new ScriptedSource();
    const heard: string[] = [];
    const stopFirst = listen(source, () => heard.push("first"));
    const stopSecond = listen(source, () => heard.push("second"));
    expect(source.opened).toBe(1);

    source.push(cartChanged(1, ["a"]));
    expect(heard).toEqual(["first", "second"]);
    expect(stateOf(source).app_state["cart"]).toEqual(["a"]);

    stopFirst();
    expect(source.closed).toBe(0);
    stopSecond();
    expect(source.closed).toBe(1);
  });

  it("leave nothing behind: the call reads as one nobody has heard of", () => {
    const source = new ScriptedSource();
    const stop = listen(source, () => undefined);
    source.push(cartChanged(1, ["a"]));
    stop();
    expect(stateOf(source)).toBe(stateOf(new ScriptedSource()));
    expect(stateOf(source).seq).toBe(0);
  });

  it("open the source again when somebody listens after everybody left", () => {
    const source = new ScriptedSource();
    listen(source, () => undefined)();
    const stop = listen(source, () => undefined);
    expect(source.opened).toBe(2);
    stop();
  });
});

describe("the wire", () => {
  it("is let go at the terminal entry, and the state stays for whoever still reads", () => {
    const source = new ScriptedSource();
    const stop = listen(source, () => undefined);
    source.push(cartChanged(1, ["a"]));
    source.push(entry(2, "call.score", { judges: [], judge_calls: 0 }));
    expect(source.closed).toBe(1);
    expect(stateOf(source).app_state["cart"]).toEqual(["a"]);
    stop();
    expect(source.closed).toBe(1);
  });

  it("is let go when the source says it closed, once", () => {
    const source = new ScriptedSource();
    const stop = listen(source, () => undefined);
    source.end();
    expect(source.closed).toBe(1);
    stop();
    expect(source.closed).toBe(1);
  });

  it("asks the source for a replay when the fold sees a gap", () => {
    const source = new ScriptedSource();
    const stop = listen(source, () => undefined);
    source.push(cartChanged(1, ["a"]), cartChanged(3, ["b"]));
    expect(source.replays).toEqual([1]);
    stop();
  });

  it("warns about a frame the protocol refused and goes on", () => {
    const warned = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const source = new ScriptedSource();
    const stop = listen(source, () => undefined);
    source.push(entry(1, "call.started", { channel: "web" }), cartChanged(2, ["a"]));
    expect(warned).toHaveBeenCalledOnce();
    expect(stateOf(source).app_state["cart"]).toEqual(["a"]);
    stop();
  });
});
