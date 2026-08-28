import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { ToolError } from '../../src/webmcp/envelope.ts';
import {
  BUDGETS,
  collectParameterDescriptions,
  expectedRevisionField,
  getSongStateInput,
  NAME_PATTERN,
  parseInput,
  proposeOptionsInput,
  setKeyInput,
  toInputSchema,
  whyField,
} from '../../src/webmcp/schemas.ts';

describe('schemas', () => {
  it('exports JSON Schema with additionalProperties false and no $schema key', () => {
    const json = toInputSchema(setKeyInput);
    expect(json.type).toBe('object');
    expect(json.additionalProperties).toBe(false);
    expect(json.required).toEqual(['key', 'why']);
    expect(json.properties.key).toMatchObject({
      type: 'string',
      minLength: 2,
      maxLength: 40,
      description: 'A key such as "C major" or "A minor"',
    });
    expect('$schema' in json).toBe(false);
    expect(toInputSchema(getSongStateInput)).toEqual({
      type: 'object',
      properties: {},
      additionalProperties: false,
    });
  });

  it('refuses a non-strict object schema', () => {
    expect(() => toInputSchema(z.object({ a: z.string() }).loose())).toThrow('strict');
  });

  it('parses valid input and refuses invalid input with INVALID_ARGUMENT', () => {
    expect(parseInput(setKeyInput, { key: 'C major', why: 'Home key.' })).toEqual({
      key: 'C major',
      why: 'Home key.',
    });
    expect(parseInput(getSongStateInput, undefined)).toEqual({});
    let thrown: unknown;
    try {
      parseInput(setKeyInput, { key: 'C major', why: 'Home key.', extra: true });
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

  it('carries the take-reading honesty limit where the agent actually reads it', () => {
    const found = collectParameterDescriptions(toInputSchema(proposeOptionsInput));
    const why = found.find(({ path }) => path === 'options[].why');

    expect(why?.description).toMatch(/infers rather than detects/u);
    expect(why?.description.length ?? 0).toBeLessThanOrEqual(BUDGETS.parameterDescription);
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
