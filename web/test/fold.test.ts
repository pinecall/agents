// The fold, alone: seq order out of whatever order the wire delivered, one replay per gap.

import { describe, expect, it } from "vitest";

import { Fold } from "../src/fold.js";
import { cartChanged, entry, userSaid } from "./script.js";

function aFold(): { fold: Fold; replays: number[]; refusals: string[] } {
  const replays: number[] = [];
  const refusals: string[] = [];
  const fold = new Fold(
    (after) => replays.push(after),
    (why) => refusals.push(why),
  );
  return { fold, replays, refusals };
}

describe("an entry that skips ahead", () => {
  it("is held, asks once for what lies between, and folds only when the gap is filled", () => {
    const { fold, replays } = aFold();
    fold.entry(cartChanged(1, ["a"]));
    fold.entry(userSaid(2, "hola"));
    fold.entry(cartChanged(5, ["a", "b"]));
    expect(replays).toEqual([2]);
    expect(fold.state.app_state["cart"]).toEqual(["a"]);
    expect(fold.state.seq).toBe(2);

    fold.entry(userSaid(6, "y otra"));
    expect(replays).toEqual([2]);

    fold.entry(userSaid(3, "quiero"));
    expect(fold.state.seq).toBe(3);
    expect(fold.state.app_state["cart"]).toEqual(["a"]);

    fold.entry(userSaid(4, "dos"));
    expect(fold.state.seq).toBe(6);
    expect(fold.state.app_state["cart"]).toEqual(["a", "b"]);
    expect(fold.state.turns.map((turn) => turn.text)).toEqual(["hola", "quiero", "dos", "y otra"]);
  });

  it("is folded when log.caught_up says what is still missing below it was never coming", () => {
    const { fold, replays } = aFold();
    fold.entry(cartChanged(1, ["a"]));
    fold.entry(cartChanged(4, ["a", "b"]));
    expect(replays).toEqual([1]);
    fold.entry(entry(4, "log.caught_up", { seq: 4 }));
    expect(fold.state.seq).toBe(4);
    expect(fold.state.app_state["cart"]).toEqual(["a", "b"]);
  });

  it("asks again after the replay closed, when a later gap opens", () => {
    const { fold, replays } = aFold();
    fold.entry(cartChanged(1, ["a"]));
    fold.entry(cartChanged(3, ["b"]));
    fold.entry(entry(3, "log.caught_up", { seq: 3 }));
    fold.entry(cartChanged(6, ["c"]));
    expect(replays).toEqual([1, 3]);
  });
});

describe("an entry already folded", () => {
  it("is ignored when a replay repeats it", () => {
    const { fold } = aFold();
    fold.entry(cartChanged(1, ["a"]));
    fold.entry(cartChanged(1, ["stale"]));
    expect(fold.state.app_state["cart"]).toEqual(["a"]);
  });
});

describe("a snapshot", () => {
  it("replaces the state and drops what was held at or below its seq", () => {
    const { fold, replays } = aFold();
    fold.entry(cartChanged(1, ["a"]));
    fold.entry(cartChanged(5, ["stale"]));
    fold.snapshot({ state: { app_state: { cart: ["x", "y"] }, status: "active" }, last_seq: 7 });
    expect(fold.state.seq).toBe(7);
    expect(fold.state.status).toBe("active");
    expect(fold.state.app_state["cart"]).toEqual(["x", "y"]);
    expect(fold.state.turns).toEqual([]);
    fold.entry(userSaid(8, "sigo"));
    expect(fold.state.turns).toHaveLength(1);
    expect(replays).toEqual([1]);
  });

  it("is ignored when it is older than what is already here", () => {
    const { fold } = aFold();
    fold.entry(cartChanged(1, ["a"]));
    fold.entry(cartChanged(2, ["a", "b"]));
    fold.snapshot({ state: { app_state: { cart: [] } }, last_seq: 1 });
    expect(fold.state.app_state["cart"]).toEqual(["a", "b"]);
  });

  it("arrives inside a log.gap too", () => {
    const { fold } = aFold();
    fold.entry(cartChanged(1, ["a"]));
    fold.entry(entry(9, "log.gap", { from_seq: 2, to_seq: 9, snapshot: { app_state: { cart: ["z"] } } }));
    expect(fold.state.seq).toBe(9);
    expect(fold.state.app_state["cart"]).toEqual(["z"]);
  });
});

describe("the state handed out", () => {
  it("is a new object each time it moves, and the old one is left as it was", () => {
    const { fold } = aFold();
    fold.entry(userSaid(1, "uno"));
    const before = fold.state;
    fold.entry(userSaid(2, "dos"));
    expect(fold.state).not.toBe(before);
    expect(before.turns).toHaveLength(1);
    expect(fold.state.turns).toHaveLength(2);
  });

  it("ends at the terminal entry", () => {
    const { fold, refusals } = aFold();
    expect(fold.ended).toBe(false);
    fold.entry(entry(1, "call.score", { judges: [], judge_calls: 0 }));
    expect(refusals).toEqual([]);
    expect(fold.ended).toBe(true);
  });
});

describe("an entry the protocol refuses", () => {
  it("is reported, moves the cursor, and folds nothing", () => {
    const { fold, refusals } = aFold();
    fold.entry(cartChanged(1, ["a"]));
    fold.entry(entry(2, "call.started", { channel: "web" }));
    expect(refusals).toHaveLength(1);
    expect(refusals[0]).toContain("seq 2 call.started");
    expect(fold.state.seq).toBe(2);
    expect(fold.state.status).toBe("idle");
  });
});
