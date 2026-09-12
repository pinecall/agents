/** The console starts here: the theme, the key this tab holds for the world it looks at — or the login — and the router. */

import { StrictMode, useCallback, useMemo, useState, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { RouterProvider } from "react-router";

import { onUnauthorized } from "./lib/api";
import { BASE } from "./lib/base";
import { CredentialsProvider } from "./lib/credentials";
import { loginToWorld, loginWithCode } from "./lib/login";
import { forgetKey, keepKey, keepWorld, keptKey, keptWorld, type World } from "./lib/session-key";
import { WhoamiProvider } from "./lib/whoami";
import { WorldProvider } from "./lib/world";
import { router } from "./router";
import { Login } from "./screens/login";
import { followTheSystemTheme } from "./shell/theme";
import "./styles/app.css";

followTheSystemTheme();

const root = document.getElementById("root");
if (root === null) {
  throw new Error("index.html has no #root for the console to mount in");
}

// The query parameter `pinecall run` prints: a one-use code standing for that process's key, spent
// here for a key of this tab's own and taken out of the address bar before anything renders, so a
// reload, a bookmark or a screenshot never carries it.
const LOGIN = "login";

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
      setWorld(other);
      setKey(keptKey(other));
    },
    [key],
  );
  const worlds = useMemo(() => ({ world, turnTo }), [world, turnTo]);

  if (key === null) {
    return (
      <Login
        base={BASE}
        onSigned={(signed) => {
          keepKey(signed.env, signed.key);
          keepWorld(signed.env);
          setWorld(signed.env);
          setKey(signed.key);
        }}
      />
    );
  }
  return (
    <CredentialsProvider value={{ base: BASE, key }}>
      <WhoamiProvider>
        <WorldProvider value={worlds}>
          <RouterProvider router={router} />
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
