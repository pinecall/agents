/** Home: how today is going — the numbers, what needs a look, who is on the floor, where calls arrive. */

import type { ReactNode } from "react";

import { useInsights, type Insights } from "../../lib/insights";
import { useOrg } from "../../lib/org";
import type { SessionLine } from "@pinecall/protocol";
import { change, duration, elapsed, percent, spend, startedOn, today, whoOn, ago } from "../../lib/format";
import { useScores, type Scored } from "../../lib/use-scores";
import { useWhoami } from "../../lib/whoami";
import { Avatar, Bar, ButtonLink, Card, CardAction, CardFoot, CardHead, Dot, Empty, Page, PageHead, Pill, Row, Stat, Stats, type Tint, type Tone } from "../../ui";
import { Setup } from "./setup";
import "./home.css";

// A human stepped in: the call went to a person, or a supervisor ended it.
const ESCALATED = new Set(["transferred", "supervisor_ended"]);

type Flag = "escalated" | "low score" | "promise made";

interface Look {
  row: Scored;
  flag: Flag;
  reason: string;
}

const FLAG_TONE: Record<Flag, { pill: Tone; tint: Tint }> = {
  escalated: { pill: "red", tint: "red" },
  "low score": { pill: "amber", tint: "amber" },
  "promise made": { pill: "indigo", tint: "indigo" },
};

// The gateway's flag names, in the words a row says them.
const FLAG_WORDS: Record<string, Flag> = { escalated: "escalated", low_score: "low score", promise: "promise made" };

function greeting(): string {
  const hour = new Date().getHours();
  return hour < 12 ? "Good morning" : hour < 19 ? "Good afternoon" : "Good evening";
}

/** Among today's finished calls, the ones a person should read: a human stepped in, or a judge said no. */
function needingALook(rows: Scored[]): Look[] {
  const found: Look[] = [];
  for (const row of rows) {
    const { score } = row;
    const line = row.line as SessionLine;
    // A gateway that flags its rows says it; an older one is read the long way, below.
    if (line.flags !== undefined && line.flags !== null) {
      const first = line.flags.map((one) => FLAG_WORDS[one]).find((one) => one !== undefined);
      if (first !== undefined) found.push({ row, flag: first, reason: line.score?.reason ?? line.outcome ?? "" });
      continue;
    }
    if (line.end_reason !== null && ESCALATED.has(line.end_reason)) {
      found.push({ row, flag: "escalated", reason: line.outcome ?? (line.end_reason === "transferred" ? "Handed to a person" : "A supervisor ended it") });
    } else if (score !== null && score.passed === false) {
      const broken = score.judges.find((judge) => judge.verdict === "broken");
      found.push({ row, flag: "low score", reason: broken?.reason ?? line.outcome ?? "A judge did not hold" });
    }
  }
  return found;
}

/** The share of finished calls no human had to touch. */
function resolvedShare(lines: SessionLine[]): number | null {
  const finished = lines.filter((line) => !line.live);
  if (finished.length === 0) return null;
  return finished.filter((line) => line.end_reason === null || !ESCALATED.has(line.end_reason)).length / finished.length;
}

