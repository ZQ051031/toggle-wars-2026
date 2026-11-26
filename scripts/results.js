import { randomUUID } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { setTimeout as delay } from 'node:timers/promises';
import { admin, list, lookup, METRIC, NAME } from './admin.js';
import { CONTROL, FLAG, TREATMENT } from '../experiment.js';
import { makeFlagsmith } from '../server.js';

const args = new Set(process.argv.slice(2));
const output = process.env.RESULTS_FILE;
const minVisitors = Number(process.env.RESULTS_MIN_VISITORS || 0);

function verdict(probability) {
  if (probability > 0.95) return TREATMENT;
  if (probability < 0.05) return CONTROL;
  return null;
}

async function findResults(path) {
  if (args.has('--refresh')) await admin(path + 'results/refresh/', {});
  for (let attempt = 0; attempt < 30; attempt++) {
    const { results } = await admin(path + 'results/');
    const sample = results?.payload?.metrics[0]?.variants;
    const count = Object.values(sample || {}).reduce((sum, arm) => sum + arm.n, 0);
    if (results?.payload && count >= minVisitors) return results;
    if (attempt < 29) await delay(1000);
  }
  throw new Error('No results at the requested sample size. Check event delivery and wait before refreshing again.');
}

async function verifySdk(key, winner) {
  const existing = process.env.SIM_EVIDENCE_FILE
    ? Object.values(JSON.parse(await readFile(process.env.SIM_EVIDENCE_FILE, 'utf8'))).map((cookie) => cookie.split('=')[1])
    : [];
  const fresh = Array.from({ length: 20 }, () => randomUUID());
  const client = makeFlagsmith({ ...process.env, FLAGSMITH_ENVIRONMENT_KEY: key });
  try {
    for (const identifier of [...existing, ...fresh]) {
      const flag = await client.getExperimentFlag(FLAG, identifier);
      if (!flag.enabled || flag.value !== winner) throw new Error('SDK returned a non-winning flag value after rollout');
    }
    return { flag: FLAG, expectedValue: winner, freshIdentitiesChecked: fresh.length, returningIdentitiesChecked: existing.length };
  } finally {
    await client.close();
  }
}

async function run() {
  if (!Number.isSafeInteger(minVisitors) || minVisitors < 0) throw new Error('Invalid RESULTS_MIN_VISITORS');
  const { environment, envPath } = await lookup();
  const experiments = envPath + 'experiments/';
  const experiment = (await list(experiments)).find(({ name }) => name === NAME);
  if (!experiment) throw new Error('Run experiment:setup first');
  const path = experiments + experiment.id + '/';
  const metric = (await list(envPath + 'experiment-metrics/')).find(({ name }) => name === METRIC);
  if (!metric) throw new Error('Packlight metric was not found');
  const results = await findResults(path);
  const row = results.payload.metrics.find(({ metric_id }) => metric_id === metric.id);
  const inference = row?.inference[TREATMENT] ?? null;
  const winner = inference ? verdict(inference.chance_to_win) : null;
  const record = {
    experiment: { id: experiment.id, name: experiment.name, environment: environment.name, status: experiment.status },
    metric: { id: metric.id, name: metric.name, event: metric.definition.event },
    winner,
    nativeResults: results,
  };
  if (args.has('--rollout')) {
    if (!winner) throw new Error('Inconclusive result; refusing to roll out');
    if (results.payload.srm_p_value !== null && results.payload.srm_p_value <= 0.001) {
      throw new Error('Sample ratio mismatch; refusing to roll out');
    }
    if (experiment.status === 'completed') throw new Error('Experiment already completed; no rollout performed');
    const rollout = winner === TREATMENT
      ? { rollout_decision: 'variant', rollout_variant: await treatmentId(experiment) }
      : { rollout_decision: 'control' };
    const completed = await admin(path + 'complete/', rollout);
    if (completed.status !== 'completed') throw new Error('Flagsmith did not complete the experiment');
    record.rollout = { status: completed.status, decision: completed.rollout_decision,
      completedAt: completed.ended_at, verification: await verifySdk(environment.api_key, winner) };
  }
  const json = JSON.stringify(record, null, 2) + '\n';
  if (output) await writeFile(output, json);
  console.log(json.trimEnd());
}

async function treatmentId(experiment) {
  const { project } = await lookup();
  const options = await list('projects/' + project.id + '/features/' +
    (experiment.feature?.id ?? experiment.feature) + '/mv-options/');
  const treatment = options.find(({ key }) => key === TREATMENT);
  if (!treatment) throw new Error('Winning variant is missing from the flag');
  return treatment.id;
}

run().catch((error) => { console.error(error.message); process.exitCode = 1; });
