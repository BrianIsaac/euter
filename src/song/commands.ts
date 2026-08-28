/** Strict song-domain commands (plan Architecture item 2 and Tool surface writes). */
import { z } from 'zod';
import type { Command } from '../webmcp/bus.ts';
import type { CommandSource, PartRole, StyleName, TeachingOptionKind, TrackKind } from './types.ts';

const sourceSchema = z.enum(['human', 'agent']);
const whySchema = z.string().trim().min(1).max(200);
const revisionSchema = z.number().int().nonnegative();
const idSchema = z.string().trim().min(1).max(64);
const barSchema = z.number().int().min(1);
const styleSchema = z.enum(['pop', 'soul', 'lofi']);
const roleSchema = z.enum(['bass', 'chords', 'drums']);
const trackKindSchema = z.enum(['melody', 'chords', 'bass', 'drums']);

export const inputNoteSchema = z
  .object({
    p: z.number().int().min(24).max(96),
    s: z.number().nonnegative(),
    d: z.number().positive(),
    v: z.number().min(0).max(1).optional(),
  })
  .strict();

const chordSchema = z
  .object({
    bar: barSchema,
    symbol: z.string().trim().min(1).max(24),
  })
  .strict();

const common = {
  source: sourceSchema,
  why: whySchema,
  expected_revision: revisionSchema.optional(),
};

const optionSchema = z
  .object({
    label: z.string().trim().min(1).max(80),
    why: whySchema,
    chords: z.array(chordSchema).min(1).optional(),
    style: styleSchema.optional(),
    track_id: idSchema.optional(),
    notes: z.array(inputNoteSchema).min(1).optional(),
  })
  .strict();

export const songCommandSchema = z.discriminatedUnion('type', [
  z
    .object({
      type: z.literal('ping'),
      args: z.object({ message: z.string().max(500) }).strict(),
      source: sourceSchema,
      expected_revision: revisionSchema.optional(),
    })
    .strict(),
  z
    .object({
      type: z.literal('set_notes'),
      args: z
        .object({
          track_id: idSchema,
          bar_from: barSchema,
          notes: z.array(inputNoteSchema).max(1024),
          replace: z.literal(true),
        })
        .strict(),
      ...common,
    })
    .strict(),
  z
    .object({
      type: z.literal('set_chords'),
      args: z.object({ chords: z.array(chordSchema).min(1).max(64) }).strict(),
      ...common,
    })
    .strict(),
  z
    .object({
      type: z.literal('set_key'),
      args: z.object({ key: z.string().trim().min(2).max(40) }).strict(),
      ...common,
    })
    .strict(),
  z
    .object({
      type: z.literal('set_tempo'),
      args: z.object({ bpm: z.number().min(40).max(220) }).strict(),
      ...common,
    })
    .strict(),
  z
    .object({
      type: z.literal('set_quantize'),
      args: z
        .object({
          track_id: idSchema,
          grid: z.enum(['8n', '16n']),
          strength: z.number().min(0).max(1),
          swing: z.number().min(0).max(0.5).optional(),
        })
        .strict(),
      ...common,
    })
    .strict(),
  z
    .object({
      type: z.literal('add_track'),
      args: z
        .object({
          kind: trackKindSchema,
          instrument: z.string().trim().min(1).max(80),
          name: z.string().trim().min(1).max(80).optional(),
        })
        .strict(),
      ...common,
    })
    .strict(),
  z
    .object({
      type: z.literal('set_instrument'),
      args: z.object({ track_id: idSchema, instrument: z.string().trim().min(1).max(80) }).strict(),
      ...common,
    })
    .strict(),
  z
    .object({
      type: z.literal('set_mix'),
      args: z
        .object({
          track_id: idSchema,
          volume_db: z.number().min(-60).max(6).optional(),
          pan: z.number().min(-1).max(1).optional(),
          mute: z.boolean().optional(),
          solo: z.boolean().optional(),
        })
        .strict()
        .refine(
          ({ volume_db, pan, mute, solo }) =>
            volume_db !== undefined ||
            pan !== undefined ||
            mute !== undefined ||
            solo !== undefined,
          'Give at least one mix field.',
        ),
      ...common,
    })
    .strict(),
  z
    .object({
      type: z.literal('generate_part'),
      args: z
        .object({
          track_id: idSchema,
          role: roleSchema,
          style: styleSchema,
          bar_from: barSchema,
          bar_to: barSchema,
        })
        .strict(),
      ...common,
    })
    .strict(),
  z
    .object({
      type: z.literal('arrange'),
      args: z
        .object({
          sections: z
            .array(
              z
                .object({
                  name: z.string().trim().min(1).max(80),
                  bar_from: barSchema,
                  bar_to: barSchema,
                  repeat: z.union([z.boolean(), z.number().int().min(1).max(16)]).optional(),
                })
                .strict(),
            )
            .min(1)
            .max(32),
        })
        .strict(),
      ...common,
    })
    .strict(),
  z
    .object({
      type: z.literal('commit_take'),
      args: z
        .object({
          take_id: idSchema,
          track_id: idSchema,
          quantize_strength: z.number().min(0).max(1),
          grid: z.enum(['8n', '16n']),
        })
        .strict(),
      ...common,
    })
    .strict(),
  z
    .object({
      type: z.literal('propose_options'),
      args: z
        .object({
          kind: z.enum(['chords', 'feel', 'part', 'take']),
          take_id: idSchema.optional(),
          track_id: idSchema.optional(),
          options: z.array(optionSchema).min(2).max(3),
          bar_from: barSchema,
          bar_to: barSchema,
        })
        .strict(),
      ...common,
    })
    .strict(),
  z
    .object({
      type: z.literal('choose_option'),
      args: z.object({ option_id: idSchema }).strict(),
      ...common,
    })
    .strict(),
  z
    .object({
      type: z.literal('request_take'),
      args: z
        .object({
          track_id: idSchema,
          bar_from: barSchema,
          bar_to: barSchema,
          prompt: z.string().trim().min(1).max(200),
        })
        .strict(),
      ...common,
    })
    .strict(),
]);

