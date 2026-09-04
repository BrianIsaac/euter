/**
 * Every tool the page registers, in registration order: orientation, capture, composition,
 * teaching, arrangement, transport, history and jobs (plan Tool surface). The 27 Aug probe tools
 * (`get_diagnostics`, `ping`) went with `src/webmcp/probe.ts` once the first full loop had run; the
 * diagnostics panel is a UI panel, not a tool.
 */
import type { ToolDefinition } from '../types.ts';
import { addTrack } from './add_track.ts';
import { arrange } from './arrange.ts';
import { auditionOption } from './audition_option.ts';
import { cancelJob } from './cancel_job.ts';
import { commitTake } from './commit_take.ts';
import { generatePart } from './generate_part.ts';
import { getChords } from './get_chords.ts';
import { getJob } from './get_job.ts';
import { getSongState } from './get_song_state.ts';
import { getTake } from './get_take.ts';
import { getTrackNotes } from './get_track_notes.ts';
import { play } from './play.ts';
import { proposeOptions } from './propose_options.ts';
import { redo } from './redo.ts';
import { render } from './render.ts';
import { requestTake } from './request_take.ts';
import { setChords } from './set_chords.ts';
import { setInstrument } from './set_instrument.ts';
import { setKey } from './set_key.ts';
import { setMix } from './set_mix.ts';
import { setNotes } from './set_notes.ts';
import { setQuantize } from './set_quantize.ts';
import { setTempo } from './set_tempo.ts';
import { tuneVocal } from './tune_vocal.ts';
import { startRecording } from './start_recording.ts';
import { stop } from './stop.ts';
import { stopRecording } from './stop_recording.ts';
import { suggestChords } from './suggest_chords.ts';
import { undo } from './undo.ts';

/** The twenty-nine tools of the tool surface. */
export const productTools: readonly ToolDefinition[] = [
  getSongState,
  getTrackNotes,
  getChords,
  getTake,
  startRecording,
  stopRecording,
  commitTake,
  setNotes,
  setChords,
  suggestChords,
  proposeOptions,
  auditionOption,
  requestTake,
  setKey,
  setTempo,
  setQuantize,
  tuneVocal,
  addTrack,
  setInstrument,
  setMix,
  generatePart,
  arrange,
  play,
  stop,
  undo,
  redo,
  render,
  getJob,
  cancelJob,
] as readonly ToolDefinition[];

export const tools: readonly ToolDefinition[] = productTools;
