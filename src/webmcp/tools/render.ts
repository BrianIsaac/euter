/**
 * `render`: start-then-poll (plan Decision 23). The job id comes back at once, `get_job` reports
 * progress, and the person clicks the link in the export panel. `options.signal` cancels the job.
 */
import { descriptions } from '../descriptions.ts';
import { ok, ToolError } from '../envelope.ts';
import { renderInput } from '../schemas.ts';
import type { ToolDefinition } from '../types.ts';

export const render: ToolDefinition<typeof renderInput> = {
  name: 'render',
  title: 'Render a file',
  kind: 'write',
  description: descriptions.render,
  input: renderInput,
  example: { format: 'mp3' },
  badExample: { format: 'flac' },
  execute(args, context) {
    const song = context.bus.getDocument();
    const barFrom = args.bar_from ?? 1;
    const barTo = args.bar_to ?? song.bars;
    if (barTo < barFrom) {
      throw new ToolError('INVALID_ARGUMENT', 'Give an ordered, one-based bar range.', true);
    }
    if (barTo > song.bars) {
      throw new ToolError('OUT_OF_RANGE', `The song has ${song.bars} bars.`, true);
    }
    if (args.format === 'midi' && song.tracks.some((track) => track.clips.length > 0)) {
      throw new ToolError(
        'INVALID_ARGUMENT',
        'MIDI cannot contain retained voice audio. Render WAV or MP3 to include the vocal.',
        true,
      );
    }
    const job = context.engine.startExport(args.format, barFrom, barTo);
    context.signal.addEventListener(
      'abort',
      () => {
        context.engine.jobs.cancel(job.id);
      },
      { once: true },
    );
    return ok(
      song.revision,
      [],
      `Rendering ${args.format} for bars ${barFrom}-${barTo}. Poll get_job with this job_id.`,
      {
        job_id: job.id,
        state: 'running',
        format: args.format,
        bar_from: barFrom,
        bar_to: barTo,
      },
    );
  },
};
