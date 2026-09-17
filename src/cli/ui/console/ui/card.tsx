/** The card and what goes in one: its head, its rows, its foot, the labelled sections of a side pane. */

import type { CSSProperties, ReactNode } from "react";
import { Link } from "react-router";

export function Card({ children, pad = false, style }: { children: ReactNode; pad?: boolean | undefined; style?: CSSProperties }): ReactNode {
  return (
    <div className={pad ? "ui-card ui-card-pad" : "ui-card"} style={style}>
      {children}
    </div>
  );
}

/** A card's head: its title, a word about it, and one action at the far end. */
export function CardHead({
  title,
  meta,
  action,
  children,
}: {
  title: ReactNode;
  meta?: ReactNode | undefined;
  action?: ReactNode | undefined;
  /** Anything else the head carries, placed after the meta. */
  children?: ReactNode | undefined;
}): ReactNode {
  return (
    <div className="ui-card-head">
      {typeof title === "string" ? <span className="ui-card-title">{title}</span> : title}
      {meta !== undefined && <span className="ui-card-meta">{meta}</span>}
      {children}
      {action}
    </div>
  );
}

/** The link at the end of a card's head or foot. */
export function CardAction({ to, onClick, children }: { to?: string | undefined; onClick?: () => void; children: ReactNode }): ReactNode {
  if (to !== undefined) {
    return (
      <Link to={to} className="ui-card-action">
        {children}
      </Link>
    );
  }
  return (
    <button type="button" className="ui-card-action" onClick={onClick}>
      {children}
    </button>
  );
}

export function CardFoot({ children }: { children: ReactNode }): ReactNode {
  return <div className="ui-card-foot">{children}</div>;
}

/** What a card says when it has nothing to list, and why. */
export function Empty({ children }: { children: ReactNode }): ReactNode {
  return <div className="ui-empty">{children}</div>;
}

/** A door's refusal, in its own words. */
export function Refused({ children }: { children: ReactNode }): ReactNode {
  return children === null || children === undefined || children === "" ? null : <div className="ui-refused">{children}</div>;
}

/** A row of a card's list: a leading mark, a name and a line under it, and whatever ends it. */
export function Row({
  lead,
  name,
  tag,
  sub,
  end,
  to,
  onClick,
}: {
  lead?: ReactNode | undefined;
  name: ReactNode;
  tag?: ReactNode | undefined;
  sub?: ReactNode | undefined;
  end?: ReactNode | undefined;
  to?: string | undefined;
  onClick?: (() => void) | undefined;
}): ReactNode {
  const body = (
    <>
      {lead}
      <div className="ui-row-main">
        <div className="ui-row-line">
          <span className="ui-row-name">{name}</span>
          {tag}
        </div>
        {sub !== undefined && <div className="ui-row-sub">{sub}</div>}
      </div>
      {end !== undefined && <div className="ui-row-end">{end}</div>}
    </>
  );
  if (to !== undefined) {
    return (
      <Link to={to} className="ui-row ui-row-link">
        {body}
      </Link>
    );
  }
  return (
    <div className={onClick === undefined ? "ui-row" : "ui-row ui-row-link"} onClick={onClick}>
      {body}
    </div>
  );
}

/** The compact row of a side card: a name, a line under it, a pill at the end. */
export function Item({ name, sub, end, to }: { name: ReactNode; sub?: ReactNode | undefined; end?: ReactNode; to?: string | undefined }): ReactNode {
  const body = (
    <>
      <div className="ui-row-main">
        <div className="ui-item-name">{name}</div>
        {sub !== undefined && <div className="ui-item-sub">{sub}</div>}
      </div>
      {end}
    </>
  );
  return to === undefined ? (
    <div className="ui-item">{body}</div>
  ) : (
    <Link to={to} className="ui-item">
      {body}
    </Link>
  );
}

/** A labelled section of a side pane: STATE, ROOM, PROMPT. */
export function SectionLabel({ children, ruled = false }: { children: ReactNode; ruled?: boolean | undefined }): ReactNode {
  return <div className={ruled ? "ui-section-label ui-section-label-ruled" : "ui-section-label"}>{children}</div>;
}

/** A key and its value, side by side. */
export function KV({ label, children, keyWidth }: { label: ReactNode; children: ReactNode; keyWidth?: number | undefined }): ReactNode {
  return (
    <div className="ui-kv">
      <span className="ui-kv-key" style={keyWidth === undefined ? undefined : { width: keyWidth }}>
        {label}
      </span>
      <span className="ui-kv-value">{children}</span>
    </div>
  );
}
