/**
 * Every tool the page registers, in registration order: orientation, capture, composition,
 * teaching, arrangement, transport, history and jobs (plan Tool surface). The two probe tools stay
 * until the first full loop has run.
 */
import type { ToolDefinition } from '../types.ts';
import { addTrack } from './add_track.ts';
import { arrange } from './arrange.ts';
import { auditionOption } from './audition_option.ts';
import { cancelJob } from './cancel_job.ts';
import { commitTake } from './commit_take.ts';
import { generatePart } from './generate_part.ts';
import { getChords } from './get_chords.ts';
import { getDiagnostics } from './get_diagnostics.ts';
import { getJob } from './get_job.ts';
import { getSongState } from './get_song_state.ts';
import { getTake } from './get_take.ts';
import { getTrackNotes } from './get_track_notes.ts';
import { ping } from './ping.ts';
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
import { startRecording } from './start_recording.ts';
import { stop } from './stop.ts';
import { stopRecording } from './stop_recording.ts';
import { suggestChords } from './suggest_chords.ts';
import { undo } from './undo.ts';

/** The twenty-eight product tools (plan Tool surface). */
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

/** The probe tools from 27 Aug, removed once the first full loop has run. */
export const probeTools: readonly ToolDefinition[] = [
  getDiagnostics,
  ping,
] as readonly ToolDefinition[];

export const tools: readonly ToolDefinition[] = [...productTools, ...probeTools];
