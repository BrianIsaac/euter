# Day-one checks (27 Aug 2026)

Measured by the operator in the ChatGPT desktop app's built-in browser and in Chrome, against the deployed probe page (plan, Day-one checks). This file is read into the About panel at build time and the README's "Measured in the ChatGPT desktop app" section is generated from it. Fill every Result cell; leave nothing implied.

## Build

| Field | Value |
| --- | --- |
| Probe URL | https://euter.pages.dev (lane C probe build, origin-trial token present) |
| App version (About panel) | Euterpe probe build (lane C, 27 Aug) |
| Date and time (GMT+8) | 27 Aug 2026, 18:45-19:05 |
| ChatGPT desktop app version (Settings > About) | ChatGPT for Linux, "Powered by Codex & OWL", Version 26.820.60940, released 26 Aug 2026 |
| ChatGPT model used | GPT-5.6 Sol, Extra High |
| `navigator.userAgent` in the built-in browser (Diagnostics > Identity) | Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36 |
| `userAgentData.brands` in the built-in browser | Not=A?Brand 99, Google Chrome 151, Chromium 151 |
| Chrome version used for check 6 (`chrome://version`) | Google Chrome 151.0.7922.173 (the installed build; lane C's account) |
| Chrome command-line switch for WebMCP (`chrome://version`, "Command Line") | --enable-features=WebMCPTesting (via chrome://flags/#enable-webmcp-testing; lane C's account) |

## Checks

| # | Check | Procedure | Pass condition | Result |
| --- | --- | --- | --- | --- |
| 0 | Site tools appear and run | In the desktop app, open the probe URL in the built-in browser (Ctrl+Shift+B). Click "Site tools" in the address bar; expect "Available site tools (2), 1 read, 1 write". In a GPT-5.6 Sol or Terra chat: "Call ping with message hello and tell me the revision." Then open Diagnostics and read the last tool calls. | Tool called; envelope shown; "Recently used" lists it; Diagnostics lists the call | PASS. Site tools discovered and called from the chat on the tab the person has open: `ping {message: hello}` -> `{ok:true, revision:1, changed:[revision], summary:"ping: hello"}`; the page header went r0 -> r1 and the Activity strip showed `r1 AGENT ping: hello`. Two notes for the README: (a) a plain chat with no browser in scope answered "the ping tool isn't available in this session" - the agent must be told to use the open tab; (b) told to "open" the URL it used a tab of its own (the visible tab stayed r0), told "in the tab I have open" it used the visible tab. No Site tools badge exists in this build's address bar (only Annotate and the browser menu); discovery is by the agent, not a UI control. |
| 1 | Microphone | Diagnostics > Microphone > "Test microphone". Note whether a permission prompt appeared, whether the meter moves when you speak, the permission state, and the error name if any. Reload and check the permission state persists. | Stream obtained, meter moves, state `granted` after reload | PASS. "Test microphone" prompted, the meter moved with speech, permission state `granted`, result `open: Default`; after a reload the state remained `granted`. The June 2026 Codex bug (openai/codex #30663) does not apply to this build: the hum can be recorded in the ChatGPT desktop app. |
| 2 | Audio playback | Diagnostics > Audio. Copy "Before the first click". Click "Play test tone". Copy "After the click". | `suspended` before (or `running` if Electron's autoplay policy is loose), `running` after; the tone is audible | PASS. Before the first click the context was already `running` (48000 Hz, base 10.7 ms, output 0.0 ms) - Electron's autoplay policy is loose in this build; after "Play test tone" `running`, output 40.0 ms, tone audible. Keep the gesture-created context and AUDIO_LOCKED path for Chrome, where it starts `suspended`. |
| 3 | WebMIDI | Diagnostics > MIDI > "Test MIDI" with a keyboard connected if one exists. Note prompt, resolution, input count and names. | Resolves; a connected keyboard appears | NOT AVAILABLE. Permission state `denied` before any click and no MIDI device on this machine; not tested further. MIDI in is Chrome-only for the demo; Musical Typing and the on-screen keys stand in. |
| 4 | Engine and identity | Diagnostics > Identity and WebMCP. Copy `navigator.userAgent`, `userAgentData.brands`, `document.modelContext`, `navigator.modelContext`, "Same object", secure context, `window.originAgentCluster`. | A Chromium 148-152 string recorded; both context objects present | PASS. userAgent Chrome/151.0.0.0 on X11 Linux; brands Not=A?Brand 99, Google Chrome 151, Chromium 151; `document.modelContext` yes, `navigator.modelContext` yes, **same object: no** (two objects - the registry's dedupe path is exercised here, unlike Chrome 151 where they are one object); secure context yes; `window.originAgentCluster` yes; registry `ready (2)`; origin-trial token present. |
| 5 | Voice to site tool | If ChatGPT Voice exists on this Linux build: start a voice chat, say "Start a task: open <probe URL> in the browser and call ping with message hello". Time from the end of speech to the narrated result. Repeat three times. | Works three times, median under 20 s, no manual step | DICTATION. On this Linux build the app's Voice control is speech-to-text into the composer: the person speaks, the transcript appears, the person presses send. The dictated task "Start a task in the browser tab I open, call the site to ping with message hello and tell me the revision" ran as a normal chat turn, called `ping` in the open tab and reported revision 1 in 21 s. No hands-free voice-to-tool hop exists here; the demo's talk path is dictation, shown as such. |
| 6 | Chrome flag path | Chrome with `chrome://flags/#enable-webmcp-testing` enabled and relaunched. Open the probe URL. DevTools > Application > WebMCP: both tools listed. "Run tool" on `ping` with `{"message":"hello"}`. Copy the command-line switch from `chrome://version`. | Both tools listed; `ping` returns `{ok:true, revision, changed, summary, data}` | PASS. Chrome 151 with the flag: DevTools > Application > WebMCP lists `get_diagnostics` and `ping`; "Run tool" on `ping` with `{message: hello}` completed (1 total call, 0 failed) and the page showed r1 with the call in Activity. |
| 7 | Output size | In the ChatGPT chat: "Call get_diagnostics and quote the tail_marker field exactly." | The agent quotes `EUTERPE-TAIL-7F3A`; the payload is 1,400 characters | PASS. The agent quoted `tail_marker: "EUTERPE-TAIL-7F3A"` exactly from the 1,400-character payload. |

## Headers and token (Diagnostics > WebMCP and Response headers)

| Field | Value |
| --- | --- |
| Permissions-Policy as returned by fetch("/") | tools=(self), microphone=(self), midi=(self) |
| Origin-Agent-Cluster as returned by fetch("/") | ?1 |
| Origin-trial token present | yes (AlbA1e7yyVqU...) |

## Notes

- Anything unexpected, with the exact text on screen.
- The app is the ChatGPT desktop app for Linux with the Codex workspace open in it; the chat model was GPT-5.6 Sol. Check 0's first attempt answered "The ping tool isn't available in this session" until the prompt named the open tab.
- Consequences for the plan: the hum shot is filmed in the ChatGPT desktop app (check 1 passed); the talk path is dictation (check 5); MIDI in is documented as Chrome-only (check 3); `document.modelContext` and `navigator.modelContext` are distinct objects in this build (check 4), so the dual registration with dedupe stays.

## Re-running these against the product (28 Aug)

The results above were measured against the 27 Aug **probe** build, whose two tools
(`get_diagnostics`, `ping`) were removed on 28 Aug when the twenty-eight product tools landed
(lane C's 28 Aug account). Nothing in the panel changed: checks 1-5 and the headers section run
exactly as written. Three procedures need the product's tools instead of the probe's:

| # | Procedure against the product | Pass condition |
| --- | --- | --- |
| 0 | In the chat, naming the tab that is open: "Read the song state in the tab I have open and tell me the key, the tempo and how many tracks there are." | `get_song_state` is called; the envelope is shown; Diagnostics lists the call; the header reads "Agent tools: ready (29)" |
| 6 | Chrome with the flag: DevTools > Application > WebMCP lists 29 tools; "Run tool" on `set_tempo` with `{"bpm":96,"why":"A touch faster."}` | The envelope comes back `ok:true`, the header revision moves and the Activity strip shows the call with its reason |
| 7 | In the chat: "Call get_song_state and quote the audio and jobs fields exactly." Those two fields are last in the payload, which runs to about 1,100 characters. | The agent quotes them; nothing near the end is missing |

Check 0's finding still holds and is the more important one: the agent must be told to use the tab
the person has open, or it opens a tab of its own and the person watches an unchanged page.
