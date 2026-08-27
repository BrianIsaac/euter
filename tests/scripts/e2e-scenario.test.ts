import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  ACTIONS,
  captureInto,
  checkEnvelope,
  checkPaths,
  checkTools,
  loadScenario,
  matchRevision,
  OUTPUT_BUDGET,
  readPath,
  resolve,
  stepLabel,
  untilSatisfied,
  validateScenario,
} from '../../scripts/e2e-scenario.mjs';

const scenarioDir = join(process.cwd(), 'tests', 'e2e', 'scenarios');

function envelope(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    ok: true,
    revision: 3,
    changed: ['bpm', 'notes_log'],
    summary: 'Set tempo to 96 bpm',
    data: { bpm: 96 },
    ...overrides,
  };
}

describe('readPath', () => {
  it('walks objects and array indices, and stops at a missing segment', () => {
    const source = { data: { takes: [{ id: 'take-1' }], bars: [{ notes: [{ p: 67 }] }] } };
    expect(readPath(source, 'data.takes.0.id')).toBe('take-1');
    expect(readPath(source, 'data.bars.0.notes.0.p')).toBe(67);
    expect(readPath(source, 'data.takes.1.id')).toBeUndefined();
    expect(readPath(source, 'data.missing.deeper')).toBeUndefined();
    expect(readPath(source, '')).toBe(source);
  });
});

describe('resolve', () => {
  it('replaces a whole reference with the captured value and keeps its type', () => {
    expect(resolve('{{revision}}', { revision: 7 })).toBe(7);
    expect(resolve({ a: ['{{id}}', 2] }, { id: 'take-1' })).toEqual({ a: ['take-1', 2] });
  });

  it('interpolates a reference inside a longer string', () => {
    expect(resolve('job {{id}} done', { id: 'job-9' })).toBe('job job-9 done');
  });

  it('refuses a reference that has not been captured', () => {
    expect(() => resolve('{{missing}}', {})).toThrow(/before it was captured/);
  });
});

describe('validateScenario', () => {
  it('accepts every checked-in scenario file', () => {
    const files = readdirSync(scenarioDir).filter((file) => file.endsWith('.json'));
    expect(files.sort()).toEqual([
      'demo.json',
      'errors.json',
      'recording-lock.json',
      'stale-revision.json',
    ]);
    for (const file of files) {
      const scenario = loadScenario(join(scenarioDir, file));
      expect(scenario.name).toBe(file.replace(/\.json$/, ''));
      expect(scenario.steps.length).toBeGreaterThan(0);
      for (const step of scenario.steps) {
        expect(ACTIONS).toContain(step.action);
      }
    }
  });

  it('names the step and the key when a scenario is malformed', () => {
    expect(() => validateScenario({ name: 'x' }, 'f.json')).toThrow(/"title"/);
    expect(() =>
      validateScenario({ name: 'x', title: 'y', steps: [{ action: 'sing' }] }, 'f.json'),
    ).toThrow(/f.json step 1: "action" must be one of/);
    expect(() =>
      validateScenario({ name: 'x', title: 'y', steps: [{ action: 'tool' }] }, 'f.json'),
    ).toThrow(/a tool step needs "tool"/);
    expect(() =>
      validateScenario(
        { name: 'x', title: 'y', steps: [{ action: 'tool', tool: 'play', inputs: {} }] },
        'f.json',
      ),
    ).toThrow(/"inputs" is not a key of a tool step/);
  });
});

describe('matchRevision', () => {
  it('reads exact, relative and comparison expectations', () => {
    expect(matchRevision(4, 4, null)).toBeNull();
    expect(matchRevision(4, '+1', 3)).toBeNull();
    expect(matchRevision(3, '+0', 3)).toBeNull();
    expect(matchRevision(4, '>=1', null)).toBeNull();
    expect(matchRevision(4, '+1', 2)).toMatch(/expected 3/);
    expect(matchRevision(0, '>=1', null)).toMatch(/expected >=1/);
    expect(matchRevision(4, '+1', null)).toMatch(/no revision has been read yet/);
    expect(matchRevision('four', 4, null)).toMatch(/not a number/);
  });
});

