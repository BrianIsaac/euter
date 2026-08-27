/** Deterministic chord notes voiced with tonal and smooth top-note movement. */
import type { ChordEntry, Note, StyleName } from '../../song/types.ts';
import { parseKeyName } from '../key.ts';
import { getStylePreset } from '../styles.ts';
import { voiceProgression, voicingToMidi } from '../voicing.ts';

export function generateChords(
  chords: readonly ChordEntry[],
  keyName: string,
  style: StyleName,
  barFrom: number,
  barTo: number,
  beatsPerBar = 4,
): Note[] {
  const tonic = parseKeyName(keyName)?.tonic ?? 'C';
  const symbols = Array.from(
    { length: barTo - barFrom + 1 },
    (_, offset) => chordAt(chords, barFrom + offset) ?? tonic,
  );
  const voicings = voiceProgression(symbols, style);
  const preset = getStylePreset(style).voicing;
  return voicings.flatMap((voicing, offset) =>
    voicingToMidi(voicing).map((p) => ({
      p,
      s: (barFrom + offset - 1) * beatsPerBar,
      d: Math.min(preset.duration, beatsPerBar),
      v: preset.velocity,
      source: 'agent' as const,
    })),
  );
}

function chordAt(chords: readonly ChordEntry[], bar: number): string | undefined {
  return [...chords]
    .filter((chord) => chord.bar <= bar)
    .sort((left, right) => right.bar - left.bar)[0]?.symbol;
}
