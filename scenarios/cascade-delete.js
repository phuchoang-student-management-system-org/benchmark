// bench/scenarios/cascade-delete.js — BM-XC-001 (03-benchmark-scenarios.md §7, PM-036).
//
// Bulk student deletion at N = 10, 50, 200, "as fast as the API accepts them" -- there is no bulk-
// delete endpoint, so this fires N individual DELETE /api/v1/students/{code} calls per stage. This
// file only measures the HTTP-visible half of H6 (the 204 returns before StudentService's
// StudentDeleted listeners run -- BookService.onStudentDeleted, EnrollmentService.onStudentDeleted
// -- on AsyncConfig's core-2/max-4/queue-50 pool). The other half -- wall-clock until every
// resulting event_publication row's COMPLETION_DATE is set, and whether the queue rejects anything
// -- is what bench/seed/cascade-drain.js measures afterward; k6 itself cannot query MySQL.
//
// Hand-builds `options.scenarios` instead of using buildOptions(): each stage is a fixed burst
// (`shared-iterations`, N iterations total, not a steady-state window), which buildOptions()'s
// constant-vus/duration model doesn't express. Stages are sequential (N10 -> N50 -> N200) and
// self-limiting: setup() requires 260 distinct students, so this scenario runs only at S2/S3.
// This scenario is destructive: a full dataset restore is mandatory afterward
// (04-workload-data-preparation.md §5).

import http from 'k6/http';
import { check } from 'k6';
import { scenario } from 'k6/execution';
import { BASE_URL } from '../lib/config.js';
import { ensureLoggedIn } from '../lib/vuSession.js';
import { mergeThresholds, sloThresholds } from '../lib/slo.js';

const WARMUP_VUS = 20;
const WARMUP_SECONDS = 10;
// Generous fixed spacing between stages so a real S2/S3 run has room for one stage's cascade to
// mostly settle before the next burst starts skewing host CPU/pool contention; irrelevant to a
// short smoke test since a no-op stage (see file header) finishes almost instantly regardless.
const STAGE_GAP_SECONDS = Number(__ENV.CASCADE_STAGE_GAP_SECONDS || 90);
const STAGE_MAX_DURATION = __ENV.CASCADE_STAGE_MAX_DURATION || '3m';

function stageStart(index) {
  return `${WARMUP_SECONDS + 5 + index * STAGE_GAP_SECONDS}s`;
}

export const options = {
  scenarios: {
    warmup: {
      executor: 'constant-vus',
      vus: WARMUP_VUS,
      duration: `${WARMUP_SECONDS}s`,
      exec: 'warmup',
      startTime: '0s',
      gracefulStop: '5s',
    },
    BM_XC_001_N10: {
      executor: 'shared-iterations',
      vus: 10,
      iterations: 10,
      maxDuration: STAGE_MAX_DURATION,
      exec: 'bmXc001N10',
      startTime: stageStart(0),
    },
    BM_XC_001_N50: {
      executor: 'shared-iterations',
      vus: 20,
      iterations: 50,
      maxDuration: STAGE_MAX_DURATION,
      exec: 'bmXc001N50',
      startTime: stageStart(1),
    },
    BM_XC_001_N200: {
      executor: 'shared-iterations',
      vus: 20,
      iterations: 200,
      maxDuration: STAGE_MAX_DURATION,
      exec: 'bmXc001N200',
      startTime: stageStart(2),
    },
  },
  thresholds: mergeThresholds(
    sloThresholds('BM_XC_001_N10', 'WRITE_SIMPLE'),
    sloThresholds('BM_XC_001_N50', 'WRITE_SIMPLE'),
    sloThresholds('BM_XC_001_N200', 'WRITE_SIMPLE'),
    { 'http_reqs{scenario:BM_XC_001_N10}': ['count>=0'] },
    { 'http_reqs{scenario:BM_XC_001_N50}': ['count>=0'] },
    { 'http_reqs{scenario:BM_XC_001_N200}': ['count>=0'] },
  ),
  noCookiesReset: true,
};

// setup() runs once and passes the same target list to every VU, including VUs that did not
// execute warm-up. A module-scoped list populated in warm-up is private to those VUs and can
// silently leave later shared-iterations stages without any targets.
export function setup() {
  ensureLoggedIn('REGISTRAR');
  // Up to 3 pages of 100 supply the 10+50+200 distinct codes at S2/S3.
  let codes = [];
  let cursor = null;
  for (let page = 0; page < 3; page++) {
    const url = cursor
      ? `${BASE_URL}/api/v1/students?cursor=${encodeURIComponent(cursor)}&size=100`
      : `${BASE_URL}/api/v1/students?size=100`;
    const res = http.get(url, {
      tags: { name: 'warmup' },
    });
    if (res.status !== 200) break;
    const body = JSON.parse(res.body);
    const content = body.content || [];
    codes = codes.concat(content.map((s) => s.studentCode));
    cursor = body.nextCursor;
    if (!cursor) break;
  }
  if (codes.length < 260 || new Set(codes).size !== codes.length) {
    throw new Error(`Cascade benchmark requires 260 distinct student codes; found ${codes.length}.`);
  }
  return codes.slice(0, 260);
}

export function warmup() {
  ensureLoggedIn('REGISTRAR');
}

function deleteNext(rawSlice, tagName) {
  ensureLoggedIn('REGISTRAR');
  const code = rawSlice[scenario.iterationInTest];
  if (!code) throw new Error(`No cascade target for ${tagName} iteration ${scenario.iterationInTest}.`);
  const res = http.del(`${BASE_URL}/api/v1/students/${code}`, null, { tags: { name: tagName } });
  check(res, { [`${tagName} status 204`]: (r) => r.status === 204 });
}

export function bmXc001N10(codes) {
  deleteNext(codes.slice(0, 10), 'BM_XC_001_N10');
}

export function bmXc001N50(codes) {
  deleteNext(codes.slice(10, 60), 'BM_XC_001_N50');
}

export function bmXc001N200(codes) {
  deleteNext(codes.slice(60, 260), 'BM_XC_001_N200');
}
