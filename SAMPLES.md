# Samples and codec licences

Euterpe's bundled subset is one public-domain piano and one public-domain drum kit. The current
bundled files total 447,103 B (446,567 B gzipped), below
the 4 MB gzipped ceiling. The remote pack totals 1,398,573 B. All other sampled
instruments are prepared for the public R2 sample origin. Synth bass and pad are the two deliberate
Tone.js exceptions to the sampled catalogue. Files are fetched from the named upstream source,
normalised to Opus and recorded with byte counts and SHA-256 hashes in `SAMPLES.manifest.json` by
`scripts/fetch-samples.ts`.

| Source                                              | Licence       | Prepared bytes | Upstream asset example                                                                                                                           |
| --------------------------------------------------- | ------------- | -------------: | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| Splendid Grand Piano (Akai, smpldsnds distribution) | Public domain |      436,889 B | https://smpldsnds.github.io/sfzinstruments-splendid-grand-piano/samples/Mf%20C6.ogg                                                              |
| Roland TR-808 pack (smpldsnds)                      | Public domain |       10,214 B | https://smpldsnds.github.io/drum-machines/TR-808/hihat-open/oh50.ogg                                                                             |
| Yamaha MR10 pack (smpldsnds)                        | Public domain |        9,413 B | https://smpldsnds.github.io/drum-machines/Yamaha-MR10/ohihat.ogg                                                                                 |
| Roland CR-8000 pack (smpldsnds)                     | Public domain |        9,730 B | https://smpldsnds.github.io/drum-machines/Roland-CR-8000/hihat-open.ogg                                                                          |
| VCSL TX81Z FM Piano                                 | CC0 1.0       |      274,004 B | https://smpldsnds.github.io/sgossner-vcsl/Electrophones/TX81Z/FM%20Piano/FMPiano_C5_vl2.ogg                                                      |
| VCSL bowed psaltery                                 | CC0 1.0       |      290,792 B | https://smpldsnds.github.io/sgossner-vcsl/Chordophones/Zithers/Psaltery%2C%20Bowed%20and%20Plucked/LongBow/BowedPsaltery_C5_Main_LongBow_rr1.ogg |
| VCSL vibraphone, hard mallets                       | CC0 1.0       |      188,865 B | https://smpldsnds.github.io/sgossner-vcsl/Idiophones/Struck%20Idiophones/Vibraphone/Hard%20Mallets/Vibes_hard_C5_v2_rr1_Main.ogg                 |
| VCSL baroque alto recorder                          | CC0 1.0       |      358,323 B | https://smpldsnds.github.io/sgossner-vcsl/Aerophones/Edge-blown%20Aerophones/Baroque%20Alto%20Recorder/Sustain/AltRecorder_Sus_C5_rr1_Main.ogg   |
| VCSL Saxello                                        | CC0 1.0       |      267,446 B | https://smpldsnds.github.io/sgossner-vcsl/Aerophones/Reed%20Aerophones/Saxello/Non-Vibrato/BrettSaxello_SusNV_MainSpirit_E5_vl2_rr2.ogg          |

Splendid Grand Piano is used under its public-domain dedication. The VCSL assets are CC0 1.0.
The selected smpldsnds drum-machine packs are public domain. Salamander/gleitz samples are not
used, so their CC BY 3.0 attribution requirement does not apply.

## Fetch and R2 upload

`pnpm samples -- --bundled-only` refreshes only the committed subset.
`pnpm samples` also prepares the remote catalogue in `samples-dist/` but does not claim an
upload. `pnpm samples -- --dry-run` prepares and lists every object, byte size and the total
without credentials or a network mutation. `pnpm samples -- --upload` uploads those remote files
through R2's S3 API with `Cache-Control: public, max-age=31536000, immutable` after all four
variables below are present in the gitignored `.env.local` or process environment:

- `R2_ACCOUNT_ID`
- `R2_ACCESS_KEY_ID`
- `R2_SECRET_ACCESS_KEY`
- `R2_BUCKET`

The bucket value is `euter-samples`. The upload refuses a prepared directory over 1 GB, then uses
rclone's S3 backend against the account's Cloudflare R2 endpoint. Missing credentials stop the
upload before any network mutation. Playback uses
`VITE_SAMPLES_BASE_URL=https://pub-6577ff8ba87b4d7e863a12dce1501192.r2.dev`.

## Export codecs

Tone.js and smplr are MIT. MIDI export uses @tonejs/midi (MIT), WAV export uses
audiobuffer-to-wav (MIT), and MP3 export uses mediabunny with @mediabunny/mp3-encoder. Those
packages are consumed unmodified under MPL-2.0; the extension's embedded LAME encoder is LGPL.
