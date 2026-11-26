import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { Flagsmith } from '@flagsmith/nodejs';
import './env.js';
import { CONTROL, EVENT, FLAG, TREATMENT, labels } from './experiment.js';

const read = (file) => readFileSync(new URL('./public/' + file, import.meta.url), 'utf8');
const home = read('index.html');
const checklist = read('checklist.html');
const assets = {
  '/style.css': ['text/css', read('style.css')],
  '/checklist.js': ['text/javascript', read('checklist.js')],
};
const uuid = /^[\da-f]{8}-[\da-f]{4}-4[\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12}$/i;

export function identify(cookie = '', generate = randomUUID) {
  const value = cookie.split(';').map((part) => part.trim())
    .find((part) => part.startsWith('packlight_id='))?.slice('packlight_id='.length);
  if (value && uuid.test(value)) return { identifier: value };
  return { identifier: generate(), fresh: true };
}

export function displayVariant(flag) {
  return flag?.enabled && flag.value === TREATMENT ? TREATMENT : CONTROL;
}

export function makeFlagsmith(environment = process.env) {
  if (!environment.FLAGSMITH_ENVIRONMENT_KEY) throw new Error('Set FLAGSMITH_ENVIRONMENT_KEY');
  return new Flagsmith({
    environmentKey: environment.FLAGSMITH_ENVIRONMENT_KEY,
    apiUrl: environment.FLAGSMITH_API_URL || 'http://127.0.0.1:8000/api/v1/',
    enableEvents: true,
    eventProcessorConfig: {
      eventsApiUrl: environment.FLAGSMITH_EVENTS_URL || 'http://127.0.0.1:8000/api/',
    },
  });
}

export function makeServer(flagsmith, { logger = console } = {}) {
  return createServer(async (req, res) => {
    const path = req.url.split('?', 1)[0];
    const send = (status, type, body, headers = {}) => {
      res.writeHead(status, { 'Content-Type': type + '; charset=utf-8', ...headers });
      res.end(body);
    };
    if (req.method === 'GET' && Object.hasOwn(assets, path)) return send(200, ...assets[path]);
    if (req.method === 'GET' && path === '/health') return send(200, 'text/plain', 'ok');

    const { identifier, fresh } = identify(req.headers.cookie);
    const privatePage = { 'Cache-Control': 'no-store' };
    if (req.method === 'GET' && path === '/') {
      if (fresh) {
        const secure = req.socket.encrypted ? '; Secure' : '';
        privatePage['Set-Cookie'] = 'packlight_id=' + identifier +
          '; Path=/; HttpOnly; SameSite=Lax; Max-Age=31536000' + secure;
      }
      let variant = CONTROL;
      let evaluated = false;
      try {
        const flag = await flagsmith.getExperimentFlag(FLAG, identifier);
        variant = displayVariant(flag);
        evaluated = flag.enabled && !flag.isDefault &&
          (flag.value === CONTROL || flag.value === TREATMENT);
      } catch (error) {
        logger.warn('Flagsmith flag evaluation failed:', error.name);
      }
      const body = home.replaceAll('{{variant}}', variant)
        .replaceAll('{{label}}', labels[variant])
        .replace('{{evaluated}}', String(evaluated));
      return send(200, 'text/html', body, privatePage);
    }
    if (req.method === 'POST' && path === '/checklist/open') {
      if (!fresh) {
        try {
          flagsmith.trackEvent(EVENT, { identifier });
        } catch (error) {
          logger.warn('Flagsmith event recording failed:', error.name);
        }
      }
      res.writeHead(303, { ...privatePage, Location: '/checklist' });
      return res.end();
    }
    if (req.method === 'GET' && path === '/checklist') return send(200, 'text/html', checklist, privatePage);
    return send(404, 'text/plain', 'Not found');
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const flagsmith = makeFlagsmith();
  const server = makeServer(flagsmith);
  const port = Number(process.env.PORT || 3000);
  server.listen(port, process.env.HOST || '127.0.0.1', () => {
    console.log('Packlight listening on http://' + (process.env.HOST || '127.0.0.1') + ':' + port);
  });
  const stop = () => server.close(async () => {
    await flagsmith.close();
    process.exitCode = 0;
  });
  process.once('SIGINT', stop);
  process.once('SIGTERM', stop);
}
