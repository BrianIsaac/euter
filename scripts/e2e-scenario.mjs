/**
 * Scenario loading, variable substitution and assertions for the end-to-end harness
 * (plan Testing, "End-to-end"). Nothing here touches a browser or a process, so
 * `tests/scripts/e2e-scenario.test.ts` covers the whole module directly.
 *
 * A scenario is a JSON file under `tests/e2e/scenarios/`:
 *
 * ```json
 * {
 *   "name": "demo",
 *   "title": "The demo call order",
 *   "steps": [
 *     { "action": "tool", "tool": "set_tempo", "input": { "bpm": 96, "why": "..." },
 *       "expect": { "ok": true, "revision": "+1", "changed": ["bpm"] } }
 *   ]
 * }
 * ```
 */
import { readFileSync } from 'node:fs';

/** Chrome's recommended limit per tool output, in characters (landscape §1.8). */
export const OUTPUT_BUDGET = 1500;

/** The step actions a scenario may use. */
export const ACTIONS = [
  'tools',
  'tool',
  'poll',
  'click',
  'upload',
  'wait_for',
  'eval',
  'permission',
  'console',
];

/** @type {Record<string, string[]>} */
const REQUIRED_KEYS = {
  tools: [],
  tool: ['tool'],
  poll: ['tool', 'until'],
  click: ['target'],
  upload: ['target', 'file'],
  wait_for: ['text'],
  eval: ['function'],
  permission: ['permission', 'state'],
  console: [],
};

/** @type {Record<string, string[]>} */
const ALLOWED_KEYS = {
  tools: ['expect'],
  tool: ['tool', 'input', 'capture', 'expect'],
  poll: ['tool', 'input', 'until', 'capture', 'expect', 'timeout_ms', 'interval_ms'],
  click: ['target', 'nth'],
  upload: ['target', 'file'],
  wait_for: ['text', 'timeout_ms'],
  eval: ['function', 'capture', 'expect'],
  permission: ['permission', 'state'],
  console: ['expect'],
};

const COMMON_KEYS = ['action', 'note'];

/** Assertion keys each runner branch actually reads. */
const EXPECT_KEYS = {
  tools: ['count', 'read_only', 'untrusted', 'names_include', 'max_description_chars'],
  tool: [
    'ok',
    'code',
    'recoverable',
    'revision',
    'changed',
    'changed_exactly',
    'summary_includes',
    'message_includes',
    'data',
    'data_defined',
    'data_includes',
    'equals',
    'max_chars',
  ],
  poll: [
    'ok',
    'code',
    'recoverable',
    'revision',
    'changed',
    'changed_exactly',
    'summary_includes',
    'message_includes',
    'data',
    'data_defined',
    'data_includes',
    'equals',
    'max_chars',
  ],
  eval: ['equals', 'data', 'data_defined', 'data_includes'],
  console: ['clean', 'excludes'],
};

const BEHAVIOURAL_EXPECT_KEYS = [
  'code',
  'revision',
  'changed',
  'changed_exactly',
  'summary_includes',
  'message_includes',
  'data',
  'data_defined',
  'data_includes',
  'equals',
];

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function hasNonEmptyAssertion(value) {
  if (typeof value === 'string') return value.length > 0;
  if (Array.isArray(value)) return value.length > 0;
  if (isRecord(value)) return Object.keys(value).length > 0;
  return value !== undefined;
}

/**
 * True when a tool step checks observable behaviour beyond generic envelope shape and size.
 *
 * @param {unknown} expect - The step's expectation block.
 * @returns {boolean} Whether it can count as end-to-end coverage.
 */
export function hasBehaviouralExpectation(expect) {
  if (!isRecord(expect)) return false;
  return BEHAVIOURAL_EXPECT_KEYS.some(
    (key) =>
      key in expect && hasNonEmptyAssertion(/** @type {Record<string, unknown>} */ (expect)[key]),
  );
}

/** Returns the tool a successful, behavioural step is allowed to cover. */
export function coveredToolName(step, passed) {
  if (
    !passed ||
    (step.action !== 'tool' && step.action !== 'poll') ||
    typeof step.tool !== 'string' ||
    !hasBehaviouralExpectation(step.expect)
  ) {
    return null;
  }
  return step.tool;
}

