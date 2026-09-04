# Euterpe

Hum a melody. Your own ChatGPT, in the same window, is the producer beside you.

Euterpe is a GarageBand-like music maker built for
[WebMCP](https://webmachinelearning.github.io/webmcp/): every musical capability the app has -
the key, the chords, the parts, the arrangement, the mix, the export - is a tool the browser's
agent can call while you play, sing and listen. It is not a song generator. The sound comes from
sampled and synthesised instruments driven by notes, the agent reasons about theory and structure
through 29 tools, and every change it makes carries one sentence on why, pinned to the bars it
changed and undoable with them.

A captured hum is evidence, not an instruction to copy a noisy transcript. `get_take` returns its
rough notes with the key, chords, section and neighbouring parts; the agent offers two or three
readings with a musical reason for each; the person auditions and chooses. Nothing reaches the
track before that choice, and every take proposal gets a card labelled "None of these — keep what
I sang" that commits the untouched take.

Built for the WebMCP Challenge (OpenAI, Devpost), deadline 4 Sep 2026 04:00 GMT+8. MIT licensed.

## Try it

Live: **https://euter.pages.dev**

The page opens empty: eight bars at 92 bpm in C major, with one empty Melody track selected and
armed for Record. Start with a hum, the Musical Typing keys or an imported voice memo. To hear the
original First Light demo immediately, click **Load the example** on the empty page or open the
shareable URL **https://euter.pages.dev/?example=1**.

Two surfaces, both first-class. The steps below are what was actually measured, not what the
documentation promises.

### The ChatGPT desktop app

1. Open the URL in the app's built-in browser (Ctrl+Shift+B) and allow the site. Measured on the
   Linux build 26.820.60940 with GPT-5.6 Sol; Terra works the same way.
2. **Press Record or a key once** to begin your own song, or load the example and press Play. The
   audio context is created by your click, so `play` answers `AUDIO_LOCKED` until you have.
3. **Name the tab in your prompt**: "in the tab I have open". A bare chat answered "the ping tool
   isn't available in this session" until the prompt named the open tab, and a prompt that said
   "open this URL" made the agent use a tab of its own while the visible page never moved
   (day-one check 0).
4. Type or dictate one of the lines below. On this build the app's Voice control is dictation into
   the composer - you speak, the transcript appears, you press send (check 5). The calls land in
   the app's activity strip as they run.

This build has no "Site tools" badge in the address bar; discovery is the agent's, not a control
you press. The header reads `Agent tools: ready (29)` when the page has registered.

### Chrome 151 or later

1. Enable `chrome://flags/#enable-webmcp-testing` and relaunch, or rely on the origin-trial token
   the page already serves. `chrome://version` then shows `--enable-features=WebMCPTesting`.
2. DevTools > Application > WebMCP lists the 29 tools and runs any of them; the Model Context Tool
   Inspector extension works too. `pnpm e2e` drives the same surface unattended.
3. Press Record or a key once, or load the example and press Play, for the same reason as above.

Without a microphone, drop a voice memo on the take panel or choose a file - a recording, an
import and a played take are the same object to the rest of the app.

## What you can say

Eight lines for the core demo flow, with the tool sequences the end-to-end harness replays for
them. `pnpm e2e` invokes those WebMCP tools directly; it does not send the prose to ChatGPT, so the
model's choice of tools remains an operator check. The direct calls below ran against the built
bundle and https://euter.pages.dev on 28 Aug 2026. The other scenarios bring the total to all 29
registered tools.

| #   | Say                                                                                                       | Calls, and what came back                                                                                                                                                                                                                                          |
| --- | --------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | After loading the example: "Read the song and tell me what I have so far."                                | `get_song_state` → `First Light: 8 bars, 92 bpm, C major, 4 tracks` (955 characters, revision unchanged). On the empty page it instead says there are no notes yet and suggests humming, playing the keys or importing. `get_track_notes` pages one track's notes. |
| 2   | "That's the tune. Find the key, give me chords and a laid-back beat, and tell me why each part is there." | `set_key` → `Set key to C major` (r2), `suggest_chords` → `4 lofi chords for bars 1-4 in C major` (no edit), `set_chords` → `Set 2 chords in bars 3-4` (r5), `generate_part` → `Generated lofi drums in bars 1-8` (r6).                                            |
| 3   | "Give me two ways to harmonise the verse and play the second one."                                        | `propose_options` → two cards (r3); `audition_option` → `Playing "Lift it" over bars 1-4. Nothing is committed until it is chosen.` The song's chords were still C and F while it played; the person's Choose click made them Am7 and Fmaj7 (r4).                  |
| 4   | "Ask me to hum the bassline for the chorus."                                                              | `request_take` → `Requested a take for bars 5-8` (r7); the banner "Hum me a bassline for the chorus" appears over those bars and arms them for Record.                                                                                                             |
| 5   | "Help me hear what I meant before we commit the hum."                                                     | `get_take` → the rough notes in musical context; `propose_options {kind: "take"}` → two readings plus the automatic raw card; `audition_option` changes nothing; the person's Choose commits through the take path.                                                |
| 6   | "Make it a verse, then an eight-bar chorus that lifts, and play from the chorus."                         | `arrange` → `Arranged 2 sections across 12 bars` (r10), `generate_part` → `Generated lofi chords in bars 1-8` (r11), `play` → `Playing from bar 5`.                                                                                                                |
| 7   | "The bass is too busy - take that back and pull it down a few dB."                                        | `undo` → `Undid Generated lofi chords in bars 1-8` (r12; undo is itself a step forward), `set_mix` → `Updated the mix for Bass` (r15).                                                                                                                             |
| 8   | "Export it as an MP3."                                                                                    | `render` → a job id at once, `get_job` polls until `mp3 is ready: first-light.mp3`, with its duration, peak dBFS and the link the person clicks in the export panel.                                                                                               |

## Measured in the ChatGPT desktop app

Generated from [`src/content/day-one-checks.md`](src/content/day-one-checks.md), which the
operator filled by hand on 27 Aug 2026 and which the in-app About panel renders verbatim.

| Field                                              | Value                                                                                                                      |
| -------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| Date and time (GMT+8)                              | 27 Aug 2026, 18:45-19:05                                                                                                   |
| App version                                        | ChatGPT for Linux, "Powered by Codex & OWL", 26.820.60940 (released 26 Aug 2026)                                           |
| Model                                              | GPT-5.6 Sol, Extra High                                                                                                    |
| `navigator.userAgent`                              | `Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36`                    |
| `userAgentData.brands`                             | Not=A?Brand 99, Google Chrome 151, Chromium 151                                                                            |
| Site tools discovered and called                   | PASS - from the chat, on the tab the person had open                                                                       |
| Microphone                                         | PASS - prompted, meter moved, `granted` and still granted after a reload                                                   |
| Audio playback                                     | PASS - the context was already `running` before the first click on this build; `AUDIO_LOCKED` still guards Chrome          |
| WebMIDI                                            | Not available - `denied` before any click and no device on the machine; MIDI in is Chrome-only for the demo                |
| `document.modelContext` / `navigator.modelContext` | Both present, and **two distinct objects** here (one object in Chrome 151), so the registry's dedupe path is exercised     |
| Voice                                              | Dictation - speak, the transcript appears, press send; the dictated turn called a tool in 21 s                             |
| Output size                                        | PASS - the agent quoted a field from the end of a 1,400-character payload exactly                                          |
| Response headers from `fetch("/")`                 | `Permissions-Policy: tools=(self), microphone=(self), midi=(self)`, `Origin-Agent-Cluster: ?1`, origin-trial token present |

## The tools

Twenty-nine tools on `document.modelContext`, six of them reads (`readOnlyHint: true`), seventeen
marked `untrustedContentHint: true` because their output can echo text the person typed.

| Group       | Tools                                                                                     |
| ----------- | ----------------------------------------------------------------------------------------- |
| Orientation | `get_song_state` (read), `get_track_notes` (read), `get_chords` (read), `get_take` (read) |
| Capture     | `start_recording`, `stop_recording`, `commit_take`                                        |
| Composition | `set_notes`, `set_chords`, `suggest_chords` (read)                                        |
| Teaching    | `propose_options`, `audition_option`, `request_take`                                      |
| Song        | `set_key`, `set_tempo`, `set_quantize`, `tune_vocal`                                      |
| Arrangement | `add_track`, `set_instrument`, `set_mix`, `generate_part`, `arrange`                      |
| Transport   | `play`, `stop`                                                                            |
| History     | `undo`, `redo`                                                                            |
| Jobs        | `render`, `get_job` (read), `cancel_job`                                                  |

Every write takes `why` (one sentence, pinned to the change as a producer note) and an optional
`expected_revision`, and returns `{ok, revision, changed, summary, data}`; failures come back as
data - `{ok: false, code, message, recoverable}` with codes `INVALID_ARGUMENT`, `STALE_REVISION`,
`TRACK_NOT_FOUND`, `TAKE_NOT_FOUND`, `OUT_OF_RANGE`, `AUDIO_LOCKED`, `MIC_DENIED`,
`RECORDING_IN_PROGRESS`, `JOB_NOT_FOUND`, `RESULT_TOO_LARGE`, `CANCELLED`, `INTERNAL`. Every one of
those twelve codes is provoked once in
[`tests/e2e/scenarios/errors.json`](tests/e2e/scenarios/errors.json).

## How WebMCP is implemented

- **Registration** ([`src/webmcp/registry.ts`](src/webmcp/registry.ts)): each tool is built from a
  zod schema ([`schemas.ts`](src/webmcp/schemas.ts), exported as JSON Schema with
  `additionalProperties: false`) and its description
  ([`descriptions.ts`](src/webmcp/descriptions.ts)), registered on `document.modelContext` **and**
  `navigator.modelContext` with one `AbortController` each, deduplicated, and aborted on dispose.
  Both are registered because the ChatGPT desktop app exposes them as two distinct objects while
  Chrome 151 aliases them and warns that `navigator.modelContext` is deprecated. The header shows
  `initialising | ready (29) | unavailable | error`.
- **Descriptions state capability, precondition and result** and never direct the agent: a
  description that can steer policy is a metadata-poisoning surface. A next step belongs in the
  result - `data.next` or the summary. A whole-surface test rejects agent-directed wording and the
  500-character budget.
- **One document, one bus** ([`src/song/`](src/song), [`src/webmcp/bus.ts`](src/webmcp/bus.ts)):
  every mutation - agent or person - is a command; the reducer validates and applies it atomically,
  bumps a monotonic `revision` and emits `{changed, summary, target_bars}`. `expected_revision` is
  honoured with `STALE_REVISION` **and a summary of what has happened since**, so the agent can
  re-read rather than guess.
- **A serialised queue** ([`src/webmcp/queue.ts`](src/webmcp/queue.ts)): one promise chain for every
  tool call; a human drag on the piano roll holds agent commands for up to a second; recording locks
  the recorded track and only that track.
- **The graph follows the document** ([`src/audio/reconciler.ts`](src/audio/reconciler.ts)): tools
  never touch Tone. `play` and `stop` go through the transport; `audition_option` plays a preview
  document so an option can be heard without moving `revision`.
- **Jobs** ([`src/audio/jobs.ts`](src/audio/jobs.ts)): `render` returns a `job_id` at once, `get_job`
  polls, the person clicks the download link, and `options.signal` cancels the job.
- **Visible** ([`src/ui/`](src/ui)): the activity strip lists every command with its source, summary
  and `why`, each with its own undo; the producer-notes rail reads the song's reasoning in song
  order; every result's `target_bars` scrolls and flashes the roll; the diagnostics panel reports
  the browser, both context objects, audio, microphone, MIDI, the origin-trial token and the last
  twenty tool calls; the About panel carries the licence, the pinned versions, the measurements
  above and where the sounds came from.

## Prior art

Agent-driven music tools exist, and none of them is this. OpenAI's showcase has
[**Fieldwork // 12**](https://developers.openai.com/showcase/ko-field-beat-machine), a WebMCP beat
machine with 26 tools over one 12 x 16 pattern and no microphone.
[**LeanMCP Music Composer**](https://github.com/Leanmcp-Community/music-composer-webmcp) puts a
piano roll behind 23 tools but runs the model _inside_ the page through its own gateway rather than
the browser's agent, and ships no licence. [**Amped Studio's Hum &
Beatz**](https://ampedstudio.com/manual/hum-beatz/) converts a hum to MIDI in a browser, manually
and once, with no arranger. **WavTool**'s "Conductor" was the closest consumer precedent - typed
instructions that placed MIDI and could explain themselves - and it has been offline since Nov
2024 ([acquired by Suno](https://suno.com/blog/suno-acquires-wavtool)).
[**Hookpad Aria**](https://www.hooktheory.com/hookpad/aria) suggests chords and melodies inside a
closed songwriting sketchpad. [**`opendaw-mcp`**](https://pypi.org/project/opendaw-mcp/) drives a
browser DAW with 543 tools from a Python server through headless Playwright, with nobody watching
or listening. Desktop bridges such as
[**ableton-mcp**](https://github.com/ahujasid/ableton-mcp),
[**reaper-mcp**](https://github.com/bonfire-systems/reaper-mcp) and
[**WigAI**](https://github.com/fabb/WigAI) need an installed DAW and a local socket. None of these
hears the person in a browser tab, arranges that hum into sections on a timeline the person can
hear, or attaches the reason to the edit - and none is driven by the person's own agent through
the browser's own standard.

## Sounds and licences

Every sampled instrument, its source and its licence are in [`SAMPLES.md`](SAMPLES.md), with byte
counts and SHA-256 hashes in [`SAMPLES.manifest.json`](SAMPLES.manifest.json); the About panel
renders the same table.

- **Bundled** (447,103 B, 446,567 B gzipped): five Splendid Grand Piano notes (public domain) and
  four TR-808 one-shots (public domain). These ship in the repository and always sound.
- **Remote** (1,398,573 B across 21 objects): the electric piano, two more kits and the VCSL
  strings, vibraphone, recorder and saxello (CC0 1.0). They load from the R2 origin named by
  `VITE_SAMPLES_BASE_URL` **once the operator has run `pnpm samples -- --upload`**. Until then the
  app checks every expected sample object before handing the instrument to smplr. A missing object
  selects the bundled substitute and is named in the transport, the About panel and the completed
  render's `get_job` result.
- Salamander and gleitz samples are deliberately not used, so no CC BY attribution applies.

## Development

Node 22 ([`.nvmrc`](.nvmrc)) and pnpm 10 (`packageManager` in [`package.json`](package.json);
`corepack pnpm` picks it up).

```sh
pnpm install
pnpm dev              # Vite dev server on http://localhost:5173
pnpm lint && pnpm typecheck && pnpm test   # the gate before every commit
pnpm build            # tsc -b && vite build -> dist/ (with _headers)
pnpm preview:headers  # serves dist/ with the Cloudflare _headers rules on http://localhost:4173
```

Every file under `src/` has a test at the same path under `tests/`;
[`tests/mirror.test.ts`](tests/mirror.test.ts) fails when one is missing. In the browser console,
`window.euter` is the live runtime: `window.euter.bus` is the song, and
`window.euter.registry.invoke(name, input)` runs a tool exactly as the agent would.

### The end-to-end harness

`pnpm e2e` is the browser integration check and is **not** in the commit gate because it needs a
compatible Chrome with WebMCP enabled and performs real audio exports. It launches Chrome headed by
default on a throwaway profile pre-armed with
`enable-webmcp-testing`, connects an MCP stdio client to
`chrome-devtools-mcp --categoryExperimentalWebmcp=true`, and runs the JSON scenarios in
[`tests/e2e/scenarios/`](tests/e2e/scenarios) through `list_webmcp_tools` and
`execute_webmcp_tool`, asserting each envelope, each revision, the 1,500-character output budget,
and all 29 tool behaviours. Scenarios that depend on First Light declare an example start and the
harness reloads them through `?example=1`, so the product keeps its normal empty default without
making the demo setup click-dependent.

```sh
pnpm build && pnpm e2e                      # the local build; the harness starts the preview server
pnpm e2e --url https://euter.pages.dev      # the deployed site; it writes nothing there
pnpm e2e --scenario errors                  # one scenario
pnpm e2e --driver cdp                       # the CDP WebMCP domain instead of chrome-devtools-mcp
pnpm e2e --headless                         # supported by Chrome 152; headed remains the default
pnpm e2e --help                             # every flag
```

The seven scenarios are `demo` (the whole call order, from importing a hum to an MP3 and a ranged
MIDI file), `hum-intent` (a measured six-segment/four-note human take goes through context, two
auditionable readings, a chosen reading and the untouched raw escape), `errors` (every error code
provoked once), `stale-revision` (a person edits between two agent calls), `recording-lock` (one
track closed to edits while it is being sung), `take-backing` (the actual bar and mute state used
behind a bar-one requested take), and `sample-fallback` (a deliberate sample 404 selects a named
bundled substitute). Together they invoke all 29 tools. The unit test rejects missing or
assertion-free scenario entries, and a full run independently compares the registered surface with
tools that actually passed a behavioural assertion. `--driver mcp` is strict: it fails if
chrome-devtools-mcp cannot start, so a green default run is evidence for that route. `--driver cdp`
explicitly exercises the fallback route
(`WebMCP.enable`, `invokeTool`, `toolResponded`). The R2 CORS policy permits the deployed origin,
not localhost, so only a local-URL run adds `--disable-web-security` to its throwaway Chrome
profile; a deployed-URL run keeps browser CORS enforcement.

The day-one measurements are in
[`src/content/day-one-checks.md`](src/content/day-one-checks.md) and are read into the About
panel at build time.

## Licence

MIT ([`LICENSE`](LICENSE)). The mediabunny packages used for MP3 export are MPL-2.0 and
unmodified. Sample licences are in [`SAMPLES.md`](SAMPLES.md).
