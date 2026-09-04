/**
 * Zod input schemas for every tool, exported to JSON Schema with `additionalProperties: false`
 * (plan Decision 16), and the budgets the contract test enforces (plan Decision 18; Chrome's
 * limits, landscape §1.8). Validation is strict in code and loose in the schema: ranges and
 * cross-field rules are checked here and in lane A's reducer, not expressed as JSON Schema.
 */
import { z } from 'zod';
import { formatZodError, ToolError } from './envelope.ts';

export const BUDGETS = {
  name: 30,
  description: 500,
  parameterDescription: 150,
  output: 1500,
} as const;

export const NAME_PATTERN = /^[a-z][a-z0-9_]{0,29}$/;

export const whyField = z
  .string()
  .min(1)
  .max(200)
  .describe('One sentence explaining the change; it is pinned for the person as a producer note');

export const expectedRevisionField = z
  .number()
  .int()
  .nonnegative()
  .optional()
  .describe('Previously read revision; STALE_REVISION is returned when the song has moved on');

const trackIdField = z.string().min(1).max(64).describe('Track id from get_song_state');
const takeIdField = z
  .string()
  .min(1)
  .max(64)
  .describe('Take id from get_song_state or stop_recording');
const jobIdField = z.string().min(1).max(64).describe('Job id returned by render');
const barField = z.number().int().min(1).max(4096);
const styleField = z.enum(['pop', 'soul', 'lofi']).describe('Feel: pop, soul or lofi');
const gridField = z.enum(['8n', '16n']).describe('Grid: 8n is quavers, 16n is semiquavers');

const noteField = z.strictObject({
  p: z.number().int().min(24).max(96).describe('MIDI pitch, 24 to 96'),
  s: z.number().min(0).max(4096).describe('Start in beats from the first bar of the range'),
  d: z.number().gt(0).max(64).describe('Duration in beats'),
  v: z.number().min(0).max(1).optional().describe('Velocity 0-1; 0.8 when omitted'),
});

const chordField = z.strictObject({
  bar: barField.describe('One-based bar number'),
  symbol: z.string().min(1).max(24).describe('Chord symbol such as C, Am7, F/A'),
});

const write = { why: whyField, expected_revision: expectedRevisionField };

export const getSongStateInput = z.strictObject({});

export const getTrackNotesInput = z.strictObject({
  track_id: trackIdField,
  bar_from: barField.describe('First bar, one-based and inclusive'),
  bar_to: barField.describe('Last bar; at most 8 bars per invocation'),
  note_offset: z.number().int().nonnegative().optional().describe('Zero-based note page offset'),
  note_limit: z
    .number()
    .int()
    .min(1)
    .max(24)
    .optional()
    .describe('Notes in one page, from 1 to 24; 24 when omitted'),
});

export const getChordsInput = z.strictObject({
  bar_from: barField.optional().describe('First bar; bar 1 when omitted'),
  bar_to: barField.optional().describe('Last bar; the final bar when omitted'),
});

export const getTakeInput = z.strictObject({ take_id: takeIdField });

export const suggestChordsInput = z.strictObject({
  bar_from: barField.describe('First bar, one-based and inclusive'),
  bar_to: barField.describe('Last bar, inclusive'),
  style: styleField,
});

export const getJobInput = z.strictObject({ job_id: jobIdField });

export const startRecordingInput = z.strictObject({
  track_id: trackIdField.optional().describe('Track to record onto; the melody track by default'),
  count_in_bars: z
    .union([z.literal(1), z.literal(2)])
    .describe('Bars of count-in before recording'),
  metronome: z.boolean().describe('Whether the click keeps playing while recording'),
  expected_revision: expectedRevisionField,
});

export const stopRecordingInput = z.strictObject(write);

export const commitTakeInput = z.strictObject({
  take_id: takeIdField,
  track_id: trackIdField,
  quantize_strength: z.number().min(0).max(1).describe('0 keeps the sung timing, 1 snaps fully'),
  grid: gridField,
  ...write,
});

