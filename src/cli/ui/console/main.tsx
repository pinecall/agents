/** The console starts here: the theme, the key this tab holds — or the login that gets one — and the router. */

import { StrictMode, useState, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { RouterProvider } from "react-router";

import { onUnauthorized } from "./lib/api";
import { BASE } from "./lib/base";
import { CredentialsProvider } from "./lib/credentials";
import { loginWithCode } from "./lib/login";
import { forgetKey, keepKey, keptKey } from "./lib/session-key";
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

/** The key this tab starts with: spent from `?login=`, or kept from an earlier login. */
async function theKeyToStartWith(): Promise<string | null> {
  const address = new URL(window.location.href);
  const code = address.searchParams.get(LOGIN);
  if (code !== null) {
    address.searchParams.delete(LOGIN);
    window.history.replaceState(null, "", address.toString());
    try {
      const signed = await loginWithCode(BASE, code);
      keepKey(signed.key);
      return signed.key;
    } catch {
      // A code spent already, or expired: the person logs in the long way, and is told nothing
      // a stranger who found the URL would not be.
      return keptKey();
    }
  }
  return keptKey();
}

/** The app, or the login until there is a key: one component, so a dead key falls back to login. */
function Console({ startingWith }: { startingWith: string | null }): ReactNode {
  const [key, setKey] = useState<string | null>(startingWith);
  onUnauthorized(() => {
    forgetKey();
    setKey(null);
  });
  if (key === null) {
    return (
      <Login
        base={BASE}
        onSigned={(signed) => {
          keepKey(signed.key);
          setKey(signed.key);
        }}
      />
    );
  }
  return (
    <CredentialsProvider value={{ base: BASE, key }}>
      <RouterProvider router={router} />
    </CredentialsProvider>
  );
}

void theKeyToStartWith().then((key) => {
  createRoot(root).render(
    <StrictMode>
      <Console startingWith={key} />
    </StrictMode>,
  );
});
