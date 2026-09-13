/** Pipeline: the three providers a turn passes through, the anatomy of a turn, and what may be changed. */

import type { ReactNode } from "react";
import { useParams } from "react-router";

import { Nothing } from "../../../shared/frame";
import { Controls } from "./controls";
import { greetingLine } from "./door";
import { DecidesLeg, HearsLeg, SpeaksLeg } from "./legs";
import { Overrides } from "./overrides";
import { usePipeline } from "./use-pipeline";
import { Waterfall } from "./waterfall";
import "./pipeline.css";

export function Pipeline(): ReactNode {
  const agent = useParams()["agent"] ?? "";
  const { report, saving, error, turn } = usePipeline(agent);

  return (
    <div className="page">
      <header className="page-head">
        <div className="page-eyebrow">{agent} · pipeline</div>
        <h1 className="page-title">Pipeline</h1>
        <p className="page-lede">
          The three legs of a voice turn as data, not as prose: what hears, what decides, what
          speaks — every value read from the gateway with this agent's overrides already applied, so
          this screen cannot show a pipeline the next call will not run.
        </p>
      </header>

      {report === null ? (
        <section className="section">
          <Nothing>{error ?? `Asking the gateway what ${agent} runs on…`}</Nothing>
        </section>
      ) : (
        <>
          <section className="section">
            <h2 className="section-title">Providers</h2>
            <div className="grid grid-3">
              <HearsLeg stage={report.hears} unavailable={report.unavailable_reasons["hears"] ?? null} />
              <DecidesLeg stage={report.decides} unavailable={report.unavailable_reasons["decides"] ?? null} />
              <SpeaksLeg stage={report.speaks} unavailable={report.unavailable_reasons["speaks"] ?? null} />
            </div>
          </section>

          <section className="section">
            <h2 className="section-title">Anatomy of a turn</h2>
            <Waterfall medians={report.medians} calls={report.calls} agent={agent} />
          </section>

          <section className="section">
            <h2 className="section-title">Control</h2>
            <Controls
              key={agent}
              turned={report.overrides}
              declared={{
                stt: `${report.hears.vendor}/${report.hears.model ?? ""}`,
                llm: `${report.decides.vendor}/${report.decides.model ?? ""}`,
                tts: report.speaks.vendor,
                voice: report.speaks.voice_id ?? "",
                tts_model: report.speaks.model ?? "",
                greeting: greetingLine(report.greeting),
              }}
              voices={report.voices}
              providers={report.providers}
              saving={saving}
              error={error}
              onTurn={turn}
            />
            <Overrides turned={report.overrides} />
          </section>
        </>
      )}
    </div>
  );
}
