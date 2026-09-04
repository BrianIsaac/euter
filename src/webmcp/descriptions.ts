/**
 * Tool descriptions as registered (plan Tool surface). The text is the product's contract with the
 * model, and it states capability, precondition and result only: no sentence directs the agent,
 * because a description that can steer policy is a metadata-poisoning surface (review R-01;
 * landscape §1.7). A next step belongs in the result - `data.next` or the summary - where it
 * describes the state the person and the agent are now in. The registry appends the write
 * sentence, and the contract test counts the whole thing against Chrome's 500-character budget
 * (plan Decision 18; landscape §1.8).
 */
import type { ToolKind } from './types.ts';

export const WRITE_SUFFIX =
  'Returns revision, changed and summary; on error returns ok:false with a code.';

export const WHY_SENTENCE = 'The why field is pinned to the change as a producer note.';

export const descriptions = {
  get_song_state:
    'Reads revision, tempo, time signature, key confidence, bar count, sections, bounded track summaries, pending takes, instrument and style names, transport, audio and running jobs. The payload stays under 1,200 characters; note detail is available from get_track_notes.',
  get_track_notes:
    'Reads one track’s notes for up to 8 bars as {p: MIDI pitch, s: start in beats from the bar start, d: duration in beats, v: velocity 0-1}. Dense ranges page at up to 24 notes through note_offset and report next_note_offset. Track ids and bar counts are reported by get_song_state.',
  get_chords:
    'Reads each chord as a symbol and Roman numeral in the current key. Bars without a chord are omitted.',
  get_take:
    'Reads a rough recorded, imported or played take with bounded notes and quality readings, plus its bar range, key, sections, chords and summaries of the other tracks sounding there. A clarity below 0.6 denotes a noisy take. Take ids are reported by get_song_state and stop_recording.',
  suggest_chords:
    'Proposes one diatonic chord per bar from the melody, current key and named style, with a fit score for each bar, over at most 16 bars at a time. The song remains unchanged; the returned chords have the same shape accepted by set_chords.',
  get_job:
    'Reads a job state, progress percentage, and on completion its download URL, duration and peak dBFS, or its failure message. A completed render also names any instrument that fell back to a bundled sound.',
  start_recording:
    'Arms the selected microphone, keyboard or MIDI input on a track with a count-in and optional continuing click. A prior person gesture and microphone permission are required for microphone capture. The recorded track is locked against edits until stop_recording, and arming a second take while one is live returns RECORDING_IN_PROGRESS.',
  stop_recording:
    'Stops the recorder and retains its audio while transcribing the take to notes. The result contains bounded take data and placed_on_track; commit_take puts the voice in playback and WAV or MP3 exports.',
  commit_take:
    'Commits a raw take to a track, including retained audio when present, and quantises its notes to a grid with strength 0-1. Zero keeps performed timing and one snaps fully. A chosen take reading uses the same commit path.',
  set_notes:
    'Writes notes to a track from bar_from and replaces the covered bars. p is MIDI pitch 24-96, s is a beat offset from bar_from, d is duration in beats and v is velocity 0-1. Each invocation covers at most 8 bars and rejects notes outside the range.',
  set_chords:
    'Sets chord symbols such as C, Am7, F/A or G on one or more bars. Unrecognised symbols return INVALID_ARGUMENT. The result includes each chord’s Roman numeral; generate_part derives parts from the stored chords.',
  propose_options:
    'Registers two or three labelled alternatives over a bar range. Take alternatives bind a recorded take and destination track, and receive a raw-take card. The app shows Play and Choose cards and audition_option previews one without committing it. The song changes only when a card is chosen.',
  audition_option:
    'Plays one registered option over its bars without committing an edit. AUDIO_LOCKED is returned until a person gesture has activated audio.',
  request_take:
    'Shows a prompt over a bar range and arms that track for a person-performed take with a count-in. start_recording without a track_id then records onto the requested track and bars. The request returns immediately; a completed take later appears in get_song_state.',
  set_key:
    'Sets a tonal song key such as "C major" or "A minor". The result contains the melody fit score and ranked detected alternatives; get_song_state contains the current estimate.',
  set_tempo: 'Sets the tempo in BPM. Notes keep their beat positions.',
  set_quantize:
    'Re-quantises a track from its recorded timing to a grid with strength and optional swing. Strength zero restores the performed timing.',
  add_track:
    'Adds a melody, chords, bass, drums or vocal track with an optional display name. Instrument names are reported by get_song_state; recorded-voice identifies a vocal track and plays retained take audio.',
  set_instrument:
    'Changes a track’s instrument to a name reported by get_song_state. Samples load lazily: loaded:false means the requested sound is not playing yet. If loading falls back, the transport and About panel name the bundled instrument sounding in its place.',
  set_mix: 'Sets a track’s volume_db, pan, mute or solo. Only the supplied fields change.',
  generate_part:
    'Writes a deterministic bass, chords or drums part from the stored chords, key and pop, soul or lofi style over a bar range. Bass follows roots and fifths, chords have smooth voice leading and drums follow the style pattern. Notes in those bars are replaced.',
  arrange:
    'Sets ordered section ranges such as intro, verse, chorus and bridge. A repeat copies a section’s notes and chords into appended bars. The song extends to the final covered bar and uncovered bars remain empty.',
  play: 'Starts playback from a bar with an optional loop range. Playback is not an edit and leaves revision unchanged. AUDIO_LOCKED is returned until a person gesture has activated audio, and a bar beyond the song returns OUT_OF_RANGE.',
  stop: 'Stops playback without changing revision.',
  undo: 'Undoes the last person or agent edit. The undo is itself a step forward: the revision increases rather than returning to the earlier number, and the result reports how many edits were taken back.',
  redo: 'Redoes the last undone edit. As with undo the revision increases rather than returning to an earlier number, and the result reports how many edits came back.',
  render:
    'Starts rendering the song or a bar range; a range begins at time zero. WAV and MP3 contain retained voice clips. MIDI rejects clips because it cannot carry audio. The result contains a job id; get_job reports progress and the download.',
  cancel_job:
    'Cancels a running render job. A job that has already finished is reported with cancelled:false and its final state.',
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
