import { describe, expect, it } from 'vitest';
import { tools } from '../../../src/webmcp/tools/index.ts';

describe('tools index', () => {
  it('lists the read before the write, both probe tools', () => {
    expect(tools.map((tool) => [tool.name, tool.kind])).toEqual([
      ['get_diagnostics', 'read'],
      ['ping', 'write'],
    ]);
  });
});
