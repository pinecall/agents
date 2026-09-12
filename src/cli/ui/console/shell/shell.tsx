/** The console in the frame both pages wear: its header contents, its rail, and the screen. */

import type { ReactNode } from "react";
import { Outlet, useParams } from "react-router";

import { Frame } from "../../shared/frame";
import { Header } from "./header";
import { Rail } from "./rail";
import "./shell.css";

export function Shell(): ReactNode {
  const agent = useParams()["agent"] ?? "";
  return (
    <Frame head={<Header agent={agent} />} rail={<Rail agent={agent} />}>
      <Outlet />
    </Frame>
  );
}
