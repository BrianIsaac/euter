/**
 * The diagnostics panel (plan Architecture item 10; Day-one checks 0-7), always reachable from
 * the header. Everything the operator needs to record is on one screen.
 */
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import type { AudioReading } from '../webmcp/environment.ts';
import { fetchPolicyHeaders, queryPermission } from '../webmcp/environment.ts';
import { formatStatus } from '../webmcp/registry.ts';
import type { Runtime } from '../webmcp/runtime.ts';
import {
  createProbeContext,
  playTestTone,
  readAudio,
  testMicrophone,
  testMidi,
  type MicrophoneResult,
  type MidiResult,
} from './diagnosticsProbes.ts';

export interface DiagnosticsProps {
  runtime: Runtime;
  onClose: () => void;
}

function yesNo(value: boolean | null): string {
  if (value === null) {
    return 'n/a';
  }
  return value ? 'yes' : 'no';
}

function formatAudio(reading: AudioReading | null): string {
  if (!reading) {
    return 'not read yet';
  }
  const base =
    reading.baseLatency === null ? 'n/a' : `${(reading.baseLatency * 1000).toFixed(1)} ms`;
  const output =
    reading.outputLatency === null ? 'n/a' : `${(reading.outputLatency * 1000).toFixed(1)} ms`;
  return `${reading.state}, ${reading.sampleRate} Hz, base ${base}, output ${output}`;
}

function formatArgs(args: unknown): string {
  const text = JSON.stringify(args) ?? 'undefined';
  return text.length > 80 ? `${text.slice(0, 77)}...` : text;
}

/**
 * Renders the panel.
 *
 * @param props - The runtime and the close handler.
 * @returns The panel.
 */