export function Home(): ReactNode {
  const whose = useWhoami();
  const { lines, live, insights } = useOrg();
  const days = today();
  const ofToday = startedOn(lines, days.today);
  const ofYesterday = startedOn(lines, days.yesterday);
  const scored = useScores(ofToday);
  const looks = needingALook(scored);
  const first = (whose?.name ?? "").split(" ")[0] ?? "";

  // The gateway's count when it keeps one — every call of the day, not the page the floor read —
  // and the fold of that page otherwise.
  const before = useInsights(days.yesterday);
  const count = insights?.conversations.today ?? ofToday.length;
  const conversations = change(count, insights?.conversations.yesterday ?? ofYesterday.length);
  const resolved = insights === null ? resolvedShare(ofToday) : insights.resolved_rate;
  const resolvedBefore = insights === null ? resolvedShare(ofYesterday) : (before?.resolved_rate ?? null);
  const resolvedDelta = resolved === null || resolvedBefore === null ? null : Math.round((resolved - resolvedBefore) * 100);
  const spent = insights?.spend_eur ?? ofToday.reduce((sum, line) => sum + (line.cost?.eur ?? 0), 0);
  const limit = insights?.budget.limit_eur ?? null;

  const floor = live.length === 0 ? "Nobody on a call right now" : live.length === 1 ? "One call on the floor" : `${live.length} calls on the floor`;
  const looking = looks.length === 0 ? "nothing needs a look" : looks.length === 1 ? "one conversation needs a look" : `${looks.length} conversations need a look`;

  return (
    <Page>
      <PageHead title={first === "" ? greeting() : `${greeting()}, ${first}`} lede={`${floor}, ${looking}, everything else handled.`} />

      <Stats min={190}>
        <Stat size="big" label="Conversations" value={ofToday.length} delta={conversations?.text} tone={conversations?.tone} />
        <Stat
          size="big"
          label="Resolved without a human"
          value={resolved === null ? "—" : percent(resolved)}
          delta={resolvedDelta === null ? undefined : resolvedDelta === 0 ? "steady" : `${resolvedDelta > 0 ? "+" : "−"}${Math.abs(resolvedDelta)} pts`}
          tone={resolvedDelta === null || resolvedDelta === 0 ? "flat" : resolvedDelta > 0 ? "up" : "down"}
        />
        {insights !== null && <Median insights={insights} before={before} />}
        <Stat size="big" label="Spend today" value={spend(spent)} delta={limit === null ? "today" : `of €${limit}`} tone="flat" />
      </Stats>

      <div className="home-split">
        <Card>
          <CardHead title="Needs a look" meta={`${looks.length} of ${count} today`} action={<CardAction to="/sessions">All sessions</CardAction>} />
          {looks.length === 0 && <Empty>Nothing today needs a look: no call went to a person, and no judge said no.</Empty>}
          {looks.map((look) => (
            <Row
              key={look.row.line.call}
              to={`/sessions/${look.row.line.call}`}
              lead={<Avatar name={whoOn(look.row.line)} tint={FLAG_TONE[look.flag].tint} />}
              name={whoOn(look.row.line)}
              tag={
                <Pill tone={FLAG_TONE[look.flag].pill} small>
                  {look.flag}
                </Pill>
              }
              sub={look.reason}
              end={
                <>
                  <div className="ui-row-end-1">
                    {look.row.line.channel ?? "—"} · {duration(look.row.line)}
                  </div>
                  <div className="ui-row-end-2">{ago(look.row.line.started_at)}</div>
                </>
              }
            />
          ))}
          <CardFoot>
            <span>{Math.max(0, count - looks.length)} more handled cleanly</span>
            <CardAction to="/sessions">See all sessions</CardAction>
          </CardFoot>
        </Card>

        <div className="home-side">
          <Card>
            <CardHead title={<span className="home-floor-title"><Dot tone={live.length > 0 ? "green" : undefined} /><span className="ui-card-title">On the floor now</span></span>} />
            <div className="home-floor">
              {live.length === 0 && <div className="home-quiet">Nobody is on a call. A call that rings appears here the moment it does.</div>}
              {live.slice(0, 4).map((line) => (
                <div key={line.call} className="home-live">
                  <Avatar name={whoOn(line)} tint="green" />
                  <div className="ui-row-main">
                    <div className="home-live-name">{whoOn(line)}</div>
                    <div className="home-live-sub">
                      {line.agent} · {line.channel ?? "—"} · {elapsed(line.started_at)}
                    </div>
                  </div>
                  <ButtonLink to={`/live/${line.call}`} size="xs">
                    Listen
                  </ButtonLink>
                </div>
              ))}
            </div>
          </Card>

          <Channels lines={ofToday.length > 0 ? ofToday : lines} counted={insights !== null && count > 0 ? insights.channels : null} />
          <Setup />
        </div>
      </div>
    </Page>
  );
}

const CHANNELS: readonly { channel: string; name: string; color: string }[] = [
  { channel: "phone", name: "Phone", color: "var(--accent)" },
  { channel: "web", name: "Web", color: "var(--accent-2)" },
  { channel: "whatsapp", name: "WhatsApp", color: "var(--accent-3)" },
];

/** How long a caller waited for the agent, the median of the day's turns, against the day before. */
function Median({ insights, before }: { insights: Insights; before: Insights | null }): ReactNode {
  const now = insights.median_e2e_s;
  const then = before?.median_e2e_s ?? null;
  let delta = "today";
  let tone: "up" | "down" | "flat" = "flat";
  if (now !== null && then !== null) {
    const moved = Math.round((now - then) * 10) / 10;
    if (Math.abs(moved) < 0.1) delta = "steady";
    else {
      delta = `${moved > 0 ? "+" : "−"}${Math.abs(moved).toFixed(1)}s`;
      tone = moved > 0 ? "down" : "up";
    }
  }
  return <Stat size="big" label="Median answer" value={now === null ? "—" : `${now.toFixed(1)}s`} delta={delta} tone={tone} />;
}

/** How the calls split by door: the gateway's count of the day when it keeps one, else the page's. */
function Channels({ lines, counted }: { lines: SessionLine[]; counted: Insights["channels"] | null }): ReactNode {
  const total = counted === null ? lines.length : counted.phone + counted.web + counted.whatsapp;
  const of = (channel: string): number =>
    counted === null ? lines.filter((line) => line.channel === channel).length : (counted[channel as keyof Insights["channels"]] ?? 0);
  return (
    <Card>
      <div className="ui-card-head">
        <span className="ui-card-title">Where calls arrive</span>
      </div>
      <div className="home-channels">
        {CHANNELS.map(({ channel, name, color }) => {
          const share = total === 0 ? 0 : of(channel) / total;
          return (
            <div key={channel}>
              <div className="home-channel-line">
                <span className="home-channel-name">{name}</span>
                <span className="home-channel-share">{percent(share)}</span>
              </div>
              <Bar share={share} color={color} />
            </div>
          );
        })}
      </div>
    </Card>
  );
}
