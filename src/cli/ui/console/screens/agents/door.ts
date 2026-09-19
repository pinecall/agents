/** The Overview's own doors: the processes holding the org's agents, and stopping one. */

import { AppListSchema, AppStoppedSchema, type AppProcess } from "@pinecall/protocol";

import { post, read, type Credentials } from "../../../shared/api";

/** Every app connected in this console's world, oldest connection first. */
export async function readProcesses(credentials: Credentials): Promise<AppProcess[]> {
  return AppListSchema.parse(await read(credentials, "/v1/apps")).apps;
}

/** Close one app's socket with the stop code: a pinecall that hears it exits instead of dialling back. */
export async function stopProcess(credentials: Credentials, app: string): Promise<void> {
  AppStoppedSchema.parse(await post(credentials, `/v1/apps/${encodeURIComponent(app)}/stop`, {}));
}
