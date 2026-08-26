import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { ToolError } from '../../src/webmcp/envelope.ts';
import {
  BUDGETS,
  collectParameterDescriptions,
  expectedRevisionField,
  getDiagnosticsInput,
  NAME_PATTERN,
  parseInput,
  pingInput,
  toInputSchema,
  whyField,
} from '../../src/webmcp/schemas.ts';

describe('schemas', () => {
  it('exports JSON Schema with additionalProperties false and no $schema key', () => {
    const json = toInputSchema(pingInput);
    expect(json).toEqual({
      type: 'object',
      properties: {
        message: {
          type: 'string',
          minLength: 1,
          maxLength: 200,
          description: 'Short text to echo back in the summary',
        },
      },
      required: ['message'],
      additionalProperties: false,
    });
    expect(toInputSchema(getDiagnosticsInput)).toEqual({
      type: 'object',
      properties: {},
      additionalProperties: false,
    });
  });

  it('refuses a non-strict object schema', () => {
    expect(() => toInputSchema(z.object({ a: z.string() }).loose())).toThrow('strict');
  });

  it('parses valid input and refuses invalid input with INVALID_ARGUMENT', () => {
    expect(parseInput(pingInput, { message: 'hi' })).toEqual({ message: 'hi' });
    expect(parseInput(getDiagnosticsInput, undefined)).toEqual({});
    let thrown: unknown;
    try {
      parseInput(pingInput, { message: 'hi', extra: true });
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(ToolError);
    expect((thrown as ToolError).code).toBe('INVALID_ARGUMENT');
    expect((thrown as ToolError).recoverable).toBe(true);
    expect((thrown as ToolError).message).toContain('extra');
  });

  it('collects parameter descriptions through nested objects and arrays', () => {
    const schema = z.strictObject({
      why: whyField,
      expected_revision: expectedRevisionField,
      notes: z
        .array(z.strictObject({ p: z.number().describe('MIDI pitch') }))
        .describe('The notes'),
    });
    const found = collectParameterDescriptions(toInputSchema(schema));
    expect(found.map((entry) => entry.path)).toEqual([
      'why',
      'expected_revision',
      'notes',
      'notes[].p',
    ]);
    for (const entry of found) {
      expect(entry.description.length).toBeLessThanOrEqual(BUDGETS.parameterDescription);
    }
  });

  it('pins the name pattern and budgets from the plan', () => {
    expect(NAME_PATTERN.test('get_song_state')).toBe(true);
    expect(NAME_PATTERN.test('GetSongState')).toBe(false);
    expect(NAME_PATTERN.test('1abc')).toBe(false);
    expect(NAME_PATTERN.test('a'.repeat(31))).toBe(false);
    expect(BUDGETS).toEqual({
      name: 30,
      description: 500,
      parameterDescription: 150,
      output: 1500,
    });
  });
});