export const setNotesInput = z.strictObject({
  track_id: trackIdField,
  bar_from: barField.describe('First bar the notes are written from'),
  notes: z.array(noteField).max(512).describe('Notes in beats from bar_from; at most 8 bars'),
  replace: z.literal(true).describe('Always true: the bars covered are replaced'),
  ...write,
});

export const setChordsInput = z.strictObject({
  chords: z.array(chordField).min(1).max(64).describe('One chord per bar'),
  ...write,
});

export const proposeOptionsInput = z.strictObject({
  kind: z.enum(['chords', 'feel', 'part', 'take']).describe('Subject of the alternatives'),
  take_id: takeIdField.optional().describe('Recorded take interpreted when kind is take'),
  track_id: trackIdField.optional().describe('Destination track when kind is take'),
  options: z
    .array(
      z.strictObject({
        label: z.string().min(1).max(80).describe('Two or three words shown to the person'),
        why: z
          .string()
          .min(1)
          .max(200)
          .describe(
            'One sentence on why this one is worth hearing; a take reading names any note it infers rather than detects',
          ),
        chords: z.array(chordField).min(1).optional().describe('Chords this option would set'),
        style: styleField.optional(),
        track_id: trackIdField.optional().describe('Track the notes belong to, for a part option'),
        notes: z.array(noteField).min(1).max(512).optional().describe('Notes from bar_from'),
      }),
    )
    .min(2)
    .max(3)
    .describe('Two or three alternatives'),
  bar_from: barField.describe('First bar the options cover'),
  bar_to: barField.describe('Last bar the options cover'),
  ...write,
});

export const auditionOptionInput = z.strictObject({
  option_id: z.string().min(1).max(64).describe('Option id from propose_options or get_song_state'),
});

export const requestTakeInput = z.strictObject({
  track_id: trackIdField,
  bar_from: barField.describe('First bar to record'),
  bar_to: barField.describe('Last bar to record'),
  prompt: z.string().min(1).max(200).describe('Prompt shown to the person over the requested bars'),
  ...write,
});

export const setKeyInput = z.strictObject({
  key: z.string().min(2).max(40).describe('A key such as "C major" or "A minor"'),
  ...write,
});

export const setTempoInput = z.strictObject({
  bpm: z.number().min(40).max(220).describe('Tempo in beats per minute, 40 to 220'),
  ...write,
});

export const setQuantizeInput = z.strictObject({
  track_id: trackIdField,
  grid: gridField,
  strength: z.number().min(0).max(1).describe('0 restores the sung timing, 1 snaps fully'),
  swing: z.number().min(0).max(0.5).optional().describe('Delay on off-beats, 0 to 0.5'),
  ...write,
});

export const tuneVocalInput = z.strictObject({
  track_id: trackIdField,
  strength: z
    .number()
    .min(0)
    .max(1)
    .describe('Correction amount: 0 preserves pitch, 1 moves voiced grains fully into the key'),
  ...write,
});

export const addTrackInput = z.strictObject({
  kind: z.enum(['melody', 'chords', 'bass', 'drums', 'vocal']).describe('What the track is for'),
  instrument: z
    .string()
    .min(1)
    .max(80)
    .describe('Instrument from get_song_state; recorded-voice for vocal'),
  name: z.string().min(1).max(80).optional().describe('Name shown in the track list'),
  ...write,
});

export const setInstrumentInput = z.strictObject({
  track_id: trackIdField,
  instrument: z.string().min(1).max(80).describe('Instrument name from get_song_state'),
  ...write,
});

export const setMixInput = z.strictObject({
  track_id: trackIdField,
  volume_db: z.number().min(-60).max(6).optional().describe('Level in decibels, -60 to 6'),
  pan: z.number().min(-1).max(1).optional().describe('-1 is left, 0 centre, 1 right'),
  mute: z.boolean().optional(),
  solo: z.boolean().optional(),
  ...write,
});

export const generatePartInput = z.strictObject({
  track_id: trackIdField,
  role: z.enum(['bass', 'chords', 'drums']).describe('Must match the track’s kind'),
  style: styleField,
  bar_from: barField.describe('First bar to write'),
  bar_to: barField.describe('Last bar to write'),
  ...write,
});

