/** Widget: the button a site embeds for this agent — the tag, the look, and a live preview. */

import { useEffect, useRef, useState, type ReactNode } from "react";
import { Link, useParams } from "react-router";

import { useCredentials } from "../../../shared/credentials";
import { Button, Field, Input, Page, PageHead, Refused, Switch } from "../../ui";
import { loadWidget, mountWidget, supports, widgetUrl } from "./mount";
import "./widget.css";

// The accents a site may start from. They are data — the value the tag's --pc-accent receives — so
// they live here beside the snippet that writes them, and not in a stylesheet.
const ACCENTS = ["#5b3df5", "#101014", "#0f766e", "#be185d"];

/**
 * The screen. The snippet is what a site pastes, with this gateway as the CDN; the preview is the
 * very same file, mounted inline here, minting its tokens with this console's key instead of a
 * site's endpoint — so what is tried here is what the site will get, one attribute at a time.
 */
export function Widget(): ReactNode {
  const credentials = useCredentials();
  const agent = useParams()["agent"] ?? "";
  const [name, setName] = useState("Assistant");
  const [company, setCompany] = useState("");
  const [tagline, setTagline] = useState("");
  const [phone, setPhone] = useState("");
  const [greeting, setGreeting] = useState("");
  const [autostart, setAutostart] = useState(false);
  const [accent, setAccent] = useState(ACCENTS[0]!);
  const [refused, setRefused] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  // Which of the newer attributes the widget this gateway serves understands. Until it has loaded,
  // none: a field for an attribute the script ignores would be a control that does nothing.
  const [knows, setKnows] = useState<{ greeting: boolean; autostart: boolean }>({ greeting: false, autostart: false });
  const stage = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let gone = false;
    loadWidget().then(
      () => {
        if (gone || stage.current === null) return;
        setKnows({ greeting: supports("greeting"), autostart: supports("autostart") });
        const attributes: Record<string, string> = { name, position: "inline" };
        if (company) attributes["company"] = company;
        if (tagline) attributes["tagline"] = tagline;
        if (phone) attributes["phone"] = phone;
        if (greeting && supports("greeting")) attributes["greeting"] = greeting;
        const element = mountWidget(stage.current, credentials, agent, attributes);
        element.style.setProperty("--pc-accent", accent);
        setRefused(null);
      },
      (failed: unknown) => {
        if (!gone) setRefused(failed instanceof Error ? failed.message : String(failed));
      },
    );
    return () => {
      gone = true;
    };
  }, [credentials, agent, name, company, tagline, phone, greeting, accent]);

  const attributes = [
    `agent="${agent}"`,
    `name="${name}"`,
    company && `company="${company}"`,
    tagline && `tagline="${tagline}"`,
    phone && `phone="${phone}"`,
    knows.greeting && greeting && `greeting="${greeting}"`,
    knows.autostart && autostart && "autostart",
    `token-url="/pinecall/token"`,
    `log-url="/pinecall/log"`,
  ].filter(Boolean);
  const style = accent === ACCENTS[0] ? "" : `\n<style>pinecall-widget { --pc-accent: ${accent}; }</style>`;
  const snippet = `<script type="module" src="${widgetUrl()}"></script>\n<pinecall-widget ${attributes.join("\n                 ")}></pinecall-widget>${style}`;
  const preview = new URLSearchParams({ name, company, tagline, phone, accent, ...(knows.greeting && greeting ? { greeting } : {}) });

  const copy = (): void => {
    void navigator.clipboard.writeText(snippet).then(() => {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    });
  };

  return (
    <Page width={900} tight>
      <PageHead
        title="Widget"
        ledeWidth={620}
        lede={`The web door for ${agent} — one script tag on your site, and the call lands in the same log as the phone.`}
      />

      <div className="ui-card">
        <div className="ui-card-head">
          <span className="ui-card-title">Embed</span>
          <Button size="xs" className="widget-copy" onClick={copy}>
            {copied ? "Copied" : "Copy"}
          </Button>
        </div>
        <pre className="ui-code">{snippet}</pre>
        <div className="widget-endpoints">
          <span className="ui-fixed">token-url</span> and <span className="ui-fixed">log-url</span> are your site's: the first mints a visit
          token at <span className="ui-fixed">/v1/tokens</span> with a key holding <span className="ui-fixed">talk</span>, the second relays the
          call's log with a key holding <span className="ui-fixed">calls</span>. Ready-made PHP and Laravel endpoints:{" "}
          <a href="https://github.com/pinecall/widget" target="_blank" rel="noreferrer">
            github.com/pinecall/widget
          </a>
          .
        </div>
      </div>

      <div className="widget-split">
        <div className="ui-card">
          <div className="ui-card-head">
            <span className="ui-card-title">Appearance</span>
          </div>
          <div className="widget-fields">
            <Field label="Name">
              <Input value={name} onChange={(event) => setName(event.target.value)} />
            </Field>
            <Field label="Tagline">
              <Input value={tagline} placeholder="the line under the name" onChange={(event) => setTagline(event.target.value)} />
            </Field>
            {knows.greeting && (
              <Field label="Greeting">
                <Input value={greeting} placeholder="what the widget says before the call starts" onChange={(event) => setGreeting(event.target.value)} />
              </Field>
            )}
            <div className="widget-pair">
              <Field label="Company">
                <Input value={company} placeholder="whose agent it is" onChange={(event) => setCompany(event.target.value)} />
              </Field>
              <Field label="Phone">
                <Input value={phone} placeholder="+1 (417) 674-3169" onChange={(event) => setPhone(event.target.value)} />
              </Field>
            </div>
            <div>
              <div className="widget-accent-label">Accent</div>
              <div className="widget-accents" role="group" aria-label="accent">
                {ACCENTS.map((one) => (
                  <button
                    key={one}
                    type="button"
                    className="widget-accent"
                    style={{ background: one, boxShadow: one === accent ? `0 0 0 2px #fff,0 0 0 4px ${one}` : undefined }}
                    onClick={() => setAccent(one)}
                    aria-label={one}
                    aria-pressed={one === accent}
                  />
                ))}
              </div>
            </div>
            {knows.autostart && (
              <div className="widget-toggle">
                <span className="widget-toggle-label">Open with the microphone ready</span>
                <Switch on={autostart} onChange={setAutostart} label="Open with the microphone ready" />
              </div>
            )}
          </div>
        </div>

        <div className="widget-preview">
          <div className="widget-preview-label">Preview</div>
          <div className="widget-stage" ref={stage} />
          <Refused>{refused}</Refused>
          <Link className="widget-open" to={`/a/${agent}/widget/preview?${preview.toString()}`} target="_blank">
            Open on a blank page ↗
          </Link>
        </div>
      </div>
    </Page>
  );
}
