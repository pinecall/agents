/** One door read when a screen mounts, re-read on demand, its refusal kept as the gateway's own sentence. */

import { useCallback, useEffect, useState } from "react";

import { GatewayError } from "../../../shared/api";

export interface Door<T> {
  /** Undefined until the door has answered. */
  value: T | undefined;
  refused: string | null;
  reread: () => Promise<void>;
}

/** `ask` must be stable (a useCallback): it is what the read is keyed on. */
export function useDoor<T>(ask: () => Promise<T>): Door<T> {
  const [value, setValue] = useState<T | undefined>(undefined);
  const [refused, setRefused] = useState<string | null>(null);

  const reread = useCallback(async (): Promise<void> => {
    try {
      setValue(await ask());
      setRefused(null);
    } catch (failed) {
      setRefused(saidBy(failed));
    }
  }, [ask]);

  useEffect(() => {
    let gone = false;
    ask().then(
      (answered) => {
        if (!gone) setValue(answered);
      },
      (failed: unknown) => {
        if (!gone) setRefused(saidBy(failed));
      },
    );
    return () => {
      gone = true;
    };
  }, [ask]);

  return { value, refused, reread };
}

/** A refusal as a person reads it: the gateway's sentence, verbatim. */
export function saidBy(failed: unknown): string {
  return failed instanceof GatewayError ? failed.message : failed instanceof Error ? failed.message : String(failed);
}

/** One write at a time: busy while it runs, the refusal kept where it happened. */
export function useMove(): { busy: boolean; refused: string | null; move: (what: () => Promise<void>) => Promise<boolean> } {
  const [busy, setBusy] = useState(false);
  const [refused, setRefused] = useState<string | null>(null);
  const move = useCallback(async (what: () => Promise<void>): Promise<boolean> => {
    setBusy(true);
    setRefused(null);
    try {
      await what();
      return true;
    } catch (failed) {
      setRefused(saidBy(failed));
      return false;
    } finally {
      setBusy(false);
    }
  }, []);
  return { busy, refused, move };
}
