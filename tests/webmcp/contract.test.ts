/**
 * The contract every registered tool keeps (plan Testing, "Contract"; Decisions 12, 16 and 18).
 */
import { describe, expect, it } from 'vitest';
import {
  BUDGETS,
  collectParameterDescriptions,
  NAME_PATTERN,
  toInputSchema,
} from '../../src/webmcp/schemas.ts';
import { productTools, tools } from '../../src/webmcp/tools/index.ts';
import type { JsonSchemaObject } from '../../src/webmcp/schemas.ts';
import { createHarness, makeTake, type Harness } from '../helpers/harness.ts';

/** Tools whose call lands a change in the document and therefore pins a producer note. */
const DOCUMENT_WRITES = new Set([
  'stop_recording',
  'commit_take',
  'set_notes',
  'set_chords',
  'propose_options',
  'request_take',
  'set_key',
  'set_tempo',
  'set_quantize',
  'add_track',
  'set_instrument',
  'set_mix',
  'generate_part',
  'arrange',
]);

/** Tools whose output can contain names, labels, prompts or filenames supplied by the person. */
const UNTRUSTED_OUTPUTS = new Set([
  'get_song_state',
  'get_take',
  'start_recording',
  'commit_take',
  'set_notes',
  'propose_options',
  'audition_option',
  'request_take',
  'set_quantize',
  'add_track',
  'set_instrument',
  'set_mix',
  'arrange',
  'undo',
  'redo',
  'get_job',
]);

/** Tools that need something in the song, the recorder or the job list before their example runs. */
const seeds: Record<string, (harness: Harness) => Promise<void> | void> = {
  get_take: (harness) => {
    harness.engine.addTake(makeTake('take-1'), 'Kept your hum.', 'agent');
  },
  commit_take: (harness) => {
    harness.engine.addTake(makeTake('take-1'), 'Kept your hum.', 'agent');
  },
  stop_recording: async (harness) => {
    await harness.recorder.start({ trackId: 'melody', countInBars: 1, metronome: true });
  },
  audition_option: async (harness) => {
    await harness.invoke('propose_options', {
      kind: 'chords',
      bar_from: 1,
      bar_to: 4,
      options: [
        { label: 'One', why: 'The calm one.', chords: [{ bar: 1, symbol: 'C' }] },
        { label: 'Two', why: 'The lift.', chords: [{ bar: 1, symbol: 'Am7' }] },
      ],
      why: 'Two ways in.',
    });
  },
  get_job: (harness) => {
    harness.engine.startExport('wav', 1, 8);
  },
  cancel_job: (harness) => {
    harness.engine.startExport('wav', 1, 8);
  },
  undo: (harness) => {
    harness.engine.store.dispatch({
      type: 'set_tempo',
      args: { bpm: 100 },
      source: 'human',
      why: 'Something to undo.',
    });
  },
  redo: (harness) => {
    harness.engine.store.dispatch({
      type: 'set_tempo',
      args: { bpm: 100 },
      source: 'human',
      why: 'Something to undo.',
    });
    harness.engine.store.undo('human');
  },
};

async function seeded(name: string): Promise<Harness> {
  const harness = createHarness();
  await seeds[name]?.(harness);
  return harness;
}