/** Compares live registrations with tools covered by successful behavioural assertions. */
export function runtimeCoverageFailures(registered, covered) {
  const registeredSet = new Set(registered);
  const coveredSet = new Set(covered);
  const failures = [];
  const missing = registered.filter((name) => !coveredSet.has(name));
  const unknown = [...coveredSet].filter((name) => !registeredSet.has(name));
  if (missing.length > 0) {
    failures.push(`registered tools not covered by a passing scenario: ${missing.join(', ')}`);
  }
  if (unknown.length > 0) {
    failures.push(
      `passing scenarios invoked tools not on the registered surface: ${unknown.join(', ')}`,
    );
  }
  return failures;
}

function validateExpectation(action, expect, where) {
  const recognised = EXPECT_KEYS[action];
  if (recognised === undefined) return;
  if (!isRecord(expect)) {
    throw new Error(`${where}: "expect" must be an object`);
  }
  for (const key of Object.keys(expect)) {
    if (!recognised.includes(key)) {
      throw new Error(`${where}: "${key}" is not a recognised ${action} expectation`);
    }
  }
  if ((action === 'tool' || action === 'poll') && !hasBehaviouralExpectation(expect)) {
    throw new Error(`${where}: a ${action} step needs a behavioural expectation`);
  }
}

/**
 * Reads a value from an object by a dotted path; numeric segments index arrays.
 *
 * @param {unknown} source - The object to read.
 * @param {string} path - A dotted path such as `data.takes.0.id`.
 * @returns {unknown} The value, or undefined when any segment is missing.
 */
export function readPath(source, path) {
  let current = source;
  if (path === '') {
    return current;
  }
  for (const segment of path.split('.')) {
    if (current === null || current === undefined) {
      return undefined;
    }
    if (Array.isArray(current)) {
      const index = Number(segment);
      current = Number.isInteger(index) ? current[index] : undefined;
      continue;
    }
    if (typeof current !== 'object') {
      return undefined;
    }
    current = /** @type {Record<string, unknown>} */ (current)[segment];
  }
  return current;
}

/**
 * Substitutes `{{name}}` references from the captured variables, deeply.
 *
 * A string that is exactly one reference becomes the captured value with its type intact;
 * a reference inside a longer string is interpolated as text.
 *
 * @param {unknown} value - The value to resolve.
 * @param {Record<string, unknown>} vars - The captured variables.
 * @returns {unknown} The resolved value.
 */
export function resolve(value, vars) {
  if (typeof value === 'string') {
    const whole = /^\{\{\s*([A-Za-z0-9_]+)\s*\}\}$/.exec(value);
    if (whole) {
      const name = /** @type {string} */ (whole[1]);
      if (!(name in vars)) {
        throw new Error(`Scenario refers to {{${name}}} before it was captured`);
      }
      return vars[name];
    }
    return value.replace(/\{\{\s*([A-Za-z0-9_]+)\s*\}\}/g, (_match, name) => {
      if (!(name in vars)) {
        throw new Error(`Scenario refers to {{${name}}} before it was captured`);
      }
      return String(vars[name]);
    });
  }
  if (Array.isArray(value)) {
    return value.map((entry) => resolve(entry, vars));
  }
  if (value !== null && typeof value === 'object') {
    /** @type {Record<string, unknown>} */
    const out = {};
    for (const [key, entry] of Object.entries(value)) {
      out[key] = resolve(entry, vars);
    }
    return out;
  }
  return value;
}

/** Resolves captured variables inside an eval step's function declaration. */
export function resolveFunction(source, vars) {
  const resolved = resolve(source, vars);
  if (typeof resolved !== 'string' || resolved === '') {
    throw new Error('An eval function must resolve to a non-empty string');
  }
  return resolved;
}

/**
 * Validates one scenario, throwing on anything the runner would silently ignore.
 *
 * @param {unknown} scenario - The parsed JSON.
 * @param {string} source - The file name, for the message.
 * @returns {{ name: string, title: string, reset: boolean, steps: Record<string, unknown>[] }} The scenario.
 */
