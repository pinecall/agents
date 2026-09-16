/** Widget: the button a site embeds for this agent — the snippet, the look, and a live preview. */

import { useEffect, useRef, useState, type ReactNode } from "react";
import { Link, useParams } from "react-router";

import { useCredentials } from "../../../shared/credentials";
import { loadWidget, mountWidget, widgetUrl } from "./mount";
import "./widget.css";

const ACCENTS = ["#6d28d9", "#0f766e", "#c92572", "#1d4ed8", "#111111"];

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
  const [accent, setAccent] = useState(ACCENTS[0]!);
  const [refused, setRefused] = useState<string | null>(null);
  const stage = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let gone = false;
    loadWidget().then(
      () => {
        if (gone || stage.current === null) return;
        const attributes: Record<string, string> = { name, position: "inline" };
        if (company) attributes["company"] = company;
        if (tagline) attributes["tagline"] = tagline;
        if (phone) attributes["phone"] = phone;
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
  }, [credentials, agent, name, company, tagline, phone, accent]);

  const attributes = [
    `agent="${agent}"`,
    `name="${name}"`,
    company && `company="${company}"`,
    tagline && `tagline="${tagline}"`,
    phone && `phone="${phone}"`,
    `token-url="/pinecall/token"`,
    `log-url="/pinecall/log"`,
  ].filter(Boolean);
  const snippet = `<script type="module" src="${widgetUrl()}"></script>\n<pinecall-widget ${attributes.join("\n                 ")}></pinecall-widget>`;
  const style = accent === ACCENTS[0] ? "" : `\n<style>pinecall-widget { --pc-accent: ${accent}; }</style>`;

  return (
    <div className="widget-screen">
      <div className="widget-column">
        <h1 className="widget-title">Widget</h1>
        <p className="widget-lede">
          One button on any page: the phone number with the call's live log, a voice call from the browser, and a
          chat. This gateway serves the script; the site adds two endpoints of its own that mint the visit token
          and relay the log with the org's key.
        </p>

        <h2 className="widget-heading">1 · The tag</h2>
        <pre className="widget-snippet fixed">{snippet + style}</pre>
        <p className="widget-note">
          <code>token-url</code> and <code>log-url</code> are the site's: <code>POST</code> with{" "}
          <code>{"{agent, scope}"}</code> to Pinecall's <code>/v1/tokens</code> with a key holding <code>talk</code>, and{" "}
          <code>GET ?agent=&amp;list=1</code> / <code>?agent=&amp;call=</code> relaying the sessions list and a call's events with
          a key holding <code>calls</code>. Ready-made PHP and Laravel endpoints:{" "}
          <a href="https://github.com/pinecall/widget" target="_blank" rel="noreferrer">
            github.com/pinecall/widget
          </a>
          .
        </p>

        <h2 className="widget-heading">2 · The look</h2>
        <div className="widget-fields">
          <label>
            <span>name</span>
            <input className="input" value={name} onChange={(event) => setName(event.target.value)} />
          </label>
          <label>
            <span>company</span>
            <input className="input" value={company} onChange={(event) => setCompany(event.target.value)} placeholder="whose agent it is" />
          </label>
          <label>
            <span>tagline</span>
            <input className="input" value={tagline} onChange={(event) => setTagline(event.target.value)} placeholder="the line under the name" />
          </label>
          <label>
            <span>phone</span>
            <input className="input fixed" value={phone} onChange={(event) => setPhone(event.target.value)} placeholder="+1 (417) 674-3169 · shows Call us" />
          </label>
          <div className="widget-accents" role="group" aria-label="accent">
            <span>accent</span>
            {ACCENTS.map((one) => (
              <button
                key={one}
                type="button"
                className={one === accent ? "widget-accent widget-accent-here" : "widget-accent"}
                style={{ background: one }}
                onClick={() => setAccent(one)}
                aria-label={one}
              />
            ))}
          </div>
        </div>
        <p className="widget-note">
          Every colour, the radius, the font and the offset are custom properties on the tag (<code>--pc-accent</code>,{" "}
          <code>--pc-radius</code>, <code>--pc-font</code>…); the button and the panel are parts (<code>::part(button)</code>). The
          font is the page's own.
        </p>

        <h2 className="widget-heading">3 · On a blank page</h2>
        <p className="widget-note">
          The button bottom-right on an empty page, the way a site has it.{" "}
          <Link className="widget-open" to={`/a/${agent}/widget/preview?${new URLSearchParams({ name, company, tagline, phone, accent }).toString()}`} target="_blank">
            Open the preview ↗
          </Link>
        </p>
      </div>

      <div className="widget-stage-column">
        <div className="widget-stage-label fixed">preview · minting with this console's key</div>
        <div className="widget-stage" ref={stage} />
        {refused !== null && <p className="widget-refused">{refused}</p>}
      </div>
    </div>
  );
}
