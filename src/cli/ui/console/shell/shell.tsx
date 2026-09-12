/** The frame every screen hangs in: the header across the top, the rail on the left, the screen beside it. */

import type { ReactNode } from "react";
import { Outlet, useParams } from "react-router";

import { Header } from "./header";
import { Rail } from "./rail";
import "./shell.css";

export function Shell(): ReactNode {
  const agent = useParams()["agent"] ?? "";
  return (
    <div className="shell">
      <header className="shell-head">
        <Header agent={agent} />
      </header>
      <div className="shell-body">
        <nav className="shell-rail" aria-label="Screens">
          <Rail agent={agent} />
        </nav>
        <main className="shell-screen">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
