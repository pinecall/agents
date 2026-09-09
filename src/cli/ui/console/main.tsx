/** The console starts here: the system's theme, the base it was opened at, and the router. */

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { RouterProvider } from "react-router";

import { BASE } from "./lib/base";
import { CredentialsProvider } from "./lib/credentials";
import { router } from "./router";
import { followTheSystemTheme } from "./shell/theme";
import "./styles/app.css";

followTheSystemTheme();

const root = document.getElementById("root");
if (root === null) {
  throw new Error("index.html has no #root for the console to mount in");
}

createRoot(root).render(
  <StrictMode>
    <CredentialsProvider value={{ base: BASE }}>
      <RouterProvider router={router} />
    </CredentialsProvider>
  </StrictMode>,
);
