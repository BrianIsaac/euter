import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import {
  ERROR_CODES,
  enforceOutputBudget,
  envelopeFromThrown,
  fail,
  formatZodError,
  isAbortError,
  ok,
  OUTPUT_BUDGET,
  serialisedLength,
  ToolError,
} from '../../src/webmcp/envelope.ts';

describe('envelope', () => {
  it('lists the ten codes from the plan plus CANCELLED and INTERNAL', () => {
    for (const code of [
      'INVALID_ARGUMENT',
      'STALE_REVISION',
      'TRACK_NOT_FOUND',
      'TAKE_NOT_FOUND',
      'OUT_OF_RANGE',
      'AUDIO_LOCKED',
      'MIC_DENIED',
      'RECORDING_IN_PROGRESS',
      'JOB_NOT_FOUND',
      'RESULT_TOO_LARGE',
      'CANCELLED',
      'INTERNAL',
    ]) {
      expect(ERROR_CODES).toContain(code);
    }
  });

  it('builds the success and failure shapes', () => {
    expect(ok(3, ['bpm'], 'Tempo set', { bpm: 90 })).toEqual({
      ok: true,
      revision: 3,
      changed: ['bpm'],
      summary: 'Tempo set',
      data: { bpm: 90 },
    });
    expect(fail('AUDIO_LOCKED', 'Press play once.', true)).toEqual({
      ok: false,
      code: 'AUDIO_LOCKED',
      message: 'Press play once.',
      recoverable: true,
    });
  });

  it('turns a ToolError into its own code', () => {
    const envelope = envelopeFromThrown(new ToolError('TRACK_NOT_FOUND', 'No track t9.', true));
    expect(envelope).toEqual({
      ok: false,
      code: 'TRACK_NOT_FOUND',
      message: 'No track t9.',
      recoverable: true,
    });
  });

  it('turns a zod error into INVALID_ARGUMENT with the issues listed', () => {
    const result = z.strictObject({ bpm: z.number() }).safeParse({ bpm: 'fast', extra: 1 });
    expect(result.success).toBe(false);
    if (!result.success) {
      const envelope = envelopeFromThrown(result.error);
      expect(envelope.ok).toBe(false);
      if (!envelope.ok) {
        expect(envelope.code).toBe('INVALID_ARGUMENT');
        expect(envelope.message).toContain('bpm');
        expect(envelope.message).toContain('extra');
        expect(envelope.message).toBe(formatZodError(result.error));
      }
    }
  });

  it('turns an abort into CANCELLED and anything else into INTERNAL', () => {
    const abort = new DOMException('stop', 'AbortError');
    expect(isAbortError(abort)).toBe(true);
    expect(envelopeFromThrown(abort).code).toBe('CANCELLED');
    expect(envelopeFromThrown(new Error('boom'))).toEqual({
      ok: false,
      code: 'INTERNAL',
      message: 'boom',
      recoverable: false,
    });
    expect(envelopeFromThrown('bad')).toMatchObject({ code: 'INTERNAL', message: 'bad' });
    expect(isAbortError(null)).toBe(false);
  });

  it('refuses an envelope over the output budget', () => {
    expect(OUTPUT_BUDGET).toBe(1500);
    const small = ok(1, [], 'fine', { text: 'x' });
    expect(enforceOutputBudget(small)).toBe(small);
    const large = ok(1, [], 'big', { text: 'x'.repeat(1600) });
    const refused = enforceOutputBudget(large);
    expect(refused.ok).toBe(false);
    if (!refused.ok) {
      expect(refused.code).toBe('RESULT_TOO_LARGE');
      expect(refused.message).toContain(String(serialisedLength(large)));
    }
    expect(enforceOutputBudget(large, 5000)).toBe(large);
  });
});
