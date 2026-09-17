/** The console starts here: the theme, the key this browser holds — or the login, or an invitation; none at all on a machine's own — and the router. */

import { StrictMode, useCallback, useMemo, useState, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { RouterProvider } from "react-router";

import { onUnauthorized } from "../shared/api";
import { BASE } from "./lib/base";
import { CredentialsProvider } from "../shared/credentials";
import { loginToOrg, loginToWorld, loginWithCode, type Signed } from "./lib/login";
import { NotSignedIn } from "./screens/login/not-signed-in";
import { LeavingProvider } from "./lib/leaving";
import { MODE, WORLD_OF } from "./lib/mode";
import { forgetEveryKey, forgetKey, keepCorner, keepKey, keptCorner, keptKey } from "./lib/session-key";
import { WhoamiProvider } from "./lib/whoami";
import { WorldProvider } from "./lib/world";
import { router } from "./router";
import { Accept, Login } from "./screens/login";
import "./ui/ui.css";

const root = document.getElementById("root");
if (root === null) {
  throw new Error("index.html has no #root for the console to mount in");
}

// The query parameter a production `pinecall run` prints: a one-use code standing for that process's key, spent
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

// The world is not a choice: the gateway's console looks at production and a machine's own at the
// sandbox (lib/mode.ts). What is left to decide at the start is only the key.
const WORLD = WORLD_OF[MODE];

// What the local console knocks with: nothing. `pinecall serve` puts this machine's key on every
// request it forwards (src/cli/serve/server.ts), so the page holds none and signs in to nothing.
const THE_SIDECARS = "";

/**
 * A proof of who signed in, as a production key. The gateway's console is production's, and three
 * things still answer with a sandbox key: a `pinecall run` older than `pinecall serve` printing
 * its `?login=` link, an invitation accepted, and a browser that signed in before the sandbox
 * moved out. Each is the same person, so their key mints their production one (POST /v1/login/env).
 */
async function inProduction(signed: Signed): Promise<Signed> {
  return signed.env === "production" ? signed : loginToWorld({ base: BASE, key: signed.key }, "production");
}

/** The key the gateway's console starts with: spent from `?login=`, or kept, or none. */
async function theKeyToStartWith(): Promise<string | null> {
  if (MODE === "local") return THE_SIDECARS;
  const address = new URL(window.location.href);
  const code = address.searchParams.get(LOGIN);
  if (code !== null) {
    address.searchParams.delete(LOGIN);
    window.history.replaceState(null, "", address.toString());
    try {
      const signed = await inProduction(await loginWithCode(BASE, code));
      keepKey("production", signed.key);
      return signed.key;
    } catch {
      // A code spent already, or expired: the person logs in the long way, and is told nothing
      // a stranger who found the URL would not be.
    }
  }
  const kept = keptKey("production");
  const sandbox = keptKey("sandbox");
  if (sandbox === null) return kept;
  // A key from before the sandbox moved out: it is nothing this page looks at any more.
  forgetKey("sandbox");
  if (kept !== null) return kept;
  try {
    const signed = await loginToWorld({ base: BASE, key: sandbox }, "production");
    keepKey("production", signed.key);
    return signed.key;
  } catch {
    return null;
  }
}

/** The app, or the login until there is a key: one component, so a dead key falls back to login. */
function Console({ startingWith }: { startingWith: string | null }): ReactNode {
  const [key, setKey] = useState<string | null>(startingWith);
  // Whose copy: a colleague's only in the sandbox, where corners are. Production has one, the box's.
  const [corner, setCorner] = useState<string | null>(() => (WORLD === "sandbox" ? keptCorner() : null));
  const lookInto = useCallback((other: string | null): void => {
    keepCorner(other);
    setCorner(other);
  }, []);
  onUnauthorized(() => {
    forgetKey(WORLD);
    setKey(null);
  });

  // The org switch's one move. The same person's key in the org picked (POST /v1/login/org)
  // replaces the key this browser holds, and the console reopens at its root: the agent in the
  // address was the old org's too. The gateway's console alone: a machine's org is its profile's.
  const moveTo = useCallback(
    async (org: string): Promise<void> => {
      if (key === null) return;
      const signed = await loginToOrg({ base: BASE, key }, org);
      forgetEveryKey();
      keepCorner(null);
      keepKey("production", (await inProduction(signed)).key);
      window.location.assign(BASE);
    },
    [key],
  );
  const worlds = useMemo(() => ({ world: WORLD, moveTo, corner, lookInto }), [moveTo, corner, lookInto]);
  const credentials = useMemo(() => ({ base: BASE, key: key ?? "", corner }), [key, corner]);

  // Nothing else in this page may reach storage (lib/session-key.ts), so there is nowhere else a
  // key could still be.
  const leave = useCallback((): void => {
    forgetEveryKey();
    keepCorner(null);
    setCorner(null);
    setKey(null);
  }, []);

  const signed = (proof: Signed): void => {
    void inProduction(proof).then((one) => {
      keepKey("production", one.key);
      setKey(one.key);
    });
  };

  if (key === null) {
    // The sidecar's key was refused: there is no form that fixes that, only the terminal.
    if (MODE === "local") return <NotSignedIn />;
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
