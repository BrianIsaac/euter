/**
 * The contract every registered tool keeps (plan Testing, "Contract"; Decisions 16 and 18).
 */
import { describe, expect, it } from 'vitest';
import { createCommandBus } from '../../src/webmcp/bus.ts';
import { createEnvironmentStore, readEnvironment } from '../../src/webmcp/environment.ts';
import { createProbeDocument, probeReducer } from '../../src/webmcp/probe.ts';
import { createRegistry } from '../../src/webmcp/registry.ts';
import {
  BUDGETS,
  collectParameterDescriptions,
  NAME_PATTERN,
  toInputSchema,
} from '../../src/webmcp/schemas.ts';
import { tools } from '../../src/webmcp/tools/index.ts';
import type { JsonSchemaObject } from '../../src/webmcp/schemas.ts';

function makeRegistry() {
  const bus = createCommandBus(probeReducer, createProbeDocument());
  return {
    bus,
    registry: createRegistry({
      tools,
      bus,
      environment: createEnvironmentStore(readEnvironment()),
      nextTick: () => Promise.resolve(),
    }),
  };
}

describe('tool contract', () => {
  const described = makeRegistry().registry.describe();

  it('registers at least the two probe tools with unique names', () => {
    expect(tools.length).toBeGreaterThanOrEqual(2);
    expect(new Set(tools.map((tool) => tool.name)).size).toBe(tools.length);
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

      it('accepts its example input and returns the success envelope', async () => {
        const { registry } = makeRegistry();
        const envelope = await registry.invoke(definition.name, definition.example);
        expect(envelope.ok, JSON.stringify(envelope)).toBe(true);
        if (envelope.ok) {
          expect(typeof envelope.revision).toBe('number');
          expect(Array.isArray(envelope.changed)).toBe(true);
          expect(typeof envelope.summary).toBe('string');
          expect('data' in envelope).toBe(true);
          expect(JSON.stringify(envelope).length).toBeLessThanOrEqual(BUDGETS.output);
        }
      });

      it('rejects its bad input with INVALID_ARGUMENT', async () => {
        const { registry, bus } = makeRegistry();
        const before = bus.getDocument().revision;
        const envelope = await registry.invoke(definition.name, definition.badExample);
        expect(envelope).toMatchObject({ ok: false, code: 'INVALID_ARGUMENT', recoverable: true });
        expect(bus.getDocument().revision).toBe(before);
      });

      if (definition.kind === 'read') {
        it('never changes the revision', async () => {
          const { registry, bus } = makeRegistry();
          bus.dispatch({ type: 'ping', args: { message: 'seed' }, source: 'human' });
          const before = bus.getDocument().revision;
          const envelope = await registry.invoke(definition.name, definition.example);
          expect(envelope.ok).toBe(true);
          if (envelope.ok) {
            expect(envelope.revision).toBe(before);
            expect(envelope.changed).toEqual([]);
          }
          expect(bus.getDocument().revision).toBe(before);
          expect(bus.getActivities()).toHaveLength(1);
        });
      } else {
        it('bumps the revision by one', async () => {
          const { registry, bus } = makeRegistry();
          const before = bus.getDocument().revision;
          const envelope = await registry.invoke(definition.name, definition.example);
          expect(envelope.ok).toBe(true);
          if (envelope.ok) {
            expect(envelope.revision).toBe(before + 1);
          }
        });
      }
    });
  }
});