describe('checkEnvelope', () => {
  it('passes a success envelope that meets every expectation', () => {
    expect(
      checkEnvelope(
        envelope(),
        {
          ok: true,
          revision: '+1',
          changed: ['bpm'],
          summary_includes: '96 bpm',
          data: { 'data.bpm': 96 },
        },
        { previousRevision: 2, outputChars: 120 },
      ),
    ).toEqual([]);
  });

  it('reports the output budget, the code and the missing envelope fields', () => {
    expect(checkEnvelope(envelope(), {}, { outputChars: OUTPUT_BUDGET + 1 })).toEqual([
      `output is ${OUTPUT_BUDGET + 1} characters, over the ${OUTPUT_BUDGET} budget`,
    ]);
    const failures = checkEnvelope(
      { ok: false, code: 'AUDIO_LOCKED', message: 'locked', recoverable: true },
      { ok: false, code: 'OUT_OF_RANGE' },
    );
    expect(failures).toEqual(['code is "AUDIO_LOCKED", expected OUT_OF_RANGE']);
    expect(checkEnvelope({ ok: true, revision: 1 }, {})).toEqual(
      expect.arrayContaining([
        'the success envelope has no "changed"',
        'the success envelope has no "summary"',
        'the success envelope has no "data"',
        '"changed" is not an array',
      ]),
    );
  });

  it('treats an error envelope as a failure unless the scenario asked for one', () => {
    const failures = checkEnvelope(
      { ok: false, code: 'MIC_DENIED', message: 'no', recoverable: true },
      {},
    );
    expect(failures[0]).toBe('ok is false, expected true (MIC_DENIED: no)');
  });

  it('checks changed exactly and the summary text', () => {
    expect(checkEnvelope(envelope(), { changed_exactly: ['bpm'] })[0]).toMatch(
      /expected \["bpm"\]/,
    );
    expect(checkEnvelope(envelope(), { summary_includes: ['tempo', 'bar'] })).toEqual([
      'summary "Set tempo to 96 bpm" does not contain "bar"',
    ]);
  });
});

describe('checkPaths', () => {
  it('compares whole values, dotted paths and substrings', () => {
    expect(checkPaths(['human', 'agent'], { equals: ['human', 'agent'] })).toEqual([]);
    expect(checkPaths({ locked: null }, { data: { locked: null } })).toEqual([]);
    expect(checkPaths({ a: { b: 2 } }, { data_defined: ['a.b'] })).toEqual([]);
    expect(checkPaths({ a: '' }, { data_defined: ['a'] })[0]).toMatch(/expected a value/);
    expect(checkPaths({ file: 'song.mp3' }, { data_includes: { file: '.mp3' } })).toEqual([]);
    expect(checkPaths({ file: 'song.wav' }, { data_includes: { file: '.mp3' } })[0]).toMatch(
      /expected it to contain/,
    );
  });
});

describe('checkTools', () => {
  const tools = [
    {
      name: 'get_song_state',
      description: 'reads',
      annotations: { readOnly: true, untrustedContent: true },
    },
    {
      name: 'set_tempo',
      description: 'writes',
      annotations: { readOnly: false, untrustedContent: false },
    },
  ];

  it('counts the surface, the reads and the annotations', () => {
    expect(checkTools(tools, { count: 2, read_only: 1, untrusted: 1 })).toEqual([]);
    expect(checkTools(tools, { count: 28 })[0]).toBe('2 tools are registered, expected 28');
    expect(checkTools(tools, { read_only: 6 })[0]).toMatch(/get_song_state/);
    expect(checkTools(tools, { names_include: ['render'] })[0]).toBe(
      'the surface is missing render',
    );
    expect(checkTools(tools, { max_description_chars: 3 })).toEqual([
      "get_song_state's description is 5 characters, over 3",
      "set_tempo's description is 6 characters, over 3",
    ]);
  });
});

describe('captureInto and untilSatisfied', () => {
  it('captures values and reports a path that is not there', () => {
    const vars: Record<string, unknown> = {};
    expect(captureInto(envelope(), { bpm: 'data.bpm' }, vars)).toEqual([]);
    expect(vars).toEqual({ bpm: 96 });
    expect(captureInto(envelope(), { missing: 'data.nope' }, vars)[0]).toMatch(/cannot capture/);
  });

  it('reads a poll condition from dotted paths', () => {
    const done = { ok: true, data: { state: 'done', progress_pct: 100 } };
    expect(untilSatisfied(done, { 'data.state': 'done' })).toBe(true);
    expect(untilSatisfied(done, { 'data.state': 'running' })).toBe(false);
  });
});

describe('stepLabel', () => {
  it('names each kind of step for the run log', () => {
    expect(stepLabel({ action: 'tool', tool: 'play' })).toBe('tool play');
    expect(stepLabel({ action: 'poll', tool: 'get_job' })).toBe('poll get_job');
    expect(stepLabel({ action: 'click', target: { name: 'Play' } })).toBe('click {"name":"Play"}');
    expect(stepLabel({ action: 'permission', permission: 'microphone', state: 'denied' })).toBe(
      'permission microphone=denied',
    );
    expect(stepLabel({ action: 'wait_for', text: ['Voiced'] })).toBe('wait_for ["Voiced"]');
    expect(stepLabel({ action: 'console' })).toBe('console');
  });
});