export function Diagnostics({ runtime, onClose }: DiagnosticsProps) {
  const { registry, environment, engine, bus } = runtime;
  const status = useSyncExternalStore(registry.subscribe, registry.getStatus);
  const calls = useSyncExternalStore(registry.subscribe, registry.getCalls);
  const env = useSyncExternalStore(environment.subscribe, environment.get);
  const engineState = useSyncExternalStore(engine.subscribe, engine.getSnapshot);
  const song = useSyncExternalStore(bus.subscribe, bus.getDocument);
  const contextRef = useRef<AudioContext | null>(null);
  const [tonePlayed, setTonePlayed] = useState(false);
  const [microphone, setMicrophone] = useState<MicrophoneResult | null>(null);
  const [level, setLevel] = useState(0);
  const [midi, setMidi] = useState<MidiResult | null>(null);

  const refresh = useCallback(async () => {
    const [headers, microphonePermission, midiPermission] = await Promise.all([
      fetchPolicyHeaders(),
      queryPermission('microphone'),
      queryPermission('midi'),
    ]);
    environment.update({
      headers,
      permissions: { microphone: microphonePermission, midi: midiPermission },
    });
  }, [environment]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    const context = createProbeContext();
    contextRef.current = context;
    if (context) {
      environment.update({ audio: { ...environment.get().audio, before: readAudio(context) } });
    }
    return () => {
      void context?.close().catch(() => undefined);
      contextRef.current = null;
    };
  }, [environment]);

  useEffect(
    () => () => {
      if (microphone?.ok) {
        microphone.stop();
      }
    },
    [microphone],
  );

  const onPlayTone = async (): Promise<void> => {
    const context = contextRef.current;
    if (!context) {
      return;
    }
    const after = await playTestTone(context);
    environment.update({ audio: { ...environment.get().audio, after } });
    setTonePlayed(true);
  };

  const onTestMicrophone = async (): Promise<void> => {
    if (microphone?.ok) {
      microphone.stop();
      setMicrophone(null);
      setLevel(0);
      return;
    }
    const context = contextRef.current ?? createProbeContext();
    if (!context) {
      setMicrophone({ ok: false, error: 'NotSupportedError: no AudioContext' });
      return;
    }
    contextRef.current = context;
    const result = await testMicrophone(
      {
        getUserMedia: (constraints) => navigator.mediaDevices.getUserMedia(constraints),
        context,
      },
      setLevel,
    );
    setMicrophone(result);
    await refresh();
  };

  const onTestMidi = async (): Promise<void> => {
    setMidi(await testMidi());
    await refresh();
  };

  const { snapshot } = env;
  const brands = snapshot.brands
    ? snapshot.brands.map((brand) => `${brand.brand} ${brand.version}`).join(', ')
    : 'userAgentData not available';

  return (
    <aside className="drawer" aria-label="Diagnostics">
      <header className="drawer-header">
        <h2>Diagnostics</h2>
        <button type="button" onClick={onClose} aria-label="Close diagnostics">
          Close
        </button>
      </header>

      <section className="diag-section">
        <h3>Identity</h3>
        <dl>
          <dt>navigator.userAgent</dt>
          <dd className="mono">{snapshot.userAgent}</dd>
          <dt>userAgentData.brands</dt>
          <dd>{brands}</dd>
          <dt>Platform</dt>
          <dd>{snapshot.platform ?? 'n/a'}</dd>
          <dt>Secure context</dt>
          <dd>{yesNo(snapshot.secureContext)}</dd>
          <dt>window.originAgentCluster</dt>
          <dd>{yesNo(snapshot.originAgentCluster)}</dd>
        </dl>
      </section>

      <section className="diag-section">
        <h3>WebMCP</h3>
        <dl>
          <dt>document.modelContext</dt>
          <dd>{yesNo(snapshot.documentModelContext)}</dd>
          <dt>navigator.modelContext</dt>
          <dd>{yesNo(snapshot.navigatorModelContext)}</dd>
          <dt>Same object</dt>
          <dd>{yesNo(snapshot.sameContextObject)}</dd>
          <dt>Registry status</dt>
          <dd data-testid="registry-status">{formatStatus(status)}</dd>
          <dt>Tools defined</dt>
          <dd>{registry.tools.length}</dd>
          <dt>Origin-trial token</dt>
          <dd>
            {snapshot.originTrialToken.present
              ? `present (${snapshot.originTrialToken.prefix}...)`
              : 'absent'}
          </dd>
        </dl>
      </section>

      <section className="diag-section">
        <h3>Response headers from fetch("/")</h3>
        <dl>
          <dt>Status</dt>
          <dd>{env.headers ? (env.headers.error ?? env.headers.status) : 'fetching'}</dd>
          <dt>Permissions-Policy</dt>
          <dd className="mono">{env.headers?.permissionsPolicy ?? 'absent'}</dd>
          <dt>Origin-Agent-Cluster</dt>
          <dd className="mono">{env.headers?.originAgentCluster ?? 'absent'}</dd>
        </dl>
        <button type="button" onClick={() => void refresh()}>
          Refresh headers and permissions
        </button>
      </section>

      <section className="diag-section">
        <h3>Audio</h3>
        <dl>
          <dt>Before the first click</dt>
          <dd data-testid="audio-before">{formatAudio(env.audio.before)}</dd>
          <dt>After the click</dt>
          <dd data-testid="audio-after">{formatAudio(env.audio.after)}</dd>
        </dl>
        <button type="button" onClick={() => void onPlayTone()}>
          {tonePlayed ? 'Play test tone again' : 'Play test tone'}
        </button>
      </section>

      <section className="diag-section">
        <h3>Requested-take backing</h3>
        <dl>
          <dt>Actual start bar</dt>
          <dd data-testid="take-backing-start">
            {engineState.takeBacking === null
              ? 'not started yet'
              : `bar ${engineState.takeBacking.startBar}`}
          </dd>
          <dt>Requested track</dt>
          <dd data-testid="take-backing-track">
            {engineState.takeBacking === null
              ? 'n/a'
              : `${song.tracks.find(({ id }) => id === engineState.takeBacking?.trackId)?.name ?? 'Unknown track'} (${engineState.takeBacking.trackId})`}
          </dd>
          <dt>Effective state</dt>
          <dd data-testid="take-backing-state">
            {engineState.takeBacking === null
              ? 'n/a'
              : `${engineState.takeBacking.silent ? 'silent' : 'audible'} (mute ${engineState.takeBacking.mute ? 'on' : 'off'}, solo ${engineState.takeBacking.solo ? 'on' : 'off'})`}
          </dd>
        </dl>
      </section>

      <section className="diag-section">
        <h3>Microphone</h3>
        <dl>
          <dt>Permission state</dt>
          <dd>{env.permissions.microphone ?? 'querying'}</dd>
          <dt>Result</dt>
          <dd data-testid="microphone-result">
            {microphone === null
              ? 'not tested'
              : microphone.ok
                ? `open: ${microphone.label}`
                : microphone.error}
          </dd>
        </dl>
        <meter min={0} max={1} value={level} aria-label="Microphone level" />
        <button type="button" onClick={() => void onTestMicrophone()}>
          {microphone?.ok ? 'Stop microphone' : 'Test microphone'}
        </button>
      </section>

      <section className="diag-section">
        <h3>MIDI</h3>
        <dl>
          <dt>Permission state</dt>
          <dd>{env.permissions.midi ?? 'querying'}</dd>
          <dt>Result</dt>
          <dd data-testid="midi-result">
            {midi === null
              ? 'not tested'
              : midi.ok
                ? `${midi.inputs.length} input(s)${midi.inputs.length > 0 ? `: ${midi.inputs.join(', ')}` : ''}, ${midi.outputs} output(s)`
                : midi.error}
          </dd>
        </dl>
        <button type="button" onClick={() => void onTestMidi()}>
          Test MIDI
        </button>
      </section>

      <section className="diag-section">
        <h3>Last {calls.length} tool calls</h3>
        {calls.length === 0 ? (
          <p className="muted">No tool calls yet.</p>
        ) : (
          <table className="calls">
            <thead>
              <tr>
                <th>Tool</th>
                <th>Arguments</th>
                <th>Status</th>
                <th>ms</th>
              </tr>
            </thead>
            <tbody>
              {[...calls].reverse().map((call) => (
                <tr key={call.id} data-testid="tool-call">
                  <td className="mono">{call.tool}</td>
                  <td className="mono">{formatArgs(call.args)}</td>
                  <td>
                    {call.status === 'error' ? `error ${call.code ?? ''}`.trim() : call.status}
                  </td>
                  <td>{call.durationMs ?? '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </aside>
  );
}
