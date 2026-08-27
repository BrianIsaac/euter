# Euterpe

Hum a melody. Your own ChatGPT, in the same window, is the producer beside you.

Euterpe is a GarageBand-like music maker built for
[WebMCP](https://webmachinelearning.github.io/webmcp/): every musical capability the app has -
the key, the chords, the parts, the arrangement, the mix, the export - is a tool the browser's
agent can call while you play, sing and listen. It is not a song generator. The sound comes from
sampled and synthesised instruments driven by notes, the agent reasons about theory and structure
through 28 tools, and every change it makes carries one sentence on why, pinned to the bars it
changed and undoable with them.

Built for the WebMCP Challenge (OpenAI, Devpost), deadline 4 Sep 2026 04:00 GMT+8. MIT licensed.

## Try it

Live: **https://euter.pages.dev**

Two surfaces, both first-class:

- **ChatGPT desktop app.** Open the URL in the built-in browser (Ctrl+Shift+B) in a GPT-5.6 Sol or
  Terra chat and allow the site. The address bar's Site tools badge lists 28 tools, 6 of them
  reads. Type or dictate one of the lines below; the calls appear in the activity strip as they
  land.
- **Chrome 149 or later.** Enable `chrome://flags/#enable-webmcp-testing` and relaunch, or rely on
  the origin trial that ships in the page. DevTools > Application > WebMCP lists the tools and
  runs them; the Model Context Tool Inspector extension works too.

Press Play, Record or any key once before asking for playback: the audio context is created by
your click, so `play` answers `AUDIO_LOCKED` until you have. Without a microphone, drop a voice
memo on the take panel or choose a file - a recording, an import and a played take are the same
object to the rest of the app.

## What you can say

Eight lines that exercise the whole surface, drafted from the tool descriptions:

1. "Read the song and tell me what I have so far." (`get_song_state`, `get_track_notes`)
2. "That's the tune. Find the key, give me chords and a laid-back beat, and tell me why each part
   is there." (`set_key`, `suggest_chords`, `set_chords`, `generate_part`)
3. "Give me two ways to harmonise the verse and play the second one." (`propose_options`,
   `audition_option`)
4. "Ask me to hum the bassline for the chorus." (`request_take`, then Record in the app)
5. "Commit my take onto the melody and tighten the timing a little." (`commit_take`,
   `set_quantize`)
6. "Make it a verse, then an eight-bar chorus that lifts, and play from the chorus." (`arrange`,
   `generate_part`, `play`)
7. "The bass is too busy - take that back and pull it down a few dB." (`undo`, `set_mix`)
8. "Export it as an MP3." (`render`, `get_job`, then the link in the export panel)

## The tools

Twenty-eight tools on `document.modelContext`, six of them reads (`readOnlyHint: true`).

| Group       | Tools                                                                                     |
| ----------- | ----------------------------------------------------------------------------------------- |
| Orientation | `get_song_state` (read), `get_track_notes` (read), `get_chords` (read), `get_take` (read) |
| Capture     | `start_recording`, `stop_recording`, `commit_take`                                        |
| Composition | `set_notes`, `set_chords`, `suggest_chords` (read)                                        |
| Teaching    | `propose_options`, `audition_option`, `request_take`                                      |
| Song        | `set_key`, `set_tempo`, `set_quantize`                                                    |
| Arrangement | `add_track`, `set_instrument`, `set_mix`, `generate_part`, `arrange`                      |
| Transport   | `play`, `stop`                                                                            |
| History     | `undo`, `redo`                                                                            |
| Jobs        | `render`, `get_job` (read), `cancel_job`                                                  |

Every write takes `why` (one sentence, pinned to the change as a producer note) and an optional
`expected_revision`, and returns `{ok, revision, changed, summary, data}`; failures come back as
data - `{ok: false, code, message, recoverable}` with codes `INVALID_ARGUMENT`, `STALE_REVISION`,
`TRACK_NOT_FOUND`, `TAKE_NOT_FOUND`, `OUT_OF_RANGE`, `AUDIO_LOCKED`, `MIC_DENIED`,
`RECORDING_IN_PROGRESS`, `JOB_NOT_FOUND`, `RESULT_TOO_LARGE`, `CANCELLED`, `INTERNAL`.

## How WebMCP is implemented

- **Registration** (`src/webmcp/registry.ts`): each tool is built from a zod schema
  (`schemas.ts`, exported as JSON Schema with `additionalProperties: false`) and its description
  (`descriptions.ts`), registered on `document.modelContext` and `navigator.modelContext` with one
  `AbortController` each, deduplicated, and aborted on dispose. The header shows
  `initialising | ready (28) | unavailable | error`.
- **One document, one bus** (`src/song/`, `src/webmcp/bus.ts`): every mutation - agent or person -
  is a command; the reducer validates and applies it atomically, bumps a monotonic `revision` and
  emits `{changed, summary, target_bars}`. `expected_revision` is honoured with `STALE_REVISION`
  and a summary of what has happened since.
- **A serialised queue** (`src/webmcp/queue.ts`): one promise chain for every tool call; a human
  drag on the piano roll holds agent commands for up to a second; recording locks the recorded
  track.
- **The graph follows the document** (`src/audio/reconciler.ts`): tools never touch Tone. `play`
  and `stop` go through the transport; `audition_option` plays a preview document so an option can
  be heard without moving `revision`.
- **Jobs** (`src/audio/jobs.ts`): `render` returns a `job_id` at once, `get_job` polls, the person
  clicks the download link, and `options.signal` cancels the job.
- **Visible** (`src/ui/`): the activity strip lists every command with its source, summary and
  `why`, each with its own undo; the producer-notes rail reads the song's reasoning in song order;
  every result's `target_bars` scrolls and flashes the roll; the diagnostics panel reports the
  browser, both context objects, audio, microphone, MIDI, the origin-trial token and the last
  twenty tool calls.

## Development

Node 22 (`.nvmrc`) and pnpm 10 (`packageManager` in `package.json`; `corepack pnpm` picks it up).

```sh
pnpm install
pnpm dev              # Vite dev server on http://localhost:5173
pnpm lint && pnpm typecheck && pnpm test   # the gate before every commit
pnpm build            # tsc -b && vite build -> dist/ (with _headers)
pnpm preview:headers  # serves dist/ with the Cloudflare _headers rules on http://localhost:4173
pnpm e2e              # the WebMCP end-to-end harness (lands 30 Aug)
```

Every file under `src/` has a test at the same path under `tests/`; `tests/mirror.test.ts` fails
when one is missing. In the browser console, `window.euter` is the live runtime: `window.euter.bus`
is the song, `window.euter.registry.invoke(name, input)` runs a tool exactly as the agent would.

Research and plans live under `docs/`. Hosting steps are in `docs/research/hosting-setup.md`; the
day-one measurements go in `docs/research/day-one-checks.md` and are read into the About panel at
build time. Sample sources and licences are in `SAMPLES.md`.

## Licence

MIT (`LICENSE`). The mediabunny packages used for MP3 export are MPL-2.0 and unmodified.
