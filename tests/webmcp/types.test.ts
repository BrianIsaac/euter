import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import type { ModelContextTool, ToolDefinition } from '../../src/webmcp/types.ts';
import { ok } from '../../src/webmcp/envelope.ts';
import { createFakeContext } from '../helpers/fakeContext.ts';

describe('webmcp types', () => {
  it('describes a tool definition the registry can build', () => {
    const input = z.strictObject({ value: z.number() });
    const definition: ToolDefinition<typeof input> = {
      name: 'echo_value',
      title: 'Echo',
      kind: 'read',
      description: 'Echo a number.',
      input,
      example: { value: 1 },
      badExample: { value: 'x' },
      execute: (args) => ok(0, [], 'echo', { value: args.value }),
    };
    expect(definition.kind).toBe('read');
  });

  it('matches the spec IDL well enough for a fake context to implement it', async () => {
    const context = createFakeContext();
    const tool: ModelContextTool = {
      name: 'noop',
      description: 'Does nothing.',
      inputSchema: { type: 'object', properties: {}, additionalProperties: false },
      execute: () => 'done',
      annotations: { readOnlyHint: true },
    };
    await context.registerTool(tool);
    const listed = await context.getTools();
    expect(listed.map((entry) => entry.name)).toEqual(['noop']);
    expect(listed[0]?.annotations?.readOnlyHint).toBe(true);
    const [first] = listed;
    if (!first) {
      throw new Error('no tool listed');
    }
    expect(await context.executeTool?.(first, {})).toBe('"done"');
  });
});
