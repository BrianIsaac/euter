# Operator take measurements

Drop additional PCM16 WAV takes in this directory, optionally with a same-named JSON sidecar:

```json
{ "bpm": 96, "pitches": [60, 62, 64, 67] }
```

`pnpm bench:takes` discovers them recursively. Without a sidecar it still reports isolated octave
jumps and adjacent same-pitch splits heuristically.