export const arrangeInput = z.strictObject({
  sections: z
    .array(
      z.strictObject({
        name: z
          .string()
          .min(1)
          .max(80)
          .describe('Section label such as intro, verse, chorus or bridge'),
        bar_from: barField.describe('First bar of the section'),
        bar_to: barField.describe('Last bar of the section'),
        repeat: z
          .union([z.boolean(), z.number().int().min(1).max(16)])
          .optional()
          .describe('Copies of the section to append after it'),
      }),
    )
    .min(1)
    .max(32)
    .describe('Sections in bar order; they must not overlap'),
  ...write,
});

export const playInput = z.strictObject({
  from_bar: barField.optional().describe('Bar to start from; bar 1 when omitted'),
  loop: z
    .strictObject({
      bar_from: barField.describe('First bar of the loop'),
      bar_to: barField.describe('Last bar of the loop'),
    })
    .optional()
    .describe('Loop this range instead of playing to the end'),
});

export const stopInput = z.strictObject({});

export const undoInput = z.strictObject({});

export const redoInput = z.strictObject({});

export const renderInput = z.strictObject({
  format: z.enum(['wav', 'mp3', 'midi']).describe('wav and mp3 are audio; midi is notes only'),
  bar_from: barField.optional().describe('First bar to render; bar 1 when omitted'),
  bar_to: barField.optional().describe('Last bar to render; the final bar when omitted'),
});

export const cancelJobInput = z.strictObject({ job_id: jobIdField });

export interface JsonSchemaObject extends JsonSchemaNode {
  type: 'object';
  properties: Record<string, JsonSchemaNode>;
  required?: string[];
  additionalProperties: false;
}

export interface JsonSchemaNode {
  type?: string | string[];
  description?: string;
  properties?: Record<string, JsonSchemaNode>;
  items?: JsonSchemaNode | JsonSchemaNode[];
  anyOf?: JsonSchemaNode[];
  oneOf?: JsonSchemaNode[];
  [key: string]: unknown;
}

/**
 * Converts a zod object schema to the JSON Schema registered with the browser.
 *
 * @param schema - A `z.strictObject`.
 * @returns The schema without the `$schema` key and with `additionalProperties: false` at the root.
 */
export function toInputSchema(schema: z.ZodObject): JsonSchemaObject {
  const json = z.toJSONSchema(schema) as JsonSchemaObject & { $schema?: string };
  delete json.$schema;
  if (json.type !== 'object' || json.additionalProperties !== false) {
    throw new Error('Tool input schemas must be strict objects.');
  }
  return json;
}

/**
 * Validates an input against a tool's schema.
 *
 * @param schema - The tool's zod schema.
 * @param input - The raw input from the browser.
 * @returns The parsed input.
 * @throws ToolError with `INVALID_ARGUMENT` listing every issue.
 */
export function parseInput<S extends z.ZodObject>(schema: S, input: unknown): z.output<S> {
  const result = schema.safeParse(input ?? {});
  if (!result.success) {
    throw new ToolError('INVALID_ARGUMENT', formatZodError(result.error), true);
  }
  return result.data;
}

/**
 * Lists every parameter description in a schema, for the budget test.
 *
 * @param schema - The JSON Schema.
 * @returns Paths and descriptions, depth first.
 */
export function collectParameterDescriptions(
  schema: JsonSchemaNode,
): { path: string; description: string }[] {
  const found: { path: string; description: string }[] = [];
  const walk = (node: JsonSchemaNode, path: string): void => {
    if (typeof node.description === 'string' && path !== '') {
      found.push({ path, description: node.description });
    }
    for (const [key, child] of Object.entries(node.properties ?? {})) {
      walk(child, path === '' ? key : `${path}.${key}`);
    }
    const items = node.items;
    if (Array.isArray(items)) {
      items.forEach((item, index) => walk(item, `${path}[${index}]`));
    } else if (items) {
      walk(items, `${path}[]`);
    }
    for (const variant of [...(node.anyOf ?? []), ...(node.oneOf ?? [])]) {
      walk(variant, path);
    }
  };
  walk(schema, '');
  return found;
}
