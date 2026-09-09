/** The frame every screen hangs in: the brand, the header strip, the rail on the left, the screen beside it. */

import type { ReactNode } from "react";
import { Outlet, useParams } from "react-router";

import { Header } from "./header";
import { Rail } from "./rail";
import "./shell.css";

export function Shell(): ReactNode {
  const agent = useParams()["agent"] ?? "";
  return (
    <div className="shell">
      <div className="shell-brand">
        <span className="brand-mark" aria-hidden />
        <span className="brand-name">pinecall</span>
        <span className="brand-kind">console</span>
      </div>
      <div className="shell-head">
        <Header agent={agent} />
      </div>
      <nav className="shell-rail" aria-label="Screens">
        <Rail agent={agent} />
      </nav>
      <main className="shell-screen">
        <Outlet />
      </main>
    </div>
  );
}
