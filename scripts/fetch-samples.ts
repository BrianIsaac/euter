import { spawn } from 'node:child_process';
import { mkdir, readFile, rename, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

export type SampleLicence = 'Public domain' | 'CC0 1.0';

export interface SampleAsset {
  instrument: string;
  destination: string;
  source: string;
  sourceUrl: string;
  licence: SampleLicence;
  bundled: boolean;
}

const SPLENDID = 'https://smpldsnds.github.io/sfzinstruments-splendid-grand-piano/samples';
const DRUM_MACHINES = 'https://smpldsnds.github.io/drum-machines';
const VCSL = 'https://smpldsnds.github.io/sgossner-vcsl';

function vcsl(pathname: string): string {
  return `${VCSL}/${pathname.split('/').map(encodeURIComponent).join('/')}`;
}

function assets(
  instrument: string,
  source: string,
  licence: SampleLicence,
  bundled: boolean,
  rows: readonly (readonly [destination: string, sourceUrl: string])[],
): SampleAsset[] {
  return rows.map(([destination, sourceUrl]) => ({
    instrument,
    destination: `${instrument}/${destination}.ogg`,
    source,
    sourceUrl,
    licence,
    bundled,
  }));
}

/** Exact source-to-output ledger used by both the downloader and SAMPLES.md. */
export const SAMPLE_ASSETS: readonly SampleAsset[] = [
  ...assets(
    'grand-piano',
    'Splendid Grand Piano (Akai, smpldsnds distribution)',
    'Public domain',
    true,
    [
      ['c2', `${SPLENDID}/MF%20C2.ogg`],
      ['c3', `${SPLENDID}/MF%20C3.ogg`],
      ['c4', `${SPLENDID}/MF%20C4.ogg`],
      ['b4', `${SPLENDID}/Mf%20B4.ogg`],
      ['c6', `${SPLENDID}/Mf%20C6.ogg`],
    ],
  ),
  ...assets('studio-kit', 'Roland TR-808 pack (smpldsnds)', 'Public domain', true, [
    ['kick', `${DRUM_MACHINES}/TR-808/kick/bd5000.ogg`],
    ['snare', `${DRUM_MACHINES}/TR-808/snare/sd5000.ogg`],
    ['closed_hat', `${DRUM_MACHINES}/TR-808/hihat-close/ch.ogg`],
    ['open_hat', `${DRUM_MACHINES}/TR-808/hihat-open/oh50.ogg`],
  ]),
  ...assets('pocket-kit', 'Yamaha MR10 pack (smpldsnds)', 'Public domain', false, [
    ['kick', `${DRUM_MACHINES}/Yamaha-MR10/kick.ogg`],
    ['snare', `${DRUM_MACHINES}/Yamaha-MR10/snare.ogg`],
    ['closed_hat', `${DRUM_MACHINES}/Yamaha-MR10/chihat.ogg`],
    ['open_hat', `${DRUM_MACHINES}/Yamaha-MR10/ohihat.ogg`],
  ]),
  ...assets('dusty-kit', 'Roland CR-8000 pack (smpldsnds)', 'Public domain', false, [
    ['kick', `${DRUM_MACHINES}/Roland-CR-8000/kick.ogg`],
    ['snare', `${DRUM_MACHINES}/Roland-CR-8000/snare.ogg`],
    ['closed_hat', `${DRUM_MACHINES}/Roland-CR-8000/hihat-closed.ogg`],
    ['open_hat', `${DRUM_MACHINES}/Roland-CR-8000/hihat-open.ogg`],
  ]),
  ...assets('electric-piano', 'VCSL TX81Z FM Piano', 'CC0 1.0', false, [
    ['c2', vcsl('Electrophones/TX81Z/FM Piano/FMPiano_C2_vl2.ogg')],
    ['c3', vcsl('Electrophones/TX81Z/FM Piano/FMPiano_C3_vl2.ogg')],
    ['c4', vcsl('Electrophones/TX81Z/FM Piano/FMPiano_C4_vl2.ogg')],
    ['c5', vcsl('Electrophones/TX81Z/FM Piano/FMPiano_C5_vl2.ogg')],
  ]),
  ...assets('vcsl-strings', 'VCSL bowed psaltery', 'CC0 1.0', false, [
    [
      'c2',
      vcsl(
        'Chordophones/Zithers/Psaltery, Bowed and Plucked/LongBow/BowedPsaltery_C4_Main_LongBow_rr1.ogg',
      ),
    ],
    [
      'c3',
      vcsl(
        'Chordophones/Zithers/Psaltery, Bowed and Plucked/LongBow/BowedPsaltery_C4_Main_LongBow_rr1.ogg',
      ),
    ],
    [
      'c4',
      vcsl(
        'Chordophones/Zithers/Psaltery, Bowed and Plucked/LongBow/BowedPsaltery_C4_Main_LongBow_rr1.ogg',
      ),
    ],
    [
      'c5',
      vcsl(
        'Chordophones/Zithers/Psaltery, Bowed and Plucked/LongBow/BowedPsaltery_C5_Main_LongBow_rr1.ogg',
      ),
    ],
  ]),
  ...assets('vcsl-vibraphone', 'VCSL vibraphone, hard mallets', 'CC0 1.0', false, [
    [
      'c2',
      vcsl('Idiophones/Struck Idiophones/Vibraphone/Hard Mallets/Vibes_hard_C3_v2_rr1_Main.ogg'),
    ],
    [
      'c3',
      vcsl('Idiophones/Struck Idiophones/Vibraphone/Hard Mallets/Vibes_hard_C3_v2_rr1_Main.ogg'),
    ],
    [
      'c4',
      vcsl('Idiophones/Struck Idiophones/Vibraphone/Hard Mallets/Vibes_hard_C5_v2_rr1_Main.ogg'),
    ],
    [
      'c5',
      vcsl('Idiophones/Struck Idiophones/Vibraphone/Hard Mallets/Vibes_hard_C5_v2_rr1_Main.ogg'),
    ],
  ]),
  ...assets('vcsl-recorder', 'VCSL baroque alto recorder', 'CC0 1.0', false, [
    [
      'c2',
      vcsl(
        'Aerophones/Edge-blown Aerophones/Baroque Alto Recorder/Sustain/AltRecorder_Sus_C4_rr1_Main.ogg',
      ),
    ],
    [
      'c3',
      vcsl(
        'Aerophones/Edge-blown Aerophones/Baroque Alto Recorder/Sustain/AltRecorder_Sus_C4_rr1_Main.ogg',
      ),
    ],
    [
      'c4',
      vcsl(
        'Aerophones/Edge-blown Aerophones/Baroque Alto Recorder/Sustain/AltRecorder_Sus_C4_rr1_Main.ogg',
      ),
    ],
    [
      'c5',
      vcsl(
        'Aerophones/Edge-blown Aerophones/Baroque Alto Recorder/Sustain/AltRecorder_Sus_C5_rr1_Main.ogg',
      ),
    ],
  ]),
  ...assets('vcsl-saxello', 'VCSL Saxello', 'CC0 1.0', false, [
    [
      'c2',
      vcsl(
        'Aerophones/Reed Aerophones/Saxello/Non-Vibrato/BrettSaxello_SusNV_MainSpirit_D3_vl2_rr2.ogg',
      ),
    ],
    [
      'c3',
      vcsl(
        'Aerophones/Reed Aerophones/Saxello/Non-Vibrato/BrettSaxello_SusNV_MainSpirit_D3_vl2_rr2.ogg',
      ),
    ],
    [
      'c4',
      vcsl(
        'Aerophones/Reed Aerophones/Saxello/Non-Vibrato/BrettSaxello_SusNV_MainSpirit_D4_vl2_rr2.ogg',
      ),
    ],
    [
      'c5',
      vcsl(
        'Aerophones/Reed Aerophones/Saxello/Non-Vibrato/BrettSaxello_SusNV_MainSpirit_E5_vl2_rr2.ogg',
      ),
    ],
  ]),
];

export interface FetchSampleOptions {
  upload: boolean;
  bundledOnly: boolean;
}

export function parseArgs(argv: readonly string[]): FetchSampleOptions {
  const argumentsWithoutSeparator = argv.filter((argument) => argument !== '--');
  const known = new Set(['--upload', '--bundled-only']);
  const unknown = argumentsWithoutSeparator.find((argument) => !known.has(argument));
  if (unknown) throw new Error(`Unknown argument: ${unknown}`);
  const upload = argumentsWithoutSeparator.includes('--upload');
  const bundledOnly = argumentsWithoutSeparator.includes('--bundled-only');
  if (upload && bundledOnly) throw new Error('--upload and --bundled-only cannot be combined.');
  return { upload, bundledOnly };
}

export function renderSamplesMarkdown(sampleAssets: readonly SampleAsset[]): string {
  const rows = new Map<string, Pick<SampleAsset, 'source' | 'licence' | 'sourceUrl'>>();
  for (const asset of sampleAssets) {
    rows.set(`${asset.source}:${asset.licence}`, asset);
  }
  const table = [...rows.values()]
    .map(({ source, licence, sourceUrl }) => `| ${source} | ${licence} | ${sourceUrl} |`)
    .join('\n');
  return `# Samples and codec licences

Euterpe's bundled subset is one public-domain piano and one public-domain drum kit. The current
bundled files total under 4 MB; all other sampled instruments are prepared for the public R2
sample origin. Synth bass and pad are the two deliberate Tone.js exceptions to the sampled
catalogue. Files are fetched from the named upstream source and normalised to Opus by
\`scripts/fetch-samples.ts\`.

| Source | Licence | Upstream asset example |
| --- | --- | --- |
${table}

Splendid Grand Piano is used under its public-domain dedication. The VCSL assets are CC0 1.0.
The selected smpldsnds drum-machine packs are public domain. Salamander/gleitz samples are not
used, so their CC BY 3.0 attribution requirement does not apply.

## Fetch and R2 upload

\`pnpm samples -- --bundled-only\` refreshes only the committed subset.
\`pnpm samples\` also prepares the remote catalogue in \`samples-dist/\` but does not claim an
upload. \`pnpm samples -- --upload\` uploads those remote files with
\`Cache-Control: public, max-age=31536000, immutable\` after all five variables below are present
in the gitignored \`.env.local\` or process environment:

- \`R2_ACCOUNT_ID\`
- \`R2_ACCESS_KEY_ID\`
- \`R2_SECRET_ACCESS_KEY\`
- \`R2_BUCKET\`
- \`R2_PUBLIC_URL\` (also exposed to Vite as \`VITE_SAMPLES_BASE_URL\`)

The upload uses rclone's S3 backend against the account's Cloudflare R2 endpoint. Missing
credentials stop the upload before any network mutation.

## Export codecs

Tone.js and smplr are MIT. MIDI export uses @tonejs/midi (MIT), WAV export uses
audiobuffer-to-wav (MIT), and MP3 export uses mediabunny with @mediabunny/mp3-encoder. Those
packages are consumed unmodified under MPL-2.0; the extension's embedded LAME encoder is LGPL.
`;
}

async function run(options: FetchSampleOptions): Promise<void> {
  const root = process.cwd();
  const cache = path.join(root, '.sample-cache');
  const remote = path.join(root, 'samples-dist');
  const selected = options.bundledOnly
    ? SAMPLE_ASSETS.filter(({ bundled }) => bundled)
    : SAMPLE_ASSETS;
  await mkdir(cache, { recursive: true });

  for (const [index, asset] of selected.entries()) {
    const output = asset.bundled ? bundledPath(root, asset) : path.join(remote, asset.destination);
    const cached = path.join(cache, `${index}-${path.basename(asset.destination)}`);
    await download(asset.sourceUrl, cached);
    await mkdir(path.dirname(output), { recursive: true });
    await ensureOpus(cached, output);
    const bytes = (await stat(output)).size;
    process.stdout.write(`${asset.instrument}/${path.basename(output)} ${bytes} bytes\n`);
  }

  const samplesDocument = path.join(root, 'SAMPLES.md');
  await writeFile(samplesDocument, renderSamplesMarkdown(SAMPLE_ASSETS), 'utf8');
  await execute('corepack', ['pnpm', 'exec', 'prettier', '--write', samplesDocument]);
  const bundledBytes = await sumBundledBytes(root);
  if (bundledBytes >= 4_000_000) {
    throw new Error(`Bundled sample subset is ${bundledBytes} bytes; it must remain under 4 MB.`);
  }
  process.stdout.write(`Bundled subset: ${bundledBytes} bytes (< 4 MB).\n`);

  if (options.upload) await uploadToR2(remote);
  else if (!options.bundledOnly)
    process.stdout.write('Prepared remote catalogue; no upload requested.\n');
}

function bundledPath(root: string, asset: SampleAsset): string {
  const [, filename] = asset.destination.split('/');
  if (!filename) throw new Error(`Invalid destination: ${asset.destination}`);
  const directory = asset.instrument === 'grand-piano' ? 'piano/grand' : 'drums/studio-kit';
  return path.join(root, 'public/samples', directory, filename);
}

async function download(url: string, destination: string): Promise<void> {
  try {
    if ((await stat(destination)).size > 0) return;
  } catch {
    // A missing cache entry is the normal first run.
  }
  const response = await fetch(url, { redirect: 'follow' });
  if (!response.ok) throw new Error(`Sample download failed (${response.status}): ${url}`);
  await writeFile(destination, new Uint8Array(await response.arrayBuffer()));
}

async function ensureOpus(input: string, output: string): Promise<void> {
  const probe = await execute('ffprobe', [
    '-v',
    'error',
    '-select_streams',
    'a:0',
    '-show_entries',
    'stream=codec_name',
    '-of',
    'default=noprint_wrappers=1:nokey=1',
    input,
  ]);
  if (probe.trim() === 'opus') {
    const temporary = `${output}.partial`;
    await writeFile(temporary, await readFile(input));
    await rename(temporary, output);
    return;
  }
  await execute('ffmpeg', [
    '-hide_banner',
    '-loglevel',
    'error',
    '-y',
    '-i',
    input,
    '-c:a',
    'libopus',
    '-b:a',
    '96k',
    output,
  ]);
}

async function sumBundledBytes(root: string): Promise<number> {
  const bundled = SAMPLE_ASSETS.filter(({ bundled }) => bundled);
  const sizes = await Promise.all(
    bundled.map(async (asset) => (await stat(bundledPath(root, asset))).size),
  );
  return sizes.reduce((total, size) => total + size, 0);
}

async function uploadToR2(directory: string): Promise<void> {
  const required = [
    'R2_ACCOUNT_ID',
    'R2_ACCESS_KEY_ID',
    'R2_SECRET_ACCESS_KEY',
    'R2_BUCKET',
    'R2_PUBLIC_URL',
  ] as const;
  const missing = required.filter((name) => !process.env[name]);
  if (missing.length > 0) throw new Error(`R2 upload not started; missing ${missing.join(', ')}.`);
  const account = process.env.R2_ACCOUNT_ID ?? '';
  const bucket = process.env.R2_BUCKET ?? '';
  await execute(
    'rclone',
    [
      'copy',
      directory,
      `r2:${bucket}`,
      '--header-upload',
      'Cache-Control: public, max-age=31536000, immutable',
    ],
    {
      ...process.env,
      RCLONE_CONFIG_R2_TYPE: 's3',
      RCLONE_CONFIG_R2_PROVIDER: 'Cloudflare',
      RCLONE_CONFIG_R2_ACCESS_KEY_ID: process.env.R2_ACCESS_KEY_ID ?? '',
      RCLONE_CONFIG_R2_SECRET_ACCESS_KEY: process.env.R2_SECRET_ACCESS_KEY ?? '',
      RCLONE_CONFIG_R2_ENDPOINT: `https://${account}.r2.cloudflarestorage.com`,
    },
  );
  process.stdout.write(`Uploaded immutable catalogue for ${process.env.R2_PUBLIC_URL}.\n`);
}

function execute(
  command: string,
  args: readonly string[],
  env: NodeJS.ProcessEnv = process.env,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, [...args], { env, stdio: ['ignore', 'pipe', 'pipe'] });
    const output: Buffer[] = [];
    const errors: Buffer[] = [];
    child.stdout.on('data', (chunk: Buffer) => output.push(chunk));
    child.stderr.on('data', (chunk: Buffer) => errors.push(chunk));
    child.once('error', reject);
    child.once('exit', (code) => {
      if (code === 0) resolve(Buffer.concat(output).toString('utf8'));
      else
        reject(
          new Error(`${command} exited ${code ?? 'without a code'}: ${Buffer.concat(errors)}`),
        );
    });
  });
}

const argvEntry = process.argv[1];
if (argvEntry && import.meta.url === pathToFileURL(argvEntry).href) {
  await run(parseArgs(process.argv.slice(2)));
}