export function validateScenario(scenario, source) {
  if (scenario === null || typeof scenario !== 'object' || Array.isArray(scenario)) {
    throw new Error(`${source}: a scenario must be an object`);
  }
  const record = /** @type {Record<string, unknown>} */ (scenario);
  for (const key of ['name', 'title']) {
    if (typeof record[key] !== 'string' || record[key] === '') {
      throw new Error(`${source}: "${key}" must be a non-empty string`);
    }
  }
  if (record.reset !== undefined && typeof record.reset !== 'boolean') {
    throw new Error(`${source}: "reset" must be a boolean`);
  }
  if (!Array.isArray(record.steps) || record.steps.length === 0) {
    throw new Error(`${source}: "steps" must be a non-empty array`);
  }
  record.steps.forEach((step, index) => {
    const where = `${source} step ${index + 1}`;
    if (step === null || typeof step !== 'object' || Array.isArray(step)) {
      throw new Error(`${where}: a step must be an object`);
    }
    const action = /** @type {Record<string, unknown>} */ (step).action;
    if (typeof action !== 'string' || !ACTIONS.includes(action)) {
      throw new Error(`${where}: "action" must be one of ${ACTIONS.join(', ')}`);
    }
    const allowed = new Set([...COMMON_KEYS, ...(ALLOWED_KEYS[action] ?? [])]);
    for (const key of Object.keys(step)) {
      if (!allowed.has(key)) {
        throw new Error(`${where}: "${key}" is not a key of a ${action} step`);
      }
    }
    for (const key of REQUIRED_KEYS[action] ?? []) {
      if (!(key in step)) {
        throw new Error(`${where}: a ${action} step needs "${key}"`);
      }
    }
    const stepRecord = /** @type {Record<string, unknown>} */ (step);
    if (EXPECT_KEYS[action] !== undefined) {
      if (!('expect' in stepRecord)) {
        throw new Error(`${where}: a ${action} step needs "expect"`);
      }
      validateExpectation(action, stepRecord.expect, where);
    }
  });
  return {
    name: /** @type {string} */ (record.name),
    title: /** @type {string} */ (record.title),
    reset: record.reset === undefined ? true : /** @type {boolean} */ (record.reset),
    steps: /** @type {Record<string, unknown>[]} */ (record.steps),
  };
}

/**
 * Loads and validates a scenario file.
 *
 * @param {string} path - The file path.
 * @returns {ReturnType<typeof validateScenario>} The scenario.
 */
export function loadScenario(path) {
  return validateScenario(JSON.parse(readFileSync(path, 'utf8')), path);
}

/**
 * Compares an observed revision with a scenario's expectation.
 *
 * Accepts a number, `"+n"` (relative to the previous observed revision), and the comparisons
 * `">=n"`, `">n"`, `"<=n"` and `"<n"`.
 *
 * @param {unknown} actual - The revision the tool returned.
 * @param {number|string} spec - The expectation, already substituted.
 * @param {number|null} previous - The previous observed revision.
 * @returns {string|null} A failure sentence, or null when it matches.
 */
export function matchRevision(actual, spec, previous) {
  if (typeof actual !== 'number') {
    return `revision is ${JSON.stringify(actual)}, not a number`;
  }
  if (typeof spec === 'number') {
    return actual === spec ? null : `revision is ${actual}, expected ${spec}`;
  }
  const relative = /^([+-])(\d+)$/.exec(spec);
  if (relative) {
    if (previous === null) {
      return `revision "${spec}" is relative but no revision has been read yet`;
    }
    const want = previous + Number(`${relative[1]}${relative[2]}`);
    return actual === want
      ? null
      : `revision is ${actual}, expected ${want} (${spec} of ${previous})`;
  }
  const comparison = /^(>=|<=|>|<)\s*(\d+)$/.exec(spec);
  if (comparison) {
    const bound = Number(comparison[2]);
    const held =
      comparison[1] === '>='
        ? actual >= bound
        : comparison[1] === '<='
          ? actual <= bound
          : comparison[1] === '>'
            ? actual > bound
            : actual < bound;
    return held ? null : `revision is ${actual}, expected ${spec}`;
  }
  const exact = Number(spec);
  if (Number.isInteger(exact)) {
    return actual === exact ? null : `revision is ${actual}, expected ${exact}`;
  }
  return `"${spec}" is not a revision expectation`;
}

function includesAll(haystack, needles) {
  return needles.filter((needle) => !haystack.includes(needle));
}

function sameValue(actual, expected) {
  return JSON.stringify(actual) === JSON.stringify(expected);
}

/**
 * Checks one tool envelope against a scenario's `expect` block.
 *
 * @param {unknown} envelope - The parsed envelope the page returned.
 * @param {Record<string, unknown>} expect - The expectation block, already substituted.
 * @param {{ previousRevision?: number|null, outputChars?: number }} [context] - Run context.
 * @returns {string[]} The failures; empty when the envelope satisfies every expectation.
 */
