# Euter

A GarageBand-like music maker as a web app, built for a person and their agent
to make a song together through [WebMCP](https://webmachinelearning.github.io/webmcp/).
Hum or sing a line, talk it through with ChatGPT in the same window, and watch
the tracks, chords and arrangement take shape in the app. Not a song generator:
an instrument and a producer beside you, for people making their first song.

Built for the WebMCP Challenge (OpenAI, Devpost), deadline 4 Sep 2026 04:00
GMT+8.

Research and plans live under `docs/`.

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

Every file under `src/` has a test at the same path under `tests/`; `tests/mirror.test.ts` fails when one is missing. Hosting steps are in `docs/research/hosting-setup.md`; the day-one measurements go in `docs/research/day-one-checks.md`.
