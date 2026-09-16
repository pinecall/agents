/** The console starts here: the theme, the key this tab holds for the world it looks at — or the login, or an invitation — and the router. */

import { StrictMode, useCallback, useMemo, useState, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { RouterProvider } from "react-router";

import { onUnauthorized } from "../shared/api";
import { BASE } from "./lib/base";
import { CredentialsProvider } from "../shared/credentials";
import { loginToOrg, loginToWorld, loginWithCode, type Signed } from "./lib/login";
import { LeavingProvider } from "./lib/leaving";
import {
  forgetEveryKey,
  forgetKey,
  keepCorner,
  keepKey,
  keepWorld,
  keptCorner,
  keptKey,
  keptWorld,
  type World,
} from "./lib/session-key";
import { WhoamiProvider } from "./lib/whoami";
import { WorldProvider } from "./lib/world";
import { router } from "./router";
import { Accept, Login } from "./screens/login";
import { followTheSystemTheme } from "../shared/theme";
import "../shared/styles/app.css";

followTheSystemTheme();

const root = document.getElementById("root");
if (root === null) {
  throw new Error("index.html has no #root for the console to mount in");
}

// The query parameter `pinecall run` prints: a one-use code standing for that process's key, spent
// here for a key of this tab's own and taken out of the address bar before anything renders, so a
// reload, a bookmark or a screenshot never carries it.
const LOGIN = "login";

// The path an invitation link opens: /invitations/<token>. The token stays in the URL until it is
// spent — it is one use and dies in a week on its own, and a person may need to reload the card —
// and is taken out the moment it has bought a key.
const INVITATIONS = /^\/invitations\/([^/]+)\/?$/;

/** The token in the address, when this tab was opened from an invitation link. */
function theInvitationInTheAddress(): string | null {
  const found = INVITATIONS.exec(window.location.pathname);
  return found === null ? null : decodeURIComponent(found[1] ?? "");
}

/** What the tab starts as: the world it looks at, and the key it holds for it, if any. */
interface Start {
  world: World;
  key: string | null;
}

/** The key this tab starts with: spent from `?login=` (which also names the world), or kept. */
async function theKeyToStartWith(): Promise<Start> {
  const address = new URL(window.location.href);
  const code = address.searchParams.get(LOGIN);
  if (code !== null) {
    address.searchParams.delete(LOGIN);
    window.history.replaceState(null, "", address.toString());
    try {
      const signed = await loginWithCode(BASE, code);
      keepKey(signed.env, signed.key);
      keepWorld(signed.env);
      return { world: signed.env, key: signed.key };
    } catch {
      // A code spent already, or expired: the person logs in the long way, and is told nothing
      // a stranger who found the URL would not be.
    }
  }
  const world = keptWorld();
  return { world, key: keptKey(world) };
}

/** The app, or the login until there is a key: one component, so a dead key falls back to login. */
function Console({ startingWith }: { startingWith: Start }): ReactNode {
  const [world, setWorld] = useState<World>(startingWith.world);
  const [key, setKey] = useState<string | null>(startingWith.key);
  // Whose copy: a colleague's only in the sandbox, where corners are. Production has one, the box's.
  const [corner, setCorner] = useState<string | null>(() => (startingWith.world === "sandbox" ? keptCorner() : null));
  const lookInto = useCallback((other: string | null): void => {
    keepCorner(other);
    setCorner(other);
  }, []);
  onUnauthorized(() => {
    forgetKey(world);
    setKey(null);
  });

  // The toggle's one move. A key kept for the other world is used as it is; otherwise this
  // person's key mints the same person's key there (POST /v1/login/env). A refusal — a machine
  // key opens one world — is the toggle's to show, verbatim, so it is thrown back to it.
  const turnTo = useCallback(
    async (other: World): Promise<void> => {
      const kept = keptKey(other);
      if (kept === null) {
        if (key === null) return;
        const signed = await loginToWorld({ base: BASE, key }, other);
        keepKey(other, signed.key);
      }
      keepWorld(other);
      keepCorner(null);
      setCorner(null);
      setWorld(other);
      setKey(keptKey(other));
    },
    [key],
  );
  // The org switch's one move. The same person's key in the org picked (POST /v1/login/org)
  // replaces every key this browser holds — the other world's key was the old org's — and the
  // console reopens at its root: the agent in the address was the old org's too.
  const moveTo = useCallback(
    async (org: string): Promise<void> => {
      if (key === null) return;
      const signed = await loginToOrg({ base: BASE, key }, org);
      forgetEveryKey();
      keepCorner(null);
      keepKey(signed.env, signed.key);
      keepWorld(signed.env);
      window.location.assign(BASE);
    },
    [key],
  );
  const worlds = useMemo(() => ({ world, turnTo, moveTo, corner, lookInto }), [world, turnTo, moveTo, corner, lookInto]);
  const credentials = useMemo(() => ({ base: BASE, key: key ?? "", corner }), [key, corner]);

  // Every world's key, not the one on screen — see forgetEveryKey. Nothing else in this page may
  // reach storage (lib/session-key.ts), so there is nowhere else a key could still be.
  const leave = useCallback((): void => {
    forgetEveryKey();
    keepCorner(null);
    setCorner(null);
    setKey(null);
  }, []);

  const signed = (proof: Signed): void => {
    keepKey(proof.env, proof.key);
    keepWorld(proof.env);
    setWorld(proof.env);
    setKey(proof.key);
  };

  if (key === null) {
    const token = theInvitationInTheAddress();
    if (token !== null) {
      return (
        <Accept
          base={BASE}
          token={token}
          onSigned={(proof) => {
            // Spent: the address is the console's root from here, so a reload is the console.
            window.history.replaceState(null, "", BASE);
            signed(proof);
          }}
        />
      );
    }
    return <Login base={BASE} onSigned={signed} />;
  }
  return (
    <CredentialsProvider value={credentials}>
      <WhoamiProvider>
        <WorldProvider value={worlds}>
          <LeavingProvider value={leave}>
            <RouterProvider router={router} />
          </LeavingProvider>
        </WorldProvider>
      </WhoamiProvider>
    </CredentialsProvider>
  );
}

void theKeyToStartWith().then((start) => {
  createRoot(root).render(
    <StrictMode>
      <Console startingWith={start} />
    </StrictMode>,
  );
});
