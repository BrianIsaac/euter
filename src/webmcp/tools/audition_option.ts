/**
 * `audition_option`: the option is heard in place - the graph is reconciled from a preview document
 * with the option applied - and `revision` never moves (plan Decision 13; Architecture item 4).
 */
import { descriptions } from '../descriptions.ts';
import { ok } from '../envelope.ts';
import { auditionOptionInput } from '../schemas.ts';
import type { ToolDefinition } from '../types.ts';

export const auditionOption: ToolDefinition<typeof auditionOptionInput> = {
  name: 'audition_option',
  title: 'Play an option',
  kind: 'write',
  description: descriptions.audition_option,
  input: auditionOptionInput,
  example: { option_id: 'option-1' },
  badExample: { option_id: '' },
  async execute(args, context) {
    const { set, option } = await context.engine.audition(args.option_id);
    return ok(
      context.bus.getDocument().revision,
      [],
      `Playing "${option.label}" over bars ${set.bar_from}-${set.bar_to}. Nothing is committed until it is chosen.`,
      {
        option_id: option.id,
        label: option.label,
        target_bars: [set.bar_from, set.bar_to] as [number, number],
        committed: false,
      },
    );
  },
};
