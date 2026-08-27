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
    const { take, trackId } = result.data;
    const command = dispatch(context, 'add_take', { take }, args);
    context.engine.setPendingTake(take.id);
    const song = context.bus.getDocument();
    const data = takeData(take, song.time_sig[0]);
    return ok(command.revision, command.changed, command.summary, {
      ...data,
      placed_on_track: trackId,
      next:
        data.median_clarity < 0.6
          ? 'The take is noisy; offer another before committing it.'
          : 'Next: set_key, then suggest_chords or set_chords.',
    });
  },
};
