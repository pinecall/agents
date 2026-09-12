/** The operator's page in the frame both pages wear: the header, the rail, and the screen. */

import type { ReactNode } from "react";
import { Outlet, useLocation } from "react-router";

import { Brand, Crumbs, Frame, RailGroup, RailLink, ThemeToggle } from "../../shared/frame";
import { TheBoxSays } from "./the-box-says";

// Four screens and no more: what the box has (its tenants), what answers on it (the doors), what
// runs it (the fleet) and what it consumed (the usage). Anything about a PLAN — what an org pays,
// what it is owed — is the charging package's and is deliberately not here.
const SCREENS = [
  { path: "", name: "Orgs", end: true },
  { path: "routes", name: "Routes", end: false },
  { path: "fleet", name: "Fleet", end: false },
  { path: "usage", name: "Usage", end: false },
] as const;

export function Shell(): ReactNode {
  const segments = useLocation().pathname.split("/").filter(Boolean);
  return (
    <Frame
      head={
        <>
          <Brand kind="admin" />
          <Crumbs crumbs={["box", ...segments]} />
          <div className="head-right">
            <TheBoxSays />
            <ThemeToggle />
          </div>
        </>
      }
      rail={
        <RailGroup label="Box">
          {SCREENS.map((screen) => (
            <RailLink key={screen.path} to={`/${screen.path}`} end={screen.end} name={screen.name} />
          ))}
        </RailGroup>
      }
    >
      <Outlet />
    </Frame>
  );
}
