import '../env.js';

export const NAME = 'Packlight checklist CTA';
export const METRIC = 'Checklist opened';
const base = process.env.FLAGSMITH_API_URL || 'http://127.0.0.1:8000/api/v1/';
const token = process.env.FLAGSMITH_ADMIN_TOKEN;

export async function admin(path, payload, method = payload === undefined ? 'GET' : 'POST') {
  if (!token) throw new Error('Export FLAGSMITH_ADMIN_TOKEN for Admin API access');
  const url = new URL(path, base);
  if (url.origin !== new URL(base).origin) throw new Error('Unexpected Admin API origin');
  const response = await fetch(url, {
    method,
    redirect: 'error',
    headers: { Authorization: 'Token ' + token, Accept: 'application/json', 'Content-Type': 'application/json' },
    body: payload === undefined ? undefined : JSON.stringify(payload),
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) {
    const route = path.replace(/environments\/[^/]+\//, 'environments/<environment>/').split('?')[0];
    throw new Error(method + ' ' + route + ': HTTP ' + response.status);
  }
  return response.status === 204 ? undefined : response.json().catch(() => undefined);
}

export async function list(path) {
  const items = [];
  while (path) {
    const page = await admin(path);
    if (Array.isArray(page)) return [...items, ...page];
    items.push(...page.results);
    path = page.next;
  }
  return items;
}

async function findOrCreate(path, name, payload, createPath = path) {
  const existing = (await list(path)).find((item) => item.name === name);
  return existing || (payload ? admin(createPath, payload) : undefined);
}

export async function lookup(create = false) {
  const orgName = process.env.FLAGSMITH_ORG || 'Toggle Wars';
  const projectName = process.env.FLAGSMITH_PROJECT || 'Packlight';
  const envName = process.env.FLAGSMITH_ENVIRONMENT || 'Packlight Experiment';
  const org = await findOrCreate('organisations/', orgName, create && { name: orgName });
  if (!org) throw new Error('Flagsmith organization not found: ' + orgName);
  const project = await findOrCreate('projects/?organisation=' + org.id, projectName,
    create && { name: projectName, organisation: org.id }, 'projects/');
  if (!project) throw new Error('Flagsmith project not found: ' + projectName);
  const environment = await findOrCreate('projects/' + project.id + '/environments/', envName,
    create && { name: envName, project: project.id }, 'environments/');
  if (!environment) throw new Error('Flagsmith environment not found: ' + envName);
  return { project, environment, envPath: 'environments/' + environment.api_key + '/' };
}
