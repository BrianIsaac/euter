/**
 * `get_song_state` (read): the agent's first call. One bounded object under 1,200 characters with
 * everything needed to decide the next move (plan Tool surface; music §7.1).
 */
import { selectSongState } from '../../song/selectors.ts';
import { descriptions } from '../descriptions.ts';
import { ok } from '../envelope.ts';
import { getSongStateInput } from '../schemas.ts';
import type { ToolDefinition } from '../types.ts';

export const getSongState: ToolDefinition<typeof getSongStateInput> = {
  name: 'get_song_state',
  title: 'Read the song',
  kind: 'read',
  description: descriptions.get_song_state,
  input: getSongStateInput,
  untrustedContent: true,
  example: {},
  badExample: { verbose: true },
  execute(_args, context) {
    const song = context.bus.getDocument();
    const state = JSON.parse(selectSongState(song, context.engine.stateContext())) as Record<
      string,
      unknown
    >;
    const hasMaterial =
      song.chords.length > 0 ||
      song.takes.length > 0 ||
      song.tracks.some((track) => track.notes.length > 0);
    const summary = hasMaterial
      ? `${song.title}: ${song.bars} bars, ${song.bpm} bpm, ${song.key.name}, ${song.tracks.length} tracks`
      : `${song.title} is empty: no notes yet. Start with a hum, play the keys, or import audio.`;
    return ok(song.revision, [], summary, state);
  },
};