export function checkEnvelope(envelope, expect = {}, context = {}) {
  /** @type {string[]} */
  const failures = [];
  const budget = typeof expect.max_chars === 'number' ? expect.max_chars : OUTPUT_BUDGET;
  if (typeof context.outputChars === 'number' && context.outputChars > budget) {
    failures.push(`output is ${context.outputChars} characters, over the ${budget} budget`);
  }
  if (envelope === null || typeof envelope !== 'object' || Array.isArray(envelope)) {
    failures.push(`the envelope is ${JSON.stringify(envelope)}, not an object`);
    return failures;
  }
  const record = /** @type {Record<string, unknown>} */ (envelope);
  const wantOk = expect.ok === undefined ? true : expect.ok === true;
  if (record.ok !== wantOk) {
    failures.push(
      `ok is ${JSON.stringify(record.ok)}, expected ${wantOk}` +
        (record.ok === false ? ` (${record.code}: ${record.message})` : ''),
    );
  }
  if (record.ok === true) {
    for (const key of ['revision', 'changed', 'summary', 'data']) {
      if (!(key in record)) {
        failures.push(`the success envelope has no "${key}"`);
      }
    }
    if (!Array.isArray(record.changed)) {
      failures.push('"changed" is not an array');
    }
  } else if (record.ok === false) {
    for (const key of ['code', 'message', 'recoverable']) {
      if (!(key in record)) {
        failures.push(`the error envelope has no "${key}"`);
      }
    }
  }
  if (expect.code !== undefined && record.code !== expect.code) {
    failures.push(`code is ${JSON.stringify(record.code)}, expected ${expect.code}`);
  }
  if (expect.recoverable !== undefined && record.recoverable !== expect.recoverable) {
    failures.push(
      `recoverable is ${JSON.stringify(record.recoverable)}, expected ${expect.recoverable}`,
    );
  }
  if (expect.revision !== undefined) {
    const failure = matchRevision(
      record.revision,
      /** @type {number|string} */ (expect.revision),
      context.previousRevision ?? null,
    );
    if (failure) {
      failures.push(failure);
    }
  }
  if (expect.changed !== undefined) {
    const missing = includesAll(
      Array.isArray(record.changed) ? record.changed : [],
      /** @type {string[]} */ (expect.changed),
    );
    if (missing.length > 0) {
      failures.push(`changed ${JSON.stringify(record.changed)} is missing ${missing.join(', ')}`);
    }
  }
  if (expect.changed_exactly !== undefined && !sameValue(record.changed, expect.changed_exactly)) {
    failures.push(
      `changed is ${JSON.stringify(record.changed)}, expected ${JSON.stringify(expect.changed_exactly)}`,
    );
  }
  for (const [key, field] of [
    ['summary_includes', 'summary'],
    ['message_includes', 'message'],
  ]) {
    if (expect[key] === undefined) {
      continue;
    }
    const needles = Array.isArray(expect[key]) ? expect[key] : [expect[key]];
    const text = typeof record[field] === 'string' ? record[field] : '';
    for (const needle of needles) {
      if (!text.includes(String(needle))) {
        failures.push(
          `${field} ${JSON.stringify(text)} does not contain ${JSON.stringify(needle)}`,
        );
      }
    }
  }
  failures.push(...checkPaths(record, expect));
  return failures;
}

/**
 * Checks the `data`, `data_defined` and `equals` parts of an `expect` block against any value.
 *
 * @param {unknown} subject - The value to read paths from.
 * @param {Record<string, unknown>} expect - The expectation block, already substituted.
 * @returns {string[]} The failures.
 */
