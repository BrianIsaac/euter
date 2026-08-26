/** Count-in and click scheduling on Tone.Transport (plan Phases, 28 Aug). */

export interface MetronomeBeat {
  bar: number;
  beat: number;
  accented: boolean;
  time: number;
}

export interface MetronomeTransport {
  bpm: { value: number };
  position: unknown;
  schedule(callback: (time: number) => void, position: string): number;
  scheduleRepeat(callback: (time: number) => void, interval: string): number;
  clear(id: number): void;
  start(): void;
}

export interface MetronomeClick {
  play(time: number, accented: boolean): void;
  dispose(): void;
}

export interface CountInOptions {
  bars: 1 | 2;
  bpm: number;
  beatsPerBar?: number;
  continueClick?: boolean;
  onBeat?: ((beat: MetronomeBeat) => void) | undefined;
  onComplete?: (() => void) | undefined;
}

export interface ScheduledMetronome {
  duration_s: number;
  cancel(): void;
}

export interface Metronome {
  scheduleCountIn(options: CountInOptions): Promise<ScheduledMetronome>;
  stop(): void;
  dispose(): void;
}

export interface MetronomeDependencies {
  transport: MetronomeTransport;
  click: MetronomeClick;
}

/** Creates a metronome; Tone is imported only when the first count-in is requested. */
export function createMetronome(
  provideDependencies: () => Promise<MetronomeDependencies> = defaultDependencies,
): Metronome {
  let dependencies: MetronomeDependencies | null = null;
  let scheduled: number[] = [];

  const clear = (): void => {
    if (!dependencies) return;
    for (const id of scheduled) dependencies.transport.clear(id);
    scheduled = [];
  };

  return {
    async scheduleCountIn(options) {
      if (options.bpm < 40 || options.bpm > 220) {
        throw new RangeError('Count-in tempo must be between 40 and 220 bpm.');
      }
      dependencies ??= await provideDependencies();
      clear();
      const beatsPerBar = options.beatsPerBar ?? 4;
      dependencies.transport.bpm.value = options.bpm;
      dependencies.transport.position = '0:0:0';
      for (let bar = 0; bar < options.bars; bar += 1) {
        for (let beat = 0; beat < beatsPerBar; beat += 1) {
          const accented = beat === 0;
          const id = dependencies.transport.schedule((time) => {
            dependencies?.click.play(time, accented);
            options.onBeat?.({ bar: bar + 1, beat: beat + 1, accented, time });
          }, `${bar}:${beat}:0`);
          scheduled.push(id);
        }
      }
      const completion = dependencies.transport.schedule(
        () => options.onComplete?.(),
        `${options.bars}:0:0`,
      );
      scheduled.push(completion);
      if (options.continueClick) {
        let beat = 0;
        const repeat = dependencies.transport.scheduleRepeat((time) => {
          const accented = beat % beatsPerBar === 0;
          dependencies?.click.play(time, accented);
          beat += 1;
        }, '4n');
        scheduled.push(repeat);
      }
      dependencies.transport.start();
      return {
        duration_s: (options.bars * beatsPerBar * 60) / options.bpm,
        cancel: clear,
      };
    },
    stop: clear,
    dispose() {
      clear();
      dependencies?.click.dispose();
      dependencies = null;
    },
  };
}

async function defaultDependencies(): Promise<MetronomeDependencies> {
  const tone = await import('tone');
  const synth = new tone.Synth({
    oscillator: { type: 'sine' },
    envelope: { attack: 0.001, decay: 0.04, sustain: 0, release: 0.02 },
    volume: -12,
  }).toDestination();
  return {
    transport: tone.getTransport(),
    click: {
      play: (time, accented) => synth.triggerAttackRelease(accented ? 'C6' : 'G5', 0.04, time),
      dispose: () => synth.dispose(),
    },
  };
}
