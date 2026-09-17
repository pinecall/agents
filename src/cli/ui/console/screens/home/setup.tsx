/** Finish setting up: what an org still has to do before its agents answer everybody, until it is done. */

import { useEffect, useState, type ReactNode } from "react";
import { Link } from "react-router";

import { z } from "zod";

import { put, read } from "../../../shared/api";
import { useCredentials } from "../../../shared/credentials";
import { has, ORG_SCREENS } from "../../lib/mode";
import { opens } from "../../lib/scopes";
import { useScopes } from "../../lib/whoami";
import { Card } from "../../ui";
import { readCarrier, readNumbers } from "../numbers/door";
import { readMembers } from "../team/door";

interface Step {
  done: boolean;
  name: string;
  action: string;
  to?: string;
  /** A step done right here, rather than on another screen. */
  run?: () => Promise<void>;
}

// GET/PUT /v1/org/judging (the runtime's console-api.md §3): whether this org's calls are judged at hang-up.
const JudgingSchema = z.object({ on: z.boolean(), ceiling_eur: z.number().nullable() });

export function Setup(): ReactNode {
  const credentials = useCredentials();
  const scopes = useScopes();
  const [steps, setSteps] = useState<Step[] | null>(null);

  const numbers = has(ORG_SCREENS, "numbers") && scopes !== null && opens(scopes, "numbers");
  const team = has(ORG_SCREENS, "team") && scopes !== null && opens(scopes, "team");
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (scopes === null) return;
    let gone = false;
    void (async () => {
      const found: Step[] = [];
      if (numbers) {
        const [carrier, routes] = await Promise.all([readCarrier(credentials).catch(() => null), readNumbers(credentials).catch(() => [])]);
        found.push({ done: carrier !== null, name: "Connect a phone carrier", action: "Connect", to: "/numbers" });
        const pointed = routes.filter((one) => one.route.number !== null).length;
        found.push({ done: pointed > 0, name: pointed > 1 ? `Point ${pointed} numbers at an agent` : "Point a number at an agent", action: "Add", to: "/numbers" });
      }
      // Judging is read by any key that reads calls; turning it on is a manager's (`usage`).
      const judging = await read(credentials, "/v1/org/judging").then((answer) => JudgingSchema.parse(answer), () => null);
      if (judging !== null && scopes !== null && scopes.includes("usage")) {
        found.push({
          done: judging.on,
          name: "Add a judge so calls get scored",
          action: "Turn on",
          run: async () => {
            await put(credentials, "/v1/org/judging", { on: true });
            setTick((now) => now + 1);
          },
        });
      }
      if (team) {
        const members = await readMembers(credentials).catch(() => []);
        found.push({ done: members.filter((one) => one.status !== "disabled").length > 1, name: "Invite your team", action: "Invite", to: "/team" });
      }
      if (!gone) setSteps(found);
    })();
    return () => {
      gone = true;
    };
  }, [credentials, numbers, team, scopes, tick]);

  if (steps === null || steps.length === 0 || steps.every((step) => step.done)) return null;
  return (
    <Card>
      <div className="ui-card-head">
        <span className="ui-card-title">Finish setting up</span>
      </div>
      <div className="home-steps">
        {steps.map((step) =>
          step.done ? (
            <div key={step.name} className="home-step">
              <span className="home-step-done">✓</span>
              <span className="home-step-name home-step-name-done">{step.name}</span>
            </div>
          ) : step.run !== undefined ? (
            <button key={step.name} type="button" className="home-step home-step-open home-step-button" onClick={() => void step.run?.()}>
              <span className="home-step-todo" />
              <span className="home-step-name">{step.name}</span>
              <span className="home-step-action">{step.action}</span>
            </button>
          ) : (
            <Link key={step.name} to={step.to ?? "/"} className="home-step home-step-open">
              <span className="home-step-todo" />
              <span className="home-step-name">{step.name}</span>
              <span className="home-step-action">{step.action}</span>
            </Link>
          ),
        )}
      </div>
    </Card>
  );
}
