import { CONTROL, EVENT, FLAG, HYPOTHESIS, TREATMENT } from '../experiment.js';
import { admin, list, lookup, METRIC, NAME } from './admin.js';

async function setup() {
  const { project, environment, envPath } = await lookup(true);
  const warehousePath = envPath + 'warehouse-connections/';
  const warehouse = (await list(warehousePath))[0] || await admin(warehousePath, {
    warehouse_type: 'postgres', config: { source: 'flagsmith_database' },
  });
  if (warehouse.status !== 'connected') throw new Error('Flagsmith warehouse is ' + warehouse.status);

  const features = 'projects/' + project.id + '/features/';
  const flag = (await list(features)).find(({ name }) => name === FLAG) || await admin(features, {
    name: FLAG, type: 'MULTIVARIATE', default_enabled: true, initial_value: CONTROL,
  });
  if (flag.type !== 'MULTIVARIATE') throw new Error('Existing flag is not multivariate');
  const options = features + flag.id + '/mv-options/';
  const variants = await list(options);
  const variant = variants.find(({ key }) => key === TREATMENT) || await admin(options, {
    feature: flag.id, type: 'unicode', string_value: TREATMENT, key: TREATMENT, default_percentage_allocation: 0,
  });
  if (variant.string_value !== TREATMENT || variants.some(({ key }) => key !== TREATMENT)) {
    throw new Error('Existing flag variants do not match Packlight configuration');
  }
  const metrics = envPath + 'experiment-metrics/';
  const metric = (await list(metrics)).find(({ name }) => name === METRIC) || await admin(metrics, {
    name: METRIC, aggregation: 'occurrence', direction: 'up', definition: { version: 1, event: EVENT },
  });
  if (metric.aggregation !== 'occurrence' || metric.definition?.event !== EVENT || metric.direction !== 'up') {
    throw new Error('Existing metric does not match Packlight configuration');
  }
  const experiments = envPath + 'experiments/';
  const experiment = (await list(experiments)).find(({ name, feature }) =>
    name === NAME && (feature?.id ?? feature) === flag.id) || await admin(experiments, {
    name: NAME, hypothesis: HYPOTHESIS, feature: flag.id,
    metrics: [{ metric: metric.id, expected_direction: 'increase' }],
    experiment_rollout: {
      enabled: true, rollout_percentage: 100,
      feature_state_value: { type: 'string', value: CONTROL },
      multivariate_feature_state_values: [{ multivariate_feature_option: variant.id, percentage_allocation: 50 }],
    },
  });
  const current = experiment.status === 'created'
    ? await admin(experiments + experiment.id + '/start/', {})
    : experiment;
  if (process.argv.includes('--environment-key')) {
    console.log(environment.api_key);
  } else {
    console.log(environment.name + ': flag #' + flag.id + ', metric #' + metric.id +
      ', experiment #' + experiment.id + ' (' + current.status + ')');
  }
}

setup().catch((error) => { console.error(error.message); process.exitCode = 1; });
