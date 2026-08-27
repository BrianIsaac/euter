/**
 * Tool descriptions as registered (plan Tool surface). The text is the product's contract with the
 * model: what the tool does, what it refuses, and what to call next. The registry appends the write
 * sentence, and the contract test counts the whole thing against Chrome's 500-character budget
 * (plan Decision 18; landscape §1.8).
 */
import type { ToolKind } from './types.ts';

export const WRITE_SUFFIX =
  'Returns revision, changed and summary; on error returns ok:false with a code.';

export const WHY_SENTENCE = 'Include why.';

export const descriptions = {
  get_song_state:
    'Read the song: revision, bpm, time signature, key with confidence, bar count, sections, tracks with id, kind, instrument, mix and which bars have notes, takes waiting to be committed, instrument and style names, transport (playing, position_bar), audio (running or locked, microphone granted) and running jobs. Call this first and after any error. Under 1,200 characters; notes come from get_track_notes.',
  get_track_notes:
    'Read one track’s notes for up to 8 bars as {p: MIDI pitch, s: start in beats from the bar start, d: duration in beats, v: velocity 0-1}. Track ids and bar counts come from get_song_state.',
  get_chords:
    'Read the chord per bar as symbol and Roman numeral in the current key. Bars without a chord are omitted.',
  get_take:
    'Read a recorded, imported or played take: transcribed notes, duration_s, voiced_ratio, median_clarity (below 0.6 means a noisy take; ask for another), pitch_range, tempo_hint and refining_job_id if refinement is running. Take ids come from get_song_state or stop_recording. Next: commit_take or set_key.',
  suggest_chords:
    'Propose a diatonic chord per bar from the melody’s notes and the current key, in a style, with a fit score per bar. Changes nothing; pass the result to set_chords, edited as you like. Tell the person the choice in plain words: name what is on screen, then the term.',
  get_job:
    'Read a job: state (running, done, failed, cancelled), progress_pct, and when done download_url, duration_s and peak_dbfs, or an error.',
  start_recording:
    'Arm the recorder on the melody track with a count-in and click, using the input the person selected in the app (microphone, keyboard or MIDI). The person must have clicked once in the app and granted the microphone; otherwise returns AUDIO_LOCKED or MIC_DENIED. Edits to the recorded track are refused with RECORDING_IN_PROGRESS until stop_recording.',
  stop_recording:
    'Stop the recorder and transcribe the take to notes. Returns the take (as get_take) and placed_on_track; the notes are already on the piano roll with the raw pitch curve under them. Next: set_key, then suggest_chords or set_chords.',
  commit_take:
    'Commit a take to a track as its notes, quantised to grid with strength 0-1 (0 keeps the sung timing, 1 snaps fully). Replaces that track’s notes in the bars the take covers; the sung timing is kept so set_quantize can change it later.',
  set_notes:
    'Write notes to a track from bar_from, replacing the notes in the bars covered. p is MIDI pitch 24-96, s start in beats from the bar start, d duration in beats, v velocity 0-1. At most 8 bars per call. Rejects pitches out of range and notes past the bar.',
  set_chords:
    'Set the chord for one or more bars by symbol (C, Am7, F/A, G). Symbols the app cannot parse are rejected with INVALID_ARGUMENT. Returns each bar with its Roman numeral in the current key. Set chords before generate_part.',
  propose_options:
    'Register two or three alternatives for the person to compare, each with a label and one sentence on why. Changes nothing until one is chosen: the app shows them as cards with Play and Choose; the agent may play one with audition_option. Use this before set_chords or generate_part when more than one good answer exists.',
  audition_option:
    'Play one registered option over its bars without committing it. Not an edit. Returns AUDIO_LOCKED if the person has not clicked in the app.',
  request_take:
    'Ask the person to hum or play a portion themselves: the app shows the prompt ("Hum me a bassline for the chorus") on those bars, arms the recorder on that track and range with a count-in, and returns at once. The take arrives later in get_song_state under takes; check for it before writing that part yourself. Ask before inventing a part the person might want to sing.',
  set_key:
    'Set the song key, e.g. "C major" or "A minor". Returns the key with the melody’s fit score and the ranked alternatives the app detected. Call after a take is placed; the app’s own estimate is in get_song_state.',
  set_tempo: 'Set the tempo in BPM. Notes keep their beat positions.',
  set_quantize:
    'Re-quantise a track’s notes from their recorded timing to a grid with strength and optional swing. Reversible: strength 0 restores the sung timing.',
  add_track:
    'Add a track of kind melody, chords, bass or drums with an instrument (names in get_song_state) and optional name. Returns the track with its id.',
  set_instrument:
    'Change a track’s instrument by name (names in get_song_state). Samples load lazily; loaded:false means the sound starts within a few seconds.',
  set_mix: 'Set a track’s volume_db, pan, mute or solo. Only the fields given change.',
  generate_part:
    'Write a part for a track in a role from the song’s chords and key over a bar range, in a style (pop, soul, lofi). Deterministic and rule-based: bass follows roots and fifths in the style’s pattern, chords are voiced with smooth voice leading, drums use the style’s kit pattern. Replaces the track’s notes in those bars. Set chords first.',
  arrange:
    'Set the song’s sections in order (intro, verse, chorus, bridge) as bar ranges; repeat copies a section’s notes and chords into the next bars. Extends the bar count; uncovered bars stay empty for generate_part. Returns sections and total bars.',
  play: 'Start playback from a bar, optionally looping a range. Not an edit: revision does not change. Returns AUDIO_LOCKED if the person has not clicked in the app yet; ask them to press play once.',
  stop: 'Stop playback. Not an edit.',
  undo: 'Undo the last edit, whether the person or the agent made it. Returns the new revision and what was undone.',
  redo: 'Redo the last undone edit.',
  render:
    'Start rendering the song or a bar range to a file. Returns a job_id at once; poll get_job for progress and the download link, which the person clicks.',
  cancel_job: 'Cancel a running job.',
} as const;

export type ToolName = keyof typeof descriptions;

/**
 * Builds the description the browser sees.
 *
 * @param base - The description from `descriptions`.
 * @param kind - Read or write.
 * @param hasWhy - Whether the schema has a `why` field.
 * @returns The base description, with the write sentence appended for writes.
 */
export function registeredDescription(base: string, kind: ToolKind, hasWhy: boolean): string {
  if (kind === 'read') {
    return base;
  }
  return hasWhy ? `${base} ${WHY_SENTENCE} ${WRITE_SUFFIX}` : `${base} ${WRITE_SUFFIX}`;
}
