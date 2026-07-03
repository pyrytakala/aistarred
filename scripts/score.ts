#!/usr/bin/env node
import { runScoreCli } from "../src/pipeline/score.js";

const code = await runScoreCli(process.argv.slice(2));
process.exit(code);
