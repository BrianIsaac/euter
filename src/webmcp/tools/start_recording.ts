/**
 * `start_recording`: the agent arms the recorder, but the person's click is what unlocked audio
 * and granted the microphone (plan Decision 24; Risk 1). Failures come back as data with the
 * plan's codes so the agent can offer Import or the keyboard instead.
 */
import type { RecorderErrorCode } from '../../input/recorder.ts';
import { descriptions } from '../descriptions.ts';
import { ok, ToolError, type ErrorCode } from '../envelope.ts';
import { startRecordingInput } from '../schemas.ts';
import type { ToolDefinition } from '../types.ts';

/**
 * Maps the recorder's codes onto the tool surface's codes.
 *
 * @param code - The recorder's code.
 * @returns The envelope code.
 */
export function recorderCode(code: RecorderErrorCode): ErrorCode {
  if (code === 'AUDIO_LOCKED') return 'AUDIO_LOCKED';
  if (code === 'MIC_DENIED') return 'MIC_DENIED';
  if (code === 'RECORDER_BUSY') return 'RECORDING_IN_PROGRESS';
  if (code === 'NOT_RECORDING') return 'INVALID_ARGUMENT';
  return 'INTERNAL';
}

export const startRecording: ToolDefinition<typeof startRecordingInput> = {
  name: 'start_recording',
  title: 'Start recording',
  kind: 'write',
  description: descriptions.start_recording,
  input: startRecordingInput,
  untrustedContent: true,
  example: { count_in_bars: 1, metronome: true },
  badExample: { count_in_bars: 3, metronome: true },
  async execute(args, context) {
    const song = context.bus.getDocument();
    if (args.expected_revision !== undefined && args.expected_revision !== song.revision) {
      throw new ToolError(
        'STALE_REVISION',
        `The song is at revision ${song.revision}, not ${args.expected_revision}. Read the state again.`,
        true,
      );
    }
    const request = context.engine.takeRequest();
    const trackId = args.track_id ?? request?.trackId;
    const track =
      trackId === undefined
        ? song.tracks.find(({ kind }) => kind === 'melody')
        : song.tracks.find(({ id }) => id === trackId);
    if (!track) {
      throw new ToolError(
        'TRACK_NOT_FOUND',
        trackId === undefined
          ? 'There is no melody track to record onto; add one with add_track.'
          : `Track "${trackId}" does not exist.`,
        true,
      );
    }
    const armed = request !== null && request.trackId === track.id ? request : null;
    const targetBars = armed?.targetBars ?? { barFrom: 1, barTo: song.bars };
    const result = await context.engine.recorder.start({
      trackId: track.id,
      countInBars: args.count_in_bars,
      metronome: args.metronome,
      monitorInput: args.monitor_input ?? false,
      targetBars,
      ...(armed === null ? {} : { prompt: armed.prompt }),
    });
    if (!result.ok) {
      throw new ToolError(recorderCode(result.code), result.message, result.recoverable);
    }
    return ok(
      song.revision,
      [],
      `Recording ${track.name} over the arrangement in bars ${targetBars.barFrom}-${targetBars.barTo} after a ${args.count_in_bars}-bar count-in. Call stop_recording when the person has finished.`,
      {
        track_id: track.id,
        count_in_bars: args.count_in_bars,
        metronome: args.metronome,
        input_monitoring: args.monitor_input ?? false,
        latency_compensation: 'worklet-clock-and-browser-latency',
        target_bars: [targetBars.barFrom, targetBars.barTo] as [number, number],
      },
    );
  },
};
