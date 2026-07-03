#!/usr/bin/env node
import { runFetch } from "../src/pipeline/fetch.js";

const code = await runFetch(process.argv.slice(2));
process.exit(code);
