import { useEffect, useSyncExternalStore } from 'react';
import {
  BLACK_KEY_MAP,
  WHITE_KEY_MAP,
  typingKeyToPitch,
  type MusicalTypingSnapshot,
  type PlayedNoteRecorder,
} from '../input/musicalTyping.ts';
import './roll/lane-b.css';

export interface KeyboardPort {
  getSnapshot(): MusicalTypingSnapshot;
  subscribe(listener: () => void): () => void;
  pressKey(key: string, repeat?: boolean): boolean;
  releaseKey(key: string): boolean;
}

export interface KeyboardProps {
  recorder: KeyboardPort | PlayedNoteRecorder;
}

const WHITE_KEYS = Object.keys(WHITE_KEY_MAP);
const BLACK_KEYS = Object.keys(BLACK_KEY_MAP);
const MUSICAL_KEYS = [...WHITE_KEYS, ...BLACK_KEYS];
const PITCH_NAMES = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B'];

function noteName(pitch: number): string {
  return `${PITCH_NAMES[((pitch % 12) + 12) % 12]}${Math.floor(pitch / 12) - 1}`;
}

function isEditableTarget(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement ||
    (target instanceof HTMLElement && target.isContentEditable)
  );
}

export function Keyboard({ recorder }: KeyboardProps) {
  const snapshot = useSyncExternalStore(recorder.subscribe, recorder.getSnapshot);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (isEditableTarget(event.target)) return;
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      if (recorder.pressKey(event.key, event.repeat)) event.preventDefault();
    };
    const onKeyUp = (event: KeyboardEvent): void => {
      if (isEditableTarget(event.target)) return;
      if (recorder.releaseKey(event.key)) event.preventDefault();
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, [recorder]);

  return (
    <section className="keyboard-panel" aria-label="Musical Typing keyboard">
      <header className="lane-b-header">
        <div>
          <h2>Musical Typing</h2>
          <span className="muted">A-K notes, W/E/T/Y/U sharps</span>
        </div>
        <div className="keyboard-status">
          <strong>Octave {snapshot.octave}</strong>
          <span>Velocity {Math.round(snapshot.velocity * 100)}%</span>
          {snapshot.recording ? <span role="status">Recording keyboard take</span> : null}
        </div>
      </header>

      <div className="typing-map" aria-label="Typing controls">
        <button
          className="typing-key control"
          type="button"
          aria-label="Decrease octave"
          onClick={() => recorder.pressKey('z')}
        >
          Z<br />
          Oct −
        </button>
        <button
          className="typing-key control"
          type="button"
          aria-label="Increase octave"
          onClick={() => recorder.pressKey('x')}
        >
          X<br />
          Oct +
        </button>
        <button
          className="typing-key control"
          type="button"
          aria-label="Decrease velocity"
          onClick={() => recorder.pressKey('c')}
        >
          C<br />
          Vel −
        </button>
        <button
          className="typing-key control"
          type="button"
          aria-label="Increase velocity"
          onClick={() => recorder.pressKey('v')}
        >
          V<br />
          Vel +
        </button>
        {MUSICAL_KEYS.map((key) => {
          const pitch = typingKeyToPitch(key, snapshot.octave);
          const active = pitch !== null && snapshot.activePitches.includes(pitch);
          return (
            <span key={key} className={`typing-key${active ? ' active' : ''}`}>
              {key.toUpperCase()}
            </span>
          );
        })}
      </div>

      <div className="piano-keys" aria-label="On-screen piano">
        {MUSICAL_KEYS.map((key) => {
          const pitch = typingKeyToPitch(key, snapshot.octave);
          if (pitch === null) return null;
          const black = key in BLACK_KEY_MAP;
          const active = snapshot.activePitches.includes(pitch);
          return (
            <button
              key={key}
              className={`piano-key ${black ? 'black' : 'white'}${active ? ' active' : ''}`}
              type="button"
              aria-pressed={active}
              aria-label={`${key.toUpperCase()} ${noteName(pitch)}`}
              onPointerDown={(event) => {
                event.preventDefault();
                recorder.pressKey(key);
              }}
              onPointerUp={() => recorder.releaseKey(key)}
              onPointerCancel={() => recorder.releaseKey(key)}
              onPointerLeave={(event) => {
                if (event.buttons !== 0) recorder.releaseKey(key);
              }}
            >
              {noteName(pitch)}
            </button>
          );
        })}
      </div>
    </section>
  );
}
