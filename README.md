# Packlight

Packlight is a small reusable packing checklist for Toggle Wars Track 01, **Test Something Real**. It runs without an account and keeps checklist progress in the browser. We used self-hosted Flagsmith Experimentation to test one question: does naming the checklist on the landing button make more visitors open it?

[Captioned demo](docs/demo/packlight-demo.mp4) · [Demo script](docs/demo/SCRIPT.md) · [Native result JSON](docs/results/flagsmith.json) · [Results dashboard](docs/results/flagsmith-results-overview.png) · [Scorecard](docs/results/flagsmith-results-scorecard.png)

## Experiment design

**Hypothesis:** Naming the checklist in the call to action increases first-visit checklist opens by at least **15% relative** to a generic CTA.

| Flagsmith arm | Flag value | Button text | Traffic |
| --- | --- | --- | ---: |
| Control | `generic` | Get started | 50% |
| Treatment | `specific` | Open my packing checklist | 50% |

- **Flag:** `packlight_checklist_cta`, enabled and multivariate. The flag’s base value is control, and the experiment enrolls 100% of eligible visitors with the 50/50 split above. The other landing content and the destination checklist are identical.
- **Metric:** `checklist_opened`, an occurrence metric for which higher is better. The landing page evaluates the flag via `getExperimentFlag` using an anonymous cookie. Submitting the CTA form records the event via `trackEvent` on that same identity. A direct checklist view does not count. Flagsmith counts one conversion per exposed identity, so retries or revisits do not increase that identity’s score.
- **Traffic:** The simulator made 1,800 fresh visits over HTTP, following the real CTA form and redirect for conversions. It used seed `packlight-toggle-wars-v1` for click decisions with **assumed** probabilities of **24% control** and **37% treatment**. Flagsmith assigned the arms; the app generated anonymous IDs, so exact counts can differ on a rerun.

## Results

| Arm | Exposed identities | Checklist opens | Open rate |
| --- | ---: | ---: | ---: |
| Control | 877 | 213 | 24.29% |
| Specific CTA | 923 | 348 | 37.70% |

Flagsmith selected **“Open my packing checklist”**: **+13.42 percentage points**, **+55.24% relative lift** (95% credible interval **+32.98% to +77.49%**), and **99.99994% chance to win** (dashboard: **>99%**). The Flagsmith stats engine computed these numbers from ingested events, not from the configured probabilities. The [simulator log](docs/results/simulation.json) and native counts agree. Completing the experiment rolled the treatment out on the **same flag**; SDK reads verified the winning value for **20 fresh and 2 returning identities**, including one from each original arm.

**What this does and does not prove:** The result shows that the instrumented experiment recovered the direction of the effect built into the simulation. It is not evidence that the CTA would lift conversion by this amount with real travelers. We would test with real visitors before drawing that conclusion.

**Sample ratio mismatch (SRM):** The native result’s `srm_p_value` was `null`, not a pass. On the pinned Flagsmith OSS build, the SRM check reads the flag’s base allocation (control 100%, treatment 0%) rather than the active override (50/50). As a separate sanity check, a Pearson chi-square test against 900/900 expected exposures gives **p = 0.278** for the observed 877/923 split; it did not flag an imbalance. Win probability and lift above are the native Flagsmith values.

## Run locally

Prerequisites: **Node.js 22**, npm, Docker, and Docker Compose. The Compose stack is local-only. It includes the pinned Flagsmith OSS build, PostgreSQL as the event warehouse, migrations, and the task processor. No Cloud account, paid service or separate warehouse is required.

```sh
npm ci
docker compose up -d
# Once Flagsmith starts, create a local admin and choose a password interactively:
docker compose exec flagsmith flagsmith createsuperuser --email admin@packlight.local

# Obtain a token into the current shell without writing it to a file:
export FLAGSMITH_ADMIN_TOKEN="$(docker compose exec -T flagsmith flagsmith shell -c \
  'from rest_framework.authtoken.models import Token; from users.models import FFAdminUser; print(Token.objects.get_or_create(user=FFAdminUser.objects.get(email="admin@packlight.local"))[0].key)' | tail -1)"
export FLAGSMITH_ENVIRONMENT_KEY="$(npm run -s experiment:setup -- --environment-key)"
npm start
```

Open [Packlight](http://127.0.0.1:3000) and the [Flagsmith dashboard](http://127.0.0.1:8000). Sign in to Flagsmith with the local admin you created and open **Toggle Wars → Packlight → Packlight Experiment → Experiments**. The setup script creates the project, environment, connected warehouse, flag, metric and experiment through the Admin API. Running it again against the same environment prints the existing IDs and does not restart a completed experiment.

Defaults are in [`.env.example`](.env.example). If local ports are occupied, configure `PORT`, `APP_URL`, `FLAGSMITH_PORT`, `FLAGSMITH_API_URL` and `FLAGSMITH_EVENTS_URL` together. Flags go to the API address ending in `/api/v1/`; SDK events use the base ending in `/api/`. Keep the admin token and any custom credential values out of Git.

## Reproduce the experiment

For a clean run, use a new `FLAGSMITH_ENVIRONMENT` name in both shells and run setup before starting the app. Do not browse the target app until the simulation takes its snapshot if you want only synthetic visitors in the counts. In a second terminal, export the same admin token as above (and any non-default configuration), then:

```sh
export SIM_EVIDENCE_FILE=.env.packlight-visitors.json
npm run experiment:simulate
# After the SDK's next batch flush (normally within 10 seconds):
export RESULTS_MIN_VISITORS=1800
RESULTS_FILE=packlight-results.json npm run experiment:results -- --refresh
# Review the dashboard and JSON before completing the experiment:
RESULTS_FILE=packlight-rollout.json npm run experiment:results -- --rollout
```

`--refresh` queues Flagsmith's native computation; it can be requested at most every five minutes. `--rollout` completes a decisive experiment, applies the winning value to its flag, and verifies it through the SDK. A flagged native SRM or an inconclusive result blocks rollout. When native SRM is unavailable, check the traffic split separately before calling `--rollout`. The optional ignored simulator evidence file lets the verification also check a returning identity from each arm.

## Test

```sh
npm ci
npm test
```

The `node:test` suite covers cookie identity, CTA selection, both landing routes and click attribution through a mocked Flagsmith SDK, routes that must not track a conversion, and the control fallback on evaluation failure. GitHub Actions runs the same suite on Ubuntu 24.04 and Node 22.