export type SongCommand = z.infer<typeof songCommandSchema>;
export type SetNotesCommand = Extract<SongCommand, { type: 'set_notes' }>;
export type SetChordsCommand = Extract<SongCommand, { type: 'set_chords' }>;
export type SetKeyCommand = Extract<SongCommand, { type: 'set_key' }>;
export type SetTempoCommand = Extract<SongCommand, { type: 'set_tempo' }>;
export type SetQuantizeCommand = Extract<SongCommand, { type: 'set_quantize' }>;
export type AddTrackCommand = Extract<SongCommand, { type: 'add_track' }>;
export type SetInstrumentCommand = Extract<SongCommand, { type: 'set_instrument' }>;
export type SetMixCommand = Extract<SongCommand, { type: 'set_mix' }>;
export type GeneratePartCommand = Extract<SongCommand, { type: 'generate_part' }>;
export type ArrangeCommand = Extract<SongCommand, { type: 'arrange' }>;
export type CommitTakeCommand = Extract<SongCommand, { type: 'commit_take' }>;
export type ProposeOptionsCommand = Extract<SongCommand, { type: 'propose_options' }>;
export type ChooseOptionCommand = Extract<SongCommand, { type: 'choose_option' }>;
export type RequestTakeCommand = Extract<SongCommand, { type: 'request_take' }>;

/**
 * Parses the generic Lane C bus boundary into a strict song command.
 *
 * @param command - A command supplied by a human gesture or WebMCP tool.
 * @returns The validated discriminated union.
 */
export function parseSongCommand(command: Command): SongCommand {
  return songCommandSchema.parse(command);
}

/** Type-only assertions retained as exported aliases for UI and tool schema consumers. */
export type SongCommandSource = CommandSource;
export type SongTrackKind = TrackKind;
export type SongStyle = StyleName;
export type SongPartRole = PartRole;
export type SongTeachingOptionKind = TeachingOptionKind;
