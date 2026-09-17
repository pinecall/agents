/** Box settings: three tabs — who may sign in with Google, the mail the box sends, and the brand its letters carry. */

import type { ReactNode } from "react";
import { useSearchParams } from "react-router";

import { Card, Empty, Page, PageHead, Tabs } from "../../ui";
import { SettingsBrand } from "./settings-brand";
import { SettingsEmail } from "./settings-email";
import { SettingsSignIn } from "./settings-signin";
import "./box.css";

type Tab = "signin" | "email" | "brand";

const TABS: readonly { tab: Tab; name: string }[] = [
  { tab: "signin", name: "Sign-in" },
  { tab: "email", name: "Email" },
  { tab: "brand", name: "Brand" },
];

/** The screen. What is set here is the BOX's, for every org on it; an org's own are on its screens. */
export function BoxSettings(): ReactNode {
  const [params, setParams] = useSearchParams();
  const tab: Tab = TABS.some((one) => one.tab === params.get("tab")) ? (params.get("tab") as Tab) : "signin";
  return (
    <Page width={900}>
      <PageHead title="Box settings" lede="What this gateway is set to, for every organization on it." />
      <Tabs label="Box settings" tabs={TABS} on={tab} onPick={(picked) => setParams(picked === "signin" ? {} : { tab: picked })} />
      {tab === "signin" && <SettingsSignIn />}
      {tab === "email" && <SettingsEmail />}
      {tab === "brand" && <SettingsBrand />}
    </Page>
  );
}

/** What a tab draws when the gateway predates its door: one quiet line, and nothing to fill in. */
export function NoSuchDoor(): ReactNode {
  return (
    <Card>
      <Empty>This gateway does not have this door yet.</Empty>
    </Card>
  );
}
