# Packlight — demo script

**Runtime:** 1:18. The MP4 uses on-screen captions and real browser captures from the submission run. No narration is required.

| Time | On screen | What to say or caption |
| --- | --- | --- |
| 0:00–0:09 | Packlight landing page; the control button says **Get started**. | Packlight is a reusable packing checklist. We tested whether naming the checklist on the first button increased first-visit opens. |
| 0:09–0:17 | A different anonymous identity sees **Open my packing checklist**. | Only the CTA copy changes. Our hypothesis: the more specific CTA increases checklist opens by at least 15% relative. |
| 0:17–0:26 | The CTA opens the actual checklist. Checking one item updates the count to **1 of 9 packed**. | The click sends one `checklist_opened` event with the same anonymous identity used to evaluate the flag. The checklist works without an account. |
| 0:26–0:36 | Flagsmith **Features** lists the enabled `packlight_checklist_cta` flag. | This multivariate flag serves both versions. Flagsmith enrolls all visitors and assigns them 50/50. |
| 0:36–0:48 | The running experiment’s Results overview shows 1,800 enrolled, a winning variant, and a 50/50 configuration. | We drove 1,800 synthetic visitors through the real routes. The simulator assumed 24% clicks for control and 37% for specific. This is a pipeline demonstration, not a real-user claim. |
| 0:48–1:00 | Native metric scorecard shows per-arm exposures, occurrence rates, interval, and win probability. | The specific CTA got 348/923 opens (37.70%) versus 213/877 (24.29%): +55.24% relative lift, and >99% win probability. Exact numbers and the SRM caveat are in the README. |
| 1:00–1:10 | Flagsmith shows the experiment completed with the winning variant rolled out. | We ended the experiment and rolled out the treatment using the same flag, without editing the app. The SDK confirmed it for 20 fresh and 2 returning identities. |
| 1:10–1:18 | A fresh visit gets the winning CTA. | A fresh visit now gets the specific CTA. Code, tests and native results are in the public repo. |

For a live walkthrough, reproduce the run from the README, keep a browser on each variant before completing the experiment, and open **Experiments → Packlight checklist CTA → Results** in Flagsmith. Do not display the SDK keys, admin token, or login password.
