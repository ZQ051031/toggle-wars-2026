import assert from 'node:assert/strict';
import { once } from 'node:events';
import test from 'node:test';
import { CONTROL, EVENT, FLAG, TREATMENT, labels } from '../experiment.js';
import { displayVariant, identify, makeServer } from '../server.js';

const idA = '00000000-0000-4000-8000-000000000001';
const idB = '00000000-0000-4000-8000-000000000002';

test('visitor identity accepts only valid anonymous session cookies', () => {
  assert.deepEqual(identify('other=yes; packlight_id=' + idA), { identifier: idA });
  assert.deepEqual(identify('packlight_id=', () => idB), { identifier: idB, fresh: true });
  assert.deepEqual(identify('packlight_id=bogus', () => idB), { identifier: idB, fresh: true });
});

test('CTA is driven by flag value, including after the experiment ends', () => {
  assert.equal(displayVariant({ enabled: true, value: TREATMENT }), TREATMENT);
  assert.equal(displayVariant({ enabled: true, value: CONTROL, variant: 'control' }), CONTROL);
  assert.equal(displayVariant({ enabled: false, value: TREATMENT }), CONTROL);
  assert.equal(displayVariant({ enabled: true, value: 'unknown' }), CONTROL);
});

async function runServer(t, flagsmith) {
  const server = makeServer(flagsmith, { logger: { warn() {} } });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve())));
  return 'http://127.0.0.1:' + server.address().port;
}

test('both CTA arms render, assignment stays stable, and click uses the same identity', async (t) => {
  const calls = [];
  const events = [];
  const base = await runServer(t, {
    async getExperimentFlag(name, identifier) {
      calls.push([name, identifier]);
      return { enabled: true, value: identifier === idA ? CONTROL : TREATMENT };
    },
    trackEvent(name, options) { events.push([name, options]); },
  });

  const first = await fetch(base);
  const cookie = first.headers.get('set-cookie').split(';')[0];
  assert.match(first.headers.get('set-cookie'), /HttpOnly; SameSite=Lax/);
  assert.equal(first.headers.get('cache-control'), 'no-store');
  await first.arrayBuffer();

  for (const [identifier, variant] of [[idA, CONTROL], [idB, TREATMENT]]) {
    const response = await fetch(base, { headers: { cookie: 'packlight_id=' + identifier } });
    assert.equal(response.headers.has('set-cookie'), false);
    const html = await response.text();
    assert.ok(html.includes('data-variant="' + variant + '" data-evaluated="true"'));
    assert.ok(html.includes(labels[variant]));
  }

  const second = await fetch(base, { headers: { cookie } });
  await second.arrayBuffer();
  assert.deepEqual(calls, [[FLAG, cookie.split('=')[1]], [FLAG, idA], [FLAG, idB], [FLAG, cookie.split('=')[1]]]);
  assert.deepEqual(events, []);

  const click = await fetch(base + '/checklist/open', { method: 'POST', headers: { cookie }, redirect: 'manual' });
  assert.equal(click.status, 303);
  assert.equal(click.headers.get('location'), '/checklist');
  const page = await fetch(base + click.headers.get('location'));
  assert.match(await page.text(), /My packing checklist\./);
  assert.deepEqual(events, [[EVENT, { identifier: cookie.split('=')[1] }]]);
});

test('direct list views, prefetch, and cookie-less POST are not conversions', async (t) => {
  const calls = [];
  const base = await runServer(t, {
    async getExperimentFlag() { calls.push('flag'); },
    trackEvent() { calls.push('event'); },
  });
  assert.equal((await fetch(base + '/checklist')).status, 200);
  assert.equal((await fetch(base + '/checklist/open')).status, 404);
  assert.equal((await fetch(base + '/checklist/open', { method: 'POST', redirect: 'manual' })).status, 303);
  assert.deepEqual(calls, []);
});

test('Flagsmith unavailability serves the control without claiming an evaluation', async (t) => {
  const base = await runServer(t, {
    async getExperimentFlag() { throw new Error('offline'); },
  });
  const html = await (await fetch(base)).text();
  assert.match(html, /data-variant="generic" data-evaluated="false"/);
  assert.match(html, /Get started/);
});
