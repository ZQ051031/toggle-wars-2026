import { createHash } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import '../env.js';
import { CONTROL, TREATMENT } from '../experiment.js';

const base = process.env.APP_URL || 'http://127.0.0.1:3000';
const visitors = Number(process.env.SIM_VISITORS || 1800);
const seed = process.env.SIM_SEED || 'packlight-toggle-wars-v1';
const rates = { [CONTROL]: 0.24, [TREATMENT]: 0.37 };
const examples = {};
const arms = Object.fromEntries(Object.entries(rates).map(([key, probability]) =>
  [key, { assumedClickProbability: probability, visits: 0, clicks: 0 }]));

async function visit(index) {
  const options = { signal: AbortSignal.timeout(20000) };
  const response = await fetch(new URL('/', base), options);
  const page = await response.text();
  const variant = page.match(/data-variant="([^"]+)" data-evaluated="true"/)?.[1];
  const cookie = response.headers.get('set-cookie')?.split(';')[0];
  if (!response.ok || !cookie || !Object.hasOwn(rates, variant)) throw new Error('Visit failed: ' + index);
  arms[variant].visits++;
  const draw = createHash('sha256').update(seed + ':' + index).digest().readUInt32BE() / 2 ** 32;
  if (draw < rates[variant]) {
    const click = await fetch(new URL('/checklist/open', base), {
      ...options, method: 'POST', headers: { cookie }, redirect: 'manual',
    });
    if (click.status !== 303 || click.headers.get('location') !== '/checklist') {
      throw new Error('Click failed: ' + index);
    }
    const checklist = await fetch(new URL('/checklist', base), { ...options, headers: { cookie } });
    if (!checklist.ok || !(await checklist.text()).includes('My packing checklist.')) {
      throw new Error('Checklist failed: ' + index);
    }
    arms[variant].clicks++;
    examples[variant] ??= cookie;
  }
}

async function simulate() {
  if (!Number.isSafeInteger(visitors) || visitors < 1) throw new Error('SIM_VISITORS must be a positive integer');
  for (let i = 0; i < visitors; i += 10) {
    await Promise.all(Array.from({ length: Math.min(10, visitors - i) }, (_, j) => visit(i + j)));
  }
  console.log(JSON.stringify({ traffic: 'synthetic', seed, visitors, arms }, null, 2));
  if (process.env.SIM_EVIDENCE_FILE) {
    await writeFile(process.env.SIM_EVIDENCE_FILE, JSON.stringify(examples), { mode: 0o600 });
  }
}

simulate().catch((error) => { console.error(error.message); process.exitCode = 1; });
