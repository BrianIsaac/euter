#!/usr/bin/env node
/**
 * The end-to-end harness (plan Testing, "End-to-end"; Phases, 30 Aug lane C). Not in the commit
 * gate: it needs a headed Chrome with chrome://flags/#enable-webmcp-testing.
 *
 * When it lands on 30 Aug it will:
 *   1. launch Chrome with the WebMCP command-line switch and --remote-debugging-port, against
 *      the deployed or local URL (E2E_URL, default the preview-headers server on
 *      http://localhost:4173/). Measured on 27 Aug in Chrome 151.0.7922.173: enabling
 *      chrome://flags/#enable-webmcp-testing adds `--enable-features=WebMCPTesting` to the
 *      command line (chrome://version), and the flag persists in the profile's Local State as
 *      browser.enabled_labs_experiments: ["enable-webmcp-testing@1"], so a throwaway profile can
 *      be pre-armed without touching the UI;
 *   2. connect an MCP stdio client to chrome-devtools-mcp started with
 *      --categoryExperimentalWebmcp=true (landscape §2.5);
 *   3. run each scenario in tests/e2e/scenarios/*.json through list_webmcp_tools and
 *      execute_webmcp_tool, asserting the envelope of every step ({ok, revision, changed,
 *      summary, data} or {ok:false, code, message, recoverable}). Two calling conventions were
 *      measured on 27 Aug: the in-page document.modelContext.executeTool(tool, input) in
 *      Chrome 151 needs `input` as a JSON string (an object yields `{}` and never reaches the
 *      tool), while the CDP method WebMCP.invokeTool(frameId, toolName, input) needs `input` as
 *      an object (a string fails CBOR deserialisation);
 *   4. exit non-zero on the first failed assertion and print the call log.
 *
 * Scenarios: demo (import the fixture take, key, chords, parts, arrange, play, undo, render to
 * WAV and MIDI, poll to done), errors (every code provoked once), stale-revision (a set_notes
 * with a wrong expected_revision after a scripted human edit) and recording-lock.
 */
import { existsSync } from 'node:fs';

const chromeCandidates = [
  '/usr/bin/google-chrome',
  '/usr/bin/google-chrome-stable',
  '/usr/bin/chromium',
];
const chrome = chromeCandidates.find((candidate) => existsSync(candidate));

console.log('pnpm e2e: the harness lands on 30 Aug (plan Phases, 30 Aug lane C).');
console.log(
  `Chrome binary: ${chrome ?? 'not found in the usual places'}; switch: --enable-features=WebMCPTesting`,
);
console.log(`Target URL: ${process.env.E2E_URL ?? 'http://localhost:4173/ (default)'}`);
console.log(
  'Until then, day-one check 6 is the manual equivalent: DevTools > Application > WebMCP.',
);
process.exit(1);
