/** Pipeline: the three providers a turn passes through, the anatomy of a turn, and what may be changed. */

import type { ReactNode } from "react";
import { useParams } from "react-router";

import { Card, Empty, Page, PageHead } from "../../ui";
import { Controls } from "./controls";
import { greetingLine } from "./door";
import { HoldMelody } from "./hold";
import { DecidesLeg, HearsLeg, SpeaksLeg } from "./legs";
import { Overrides } from "./overrides";
import { usePipeline } from "./use-pipeline";
import { Waterfall } from "./waterfall";
import "./pipeline.css";

export function Pipeline(): ReactNode {
  const agent = useParams()["agent"] ?? "";
  const { report, saving, error, turn } = usePipeline(agent);

  return (
    <Page tight>
      <PageHead
        title="Pipeline"
        ledeWidth={660}
        lede="The three legs of a voice turn as data, not prose: what hears, what decides, what speaks — every value read from the gateway with this agent's overrides already applied."
      />

      {report === null ? (
        <Card>
          <Empty>{error ?? `Asking the gateway what ${agent} runs on…`}</Empty>
        </Card>
      ) : (
        <>
          <div className="pipe-legs">
            <HearsLeg stage={report.hears} unavailable={report.unavailable_reasons["hears"] ?? null} turned={report.overrides.stt !== null} />
            <DecidesLeg stage={report.decides} unavailable={report.unavailable_reasons["decides"] ?? null} turned={report.overrides.llm !== null} />
            <SpeaksLeg
              stage={report.speaks}
              unavailable={report.unavailable_reasons["speaks"] ?? null}
              turned={report.overrides.tts !== null || report.overrides.voice !== null || report.overrides.tts_model !== null}
            />
          </div>

          <Waterfall medians={report.medians} calls={report.calls} agent={agent} />

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
          <HoldMelody key={`hold-${agent}`} agent={agent} />
          <Overrides turned={report.overrides} />
        </>
      )}
    </Page>
  );
}
