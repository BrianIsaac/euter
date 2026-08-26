/**
 * `get_diagnostics`: the probe read. Returns a serialised envelope of exactly 1,400 characters
 * (day-one check 7) whose last field, `tail_marker`, the agent is asked to quote.
 */
import { descriptions } from '../descriptions.ts';
import { ok, serialisedLength, type OkEnvelope } from '../envelope.ts';
import type { EnvironmentState } from '../environment.ts';
import { getDiagnosticsInput } from '../schemas.ts';
import type { RegistryView, ToolDefinition } from '../types.ts';

export const DIAGNOSTICS_PAYLOAD_LENGTH = 1400;

export const TAIL_MARKER = 'EUTERPE-TAIL-7F3A';

export interface DiagnosticsData {
  app: { name: string; version: string };
  user_agent: string;
  brands: string | null;
  contexts: { document: boolean; navigator: boolean; same_object: boolean | null };
  tools: { status: string; count: number; calls_logged: number };
  audio: { before: string | null; after: string | null };
  permissions: { microphone: string | null; midi: string | null };
  headers: { permissions_policy: string | null; origin_agent_cluster: string | null };
  origin_trial: { present: boolean; prefix: string };
  secure_context: boolean;
  revision: number;
  padding: string;
  tail_marker: string;
}

function describeAudio(reading: EnvironmentState['audio']['before']): string | null {
  if (!reading) {
    return null;
  }
  const latency = reading.baseLatency === null ? 'n/a' : `${reading.baseLatency.toFixed(4)}s`;
  return `${reading.state} @ ${reading.sampleRate} Hz, base latency ${latency}`;
}

/**
 * Builds the diagnostics payload, padded so the serialised envelope is exactly the target length.
 *
 * @param state - The environment store's state.
 * @param registry - The registry view.
 * @param revision - The current song revision.
 * @param version - The app version.
 * @param targetLength - The serialised length to reach; defaults to 1,400.
 * @returns The envelope.
 */
export function buildDiagnostics(
  state: EnvironmentState,
  registry: RegistryView,
  revision: number,
  version: string,
  targetLength = DIAGNOSTICS_PAYLOAD_LENGTH,
): OkEnvelope<DiagnosticsData> {
  const { snapshot, headers, permissions, audio } = state;
  const data: DiagnosticsData = {
    app: { name: 'Euterpe', version },
    user_agent: snapshot.userAgent,
    brands: snapshot.brands
      ? snapshot.brands.map((b) => `${b.brand}/${b.version}`).join(', ')
      : null,
    contexts: {
      document: snapshot.documentModelContext,
      navigator: snapshot.navigatorModelContext,
      same_object: snapshot.sameContextObject,
    },
    tools: {
      status: registry.statusText(),
      count: registry.toolCount(),
      calls_logged: registry.callCount(),
    },
    audio: { before: describeAudio(audio.before), after: describeAudio(audio.after) },
    permissions: { microphone: permissions.microphone, midi: permissions.midi },
    headers: {
      permissions_policy: headers?.permissionsPolicy ?? null,
      origin_agent_cluster: headers?.originAgentCluster ?? null,
    },
    origin_trial: snapshot.originTrialToken,
    secure_context: snapshot.secureContext,
    revision,
    padding: '',
    tail_marker: TAIL_MARKER,
  };
  const summary = 'Diagnostics read; quote tail_marker to confirm the whole payload arrived.';
  const base = serialisedLength(ok(revision, [], summary, data));
  data.padding = '.'.repeat(Math.max(0, targetLength - base));
  return ok(revision, [], summary, data);
}

export const getDiagnostics: ToolDefinition<typeof getDiagnosticsInput> = {
  name: 'get_diagnostics',
  title: 'Get diagnostics',
  kind: 'read',
  description: descriptions.get_diagnostics,
  input: getDiagnosticsInput,
  untrustedContent: true,
  example: {},
  badExample: { verbose: true },
  execute(_args, context) {
    return buildDiagnostics(
      context.environment.get(),
      context.registry,
      context.bus.getDocument().revision,
      __APP_VERSION__,
    );
  },
};