export function checkPaths(subject, expect = {}) {
  /** @type {string[]} */
  const failures = [];
  if (expect.equals !== undefined && !sameValue(subject, expect.equals)) {
    failures.push(`value is ${JSON.stringify(subject)}, expected ${JSON.stringify(expect.equals)}`);
  }
  if (expect.data !== undefined) {
    for (const [path, want] of Object.entries(
      /** @type {Record<string, unknown>} */ (expect.data),
    )) {
      const actual = readPath(subject, path);
      if (!sameValue(actual, want)) {
        failures.push(`${path} is ${JSON.stringify(actual)}, expected ${JSON.stringify(want)}`);
      }
    }
  }
  if (expect.data_defined !== undefined) {
    for (const path of /** @type {string[]} */ (expect.data_defined)) {
      const actual = readPath(subject, path);
      if (actual === undefined || actual === null || actual === '') {
        failures.push(`${path} is ${JSON.stringify(actual)}, expected a value`);
      }
    }
  }
  if (expect.data_includes !== undefined) {
    for (const [path, want] of Object.entries(
      /** @type {Record<string, unknown>} */ (expect.data_includes),
    )) {
      const actual = readPath(subject, path);
      const text = typeof actual === 'string' ? actual : JSON.stringify(actual);
      if (!String(text).includes(String(want))) {
        failures.push(
          `${path} is ${JSON.stringify(actual)}, expected it to contain ${JSON.stringify(want)}`,
        );
      }
    }
  }
  return failures;
}

/**
 * Checks the registered tool surface (count, reads, annotations).
 *
 * @param {{ name: string, description: string|null, annotations: Record<string, unknown> }[]} tools - The registered tools.
 * @param {Record<string, unknown>} expect - The expectation block.
 * @returns {string[]} The failures.
 */
export function checkTools(tools, expect = {}) {
  /** @type {string[]} */
  const failures = [];
  const readOnly = tools.filter((tool) => tool.annotations.readOnly === true);
  const untrusted = tools.filter((tool) => tool.annotations.untrustedContent === true);
  if (expect.count !== undefined && tools.length !== expect.count) {
    failures.push(`${tools.length} tools are registered, expected ${expect.count}`);
  }
  if (expect.read_only !== undefined && readOnly.length !== expect.read_only) {
    failures.push(
      `${readOnly.length} tools carry readOnlyHint (${readOnly.map((tool) => tool.name).join(', ')}), expected ${expect.read_only}`,
    );
  }
  if (expect.untrusted !== undefined && untrusted.length !== expect.untrusted) {
    failures.push(
      `${untrusted.length} tools carry untrustedContentHint, expected ${expect.untrusted}`,
    );
  }
  if (expect.names_include !== undefined) {
    const missing = includesAll(
      tools.map((tool) => tool.name),
      /** @type {string[]} */ (expect.names_include),
    );
    if (missing.length > 0) {
      failures.push(`the surface is missing ${missing.join(', ')}`);
    }
  }
  if (expect.max_description_chars !== undefined) {
    const budget = Number(expect.max_description_chars);
    for (const tool of tools) {
      const length = (tool.description ?? '').length;
      if (length > budget) {
        failures.push(`${tool.name}'s description is ${length} characters, over ${budget}`);
      }
    }
  }
  return failures;
}

/**
 * Applies a step's `capture` block, reading paths out of a result into the variable bag.
 *
 * @param {unknown} subject - The value to read from.
 * @param {Record<string, string>|undefined} capture - Variable name to dotted path.
 * @param {Record<string, unknown>} vars - The bag to write into.
 * @returns {string[]} The failures, when a captured path is missing.
 */
export function captureInto(subject, capture, vars) {
  /** @type {string[]} */
  const failures = [];
  for (const [name, path] of Object.entries(capture ?? {})) {
    const value = readPath(subject, path);
    if (value === undefined) {
      failures.push(`cannot capture ${name}: ${path} is not in the result`);
      continue;
    }
    vars[name] = value;
  }
  return failures;
}

/**
 * Reads a poll step's `until` block: every dotted path must equal its value.
 *
 * @param {unknown} subject - The envelope.
 * @param {Record<string, unknown>} until - Path to value.
 * @returns {boolean} Whether the condition holds.
 */
export function untilSatisfied(subject, until) {
  return Object.entries(until).every(([path, want]) => sameValue(readPath(subject, path), want));
}

/**
 * Describes a step in one line for the run log.
 *
 * @param {Record<string, unknown>} step - The step.
 * @returns {string} The label.
 */
export function stepLabel(step) {
  switch (step.action) {
    case 'tool':
    case 'poll':
      return `${step.action} ${step.tool}`;
    case 'click':
    case 'upload':
      return `${step.action} ${JSON.stringify(step.target)}`;
    case 'permission':
      return `permission ${step.permission}=${step.state}`;
    case 'wait_for':
      return `wait_for ${JSON.stringify(step.text)}`;
    default:
      return String(step.action);
  }
}