describe('tool contract', () => {
  const described = createHarness().runtime.registry.describe();

  it('keeps registered metadata free of agent-directed instructions', () => {
    const agentDirected = /\b(?:ask|call|check|include|pass|poll|tell|use|you|your)\b/iu;
    for (const tool of described) {
      expect(tool.description, tool.name).not.toMatch(agentDirected);
      const schema = tool.inputSchema as JsonSchemaObject;
      for (const { path, description } of collectParameterDescriptions(schema)) {
        expect(description, `${tool.name}.${path}`).not.toMatch(agentDirected);
      }
    }
  });

  it('registers the twenty-eight tools, six of them reads, with unique names', () => {
    expect(productTools).toHaveLength(28);
    expect(tools).toBe(productTools);
    expect(productTools.filter(({ kind }) => kind === 'read')).toHaveLength(6);
    expect(new Set(tools.map((tool) => tool.name)).size).toBe(tools.length);
  });

  it('marks every output that can echo person-supplied text as untrusted content', () => {
    const untrusted = productTools
      .filter(({ untrustedContent }) => untrustedContent === true)
      .map(({ name }) => name);
    expect(untrusted).toEqual(
      productTools.filter(({ name }) => UNTRUSTED_OUTPUTS.has(name)).map(({ name }) => name),
    );
  });

  it('asks for a reason on every product tool that changes the document', () => {
    for (const definition of tools) {
      const hasWhy = 'why' in definition.input.shape;
      expect(hasWhy, definition.name).toBe(DOCUMENT_WRITES.has(definition.name));
    }
  });

  for (const definition of tools) {
    const registered = described.find((tool) => tool.name === definition.name);
    if (!registered) {
      throw new Error(`${definition.name} was not described by the registry.`);
    }
    const schema = registered.inputSchema as JsonSchemaObject;

    describe(definition.name, () => {
      it('has a name matching ^[a-z][a-z0-9_]{0,29}$', () => {
        expect(definition.name).toMatch(NAME_PATTERN);
        expect(definition.name.length).toBeLessThanOrEqual(BUDGETS.name);
      });

      it('keeps the registered description under 500 characters', () => {
        expect(registered.description.length).toBeGreaterThan(0);
        expect(registered.description.length).toBeLessThanOrEqual(BUDGETS.description);
      });

      it('keeps every parameter description under 150 characters and every parameter name under 30', () => {
        for (const { path, description } of collectParameterDescriptions(schema)) {
          expect(description.length, path).toBeLessThanOrEqual(BUDGETS.parameterDescription);
        }
        for (const key of Object.keys(schema.properties)) {
          expect(key.length, key).toBeLessThanOrEqual(BUDGETS.name);
        }
      });

      it('round-trips the schema with additionalProperties false and the right required keys', () => {
        expect(schema.type).toBe('object');
        expect(schema.additionalProperties).toBe(false);
        expect(JSON.parse(JSON.stringify(schema))).toEqual(toInputSchema(definition.input));
        const shape = definition.input.shape as Record<
          string,
          { safeParse(value: unknown): { success: boolean } }
        >;
        const requiredKeys = Object.keys(shape).filter(
          (key) => shape[key]?.safeParse(undefined).success === false,
        );
        expect(schema.required ?? []).toEqual(requiredKeys);
        expect(Object.keys(schema.properties).sort()).toEqual(Object.keys(shape).sort());
      });

      it('sets readOnlyHint exactly on reads', () => {
        expect(registered.annotations?.readOnlyHint).toBe(definition.kind === 'read');
      });

      it('accepts its example input and returns the success envelope inside the budget', async () => {
        const harness = await seeded(definition.name);
        const envelope = await harness.invoke(definition.name, definition.example);
        expect(envelope, JSON.stringify(envelope)).toMatchObject({ ok: true });
        expect(JSON.stringify(envelope).length).toBeLessThanOrEqual(BUDGETS.output);
        harness.engine.dispose();
      });

      it('rejects its bad input with INVALID_ARGUMENT and changes nothing', async () => {
        const harness = await seeded(definition.name);
        const before = harness.engine.store.getDocument().revision;
        const envelope = await harness.invoke(definition.name, definition.badExample);
        expect(envelope).toMatchObject({ ok: false, code: 'INVALID_ARGUMENT', recoverable: true });
        expect(harness.engine.store.getDocument().revision).toBe(before);
        harness.engine.dispose();
      });

      if (definition.kind === 'read') {
        it('never changes the revision', async () => {
          const harness = await seeded(definition.name);
          const before = harness.engine.store.getDocument().revision;
          const envelope = (await harness.invoke(definition.name, definition.example)) as {
            ok: boolean;
            revision: number;
            changed: string[];
          };
          expect(envelope.ok).toBe(true);
          expect(envelope.revision).toBe(before);
          expect(envelope.changed).toEqual([]);
          expect(harness.engine.store.getDocument().revision).toBe(before);
          harness.engine.dispose();
        });
      } else if (DOCUMENT_WRITES.has(definition.name)) {
        it('bumps the revision by one and pins its reason', async () => {
          const harness = await seeded(definition.name);
          const before = harness.engine.store.getDocument().revision;
          const notes = harness.engine.store.getDocument().notes_log.length;
          const envelope = (await harness.invoke(definition.name, definition.example)) as {
            ok: boolean;
            revision: number;
          };
          expect(envelope.ok).toBe(true);
          expect(envelope.revision).toBe(before + 1);
          const why = (definition.example as { why: string }).why;
          expect(harness.engine.store.getDocument().notes_log.length).toBe(notes + 1);
          expect(harness.engine.store.getDocument().notes_log.at(-1)?.why).toBe(why);
          harness.engine.dispose();
        });
      } else {
        it('leaves the document where it was', async () => {
          const harness = await seeded(definition.name);
          const before = harness.engine.store.getDocument();
          const envelope = (await harness.invoke(definition.name, definition.example)) as {
            ok: boolean;
          };
          expect(envelope.ok).toBe(true);
          const after = harness.engine.store.getDocument();
          const undoOrRedo = definition.name === 'undo' || definition.name === 'redo';
          expect(after.revision, definition.name).toBe(
            undoOrRedo ? before.revision + 1 : before.revision,
          );
          harness.engine.dispose();
        });
      }
    });
  }
});
