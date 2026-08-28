/**
 * `stop_recording`: stops the recorder, transcribes the take and lands it in the document, where
 * `get_take` and `commit_take` can see it and the roll draws its pitch curve (music §2.3, §7.1).
 */
import { descriptions } from '../descriptions.ts';
import { ok, ToolError } from '../envelope.ts';
import { stopRecordingInput } from '../schemas.ts';
import type { ToolDefinition } from '../types.ts';
import { dispatch, takeData } from './shared.ts';
import { recorderCode } from './start_recording.ts';

export const stopRecording: ToolDefinition<typeof stopRecordingInput> = {
  name: 'stop_recording',
  title: 'Stop recording',
  kind: 'write',
  description: descriptions.stop_recording,
  input: stopRecordingInput,
  example: { why: 'Keeping the four bars you just hummed.' },
  badExample: { why: '' },
  async execute(args, context) {
    const result = await context.engine.recorder.stop();
    if (!result.ok) {
      throw new ToolError(recorderCode(result.code), result.message, result.recoverable);
    }
    const { take, trackId, targetBars } = result.data;
    const placedTake = {
      ...take,
      ...(trackId === null ? {} : { target_track_id: trackId }),
      ...(targetBars === null
        ? {}
        : { target_bars: [targetBars.barFrom, targetBars.barTo] as [number, number] }),
    };
    const command = dispatch(context, 'add_take', { take: placedTake }, args);
    context.engine.setPendingTake(placedTake.id);
    const song = context.bus.getDocument();
    const data = takeData(placedTake, song.time_sig[0]);
    return ok(command.revision, command.changed, command.summary, {
      ...data,
      placed_on_track: trackId,
      next:
        data.median_clarity < 0.6
          ? 'The take is noisy; offer another before committing it.'
          : 'Next: get_take for context, then propose_options with kind take. commit_take keeps the raw take.',
    });
  },
};
