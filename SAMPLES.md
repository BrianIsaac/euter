# Samples and codec licences

Euterpe's bundled subset is one public-domain piano and one public-domain drum kit. The current
bundled files total under 4 MB; all other sampled instruments are prepared for the public R2
sample origin. Synth bass and pad are the two deliberate Tone.js exceptions to the sampled
catalogue. Files are fetched from the named upstream source and normalised to Opus by
`scripts/fetch-samples.ts`.

| Source                                              | Licence       | Upstream asset example                                                                                                                           |
| --------------------------------------------------- | ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| Splendid Grand Piano (Akai, smpldsnds distribution) | Public domain | https://smpldsnds.github.io/sfzinstruments-splendid-grand-piano/samples/Mf%20C6.ogg                                                              |
| Roland TR-808 pack (smpldsnds)                      | Public domain | https://smpldsnds.github.io/drum-machines/TR-808/hihat-open/oh50.ogg                                                                             |
| Yamaha MR10 pack (smpldsnds)                        | Public domain | https://smpldsnds.github.io/drum-machines/Yamaha-MR10/ohihat.ogg                                                                                 |
| Roland CR-8000 pack (smpldsnds)                     | Public domain | https://smpldsnds.github.io/drum-machines/Roland-CR-8000/hihat-open.ogg                                                                          |
| VCSL TX81Z FM Piano                                 | CC0 1.0       | https://smpldsnds.github.io/sgossner-vcsl/Electrophones/TX81Z/FM%20Piano/FMPiano_C5_vl2.ogg                                                      |
| VCSL bowed psaltery                                 | CC0 1.0       | https://smpldsnds.github.io/sgossner-vcsl/Chordophones/Zithers/Psaltery%2C%20Bowed%20and%20Plucked/LongBow/BowedPsaltery_C5_Main_LongBow_rr1.ogg |
| VCSL vibraphone, hard mallets                       | CC0 1.0       | https://smpldsnds.github.io/sgossner-vcsl/Idiophones/Struck%20Idiophones/Vibraphone/Hard%20Mallets/Vibes_hard_C5_v2_rr1_Main.ogg                 |
| VCSL baroque alto recorder                          | CC0 1.0       | https://smpldsnds.github.io/sgossner-vcsl/Aerophones/Edge-blown%20Aerophones/Baroque%20Alto%20Recorder/Sustain/AltRecorder_Sus_C5_rr1_Main.ogg   |
| VCSL Saxello                                        | CC0 1.0       | https://smpldsnds.github.io/sgossner-vcsl/Aerophones/Reed%20Aerophones/Saxello/Non-Vibrato/BrettSaxello_SusNV_MainSpirit_E5_vl2_rr2.ogg          |

Splendid Grand Piano is used under its public-domain dedication. The VCSL assets are CC0 1.0.
The selected smpldsnds drum-machine packs are public domain. Salamander/gleitz samples are not
used, so their CC BY 3.0 attribution requirement does not apply.

## Fetch and R2 upload

`pnpm samples -- --bundled-only` refreshes only the committed subset.
`pnpm samples` also prepares the remote catalogue in `samples-dist/` but does not claim an
upload. `pnpm samples -- --upload` uploads those remote files with
`Cache-Control: public, max-age=31536000, immutable` after all five variables below are present
in the gitignored `.env.local` or process environment:

- `R2_ACCOUNT_ID`
- `R2_ACCESS_KEY_ID`
- `R2_SECRET_ACCESS_KEY`
- `R2_BUCKET`
- `R2_PUBLIC_URL` (also exposed to Vite as `VITE_SAMPLES_BASE_URL`)

The upload uses rclone's S3 backend against the account's Cloudflare R2 endpoint. Missing
credentials stop the upload before any network mutation.

## Export codecs

Tone.js and smplr are MIT. MIDI export uses @tonejs/midi (MIT), WAV export uses
audiobuffer-to-wav (MIT), and MP3 export uses mediabunny with @mediabunny/mp3-encoder. Those
packages are consumed unmodified under MPL-2.0; the extension's embedded LAME encoder is LGPL.
