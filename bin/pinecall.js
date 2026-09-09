#!/usr/bin/env node
// The bin a package manager links at install time, before any dist exists — which is exactly when
// `pnpm install` runs in a fresh checkout. It only has to be there; the CLI itself is compiled
// into dist/cli/index.js, and this hands the argv over and leaves with its answer.
import { main } from "../dist/cli/index.js";

process.exitCode = await main(process.argv.slice(2));
