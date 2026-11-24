// bench/scenarios/student-search.js — BM-STU-001..005 (03-benchmark-scenarios.md §2).
//
// H1 (unindexable LIKE search, scanned twice per request) and H3 (deep OFFSET paging), plus the
// BM-STU-001 no-filter/page-1 floor and the BM-STU-005 by-code control. Role: REGISTRAR.
//
// Run: k6 run --env BASE_URL=... --env SCALE=S2 bench/scenarios/student-search.js
// (normally invoked via `make bench SCENARIO=student-search SCALE=S2` -- see PM-032.)

import http from 'k6/http';
import { check } from 'k6';
import { b64encode } from 'k6/encoding';
import { BASE_URL, SCALE } from '../lib/config.js';
import { buildOptions } from '../lib/runner.js';
import { ensureLoggedIn } from '../lib/vuSession.js';
import { loadSearchTerms, termsWithHits, pickRandom } from '../lib/manifest.js';
import { SCALES } from '../seed/scales.js';

const searchTerms = termsWithHits(loadSearchTerms().searchTermTable.student);

export const options = buildOptions('warmup', [
  { id: 'BM_STU_001', exec: 'bmStu001' },
  { id: 'BM_STU_002', exec: 'bmStu002' },
  { id: 'BM_STU_003', exec: 'bmStu003' },
  { id: 'BM_STU_004', exec: 'bmStu004' },
  { id: 'BM_STU_005', exec: 'bmStu005' },
]);

// BM-STU-004 requests the last decile of seeded student codes. Student codes span a known,
// contiguous range at each scale, so encoding the key at 90% depth creates the same keyset
// cursor as walking from page one without thousands of warm-up requests at S3.
const PAGE_SIZE = 20;
const targetDepth = Math.max(0, Math.floor(Math.ceil((SCALES[SCALE]?.students || 0) / PAGE_SIZE) * 0.9));

let deepCursor = null;
let deepCursorReady = false;
let sampleCodes = [];

function parsePage(res) {
  const body = JSON.parse(res.body);
  return body;
}

export function warmup() {
  ensureLoggedIn('REGISTRAR');
  const res = http.get(`${BASE_URL}/api/v1/students?page=0&size=20`, { tags: { name: 'warmup' } });
  if (res.status === 200) {
    const body = parsePage(res);
    sampleCodes = (body.content || []).map((s) => s.studentCode);
  }
  if (!deepCursorReady) {
    // Seeded student codes cover STU000001..STU<scale.students> regardless of insertion order.
    // The API cursor encodes the last-seen code, so this reaches the last decile at S3
    // without 2,250 warm-up requests per VU.
    const lastSeenCode = `STU${String(targetDepth * PAGE_SIZE).padStart(6, '0')}`;
    deepCursor = targetDepth > 0 ? b64encode(lastSeenCode, 'rawurl') : null;
    deepCursorReady = true;
  }
  http.get(`${BASE_URL}/api/v1/students?query=${encodeURIComponent(pickRandom(searchTerms))}&page=0&size=20`, {
    tags: { name: 'warmup' },
  });
}

export function bmStu001() {
  ensureLoggedIn('REGISTRAR');
  const res = http.get(`${BASE_URL}/api/v1/students?page=0&size=20`, { tags: { name: 'BM_STU_001' } });
  check(res, {
    'BM-STU-001 status 200': (r) => r.status === 200,
    'BM-STU-001 has content array': (r) => Array.isArray(JSON.parse(r.body).content),
  });
}

export function bmStu002() {
  ensureLoggedIn('REGISTRAR');
  const term = pickRandom(searchTerms);
  const res = http.get(`${BASE_URL}/api/v1/students?query=${encodeURIComponent(term)}&page=0&size=20`, {
    tags: { name: 'BM_STU_002' },
  });
  check(res, {
    'BM-STU-002 status 200': (r) => r.status === 200,
    'BM-STU-002 has content array': (r) => Array.isArray(JSON.parse(r.body).content),
  });
}

export function bmStu003() {
  ensureLoggedIn('REGISTRAR');
  const term = pickRandom(searchTerms);
  const res = http.get(`${BASE_URL}/api/v1/students?query=${encodeURIComponent(term)}&page=0&size=100`, {
    tags: { name: 'BM_STU_003' },
  });
  check(res, {
    'BM-STU-003 status 200': (r) => r.status === 200,
    'BM-STU-003 has content array': (r) => Array.isArray(JSON.parse(r.body).content),
  });
}

export function bmStu004() {
  ensureLoggedIn('REGISTRAR');
  const url = deepCursor
    ? `${BASE_URL}/api/v1/students?cursor=${encodeURIComponent(deepCursor)}&size=20`
    : `${BASE_URL}/api/v1/students?size=20`;
  const res = http.get(url, { tags: { name: 'BM_STU_004' } });
  check(res, {
    'BM-STU-004 status 200': (r) => r.status === 200,
    'BM-STU-004 has content array': (r) => Array.isArray(JSON.parse(r.body).content),
  });
}

export function bmStu005() {
  ensureLoggedIn('REGISTRAR');
  const code = sampleCodes.length > 0 ? pickRandom(sampleCodes) : null;
  if (code === null) return;
  const res = http.get(`${BASE_URL}/api/v1/students/${code}`, { tags: { name: 'BM_STU_005' } });
  check(res, {
    'BM-STU-005 status 200': (r) => r.status === 200,
    'BM-STU-005 has studentCode': (r) => JSON.parse(r.body).studentCode === code,
    'BM-STU-005 has dateOfBirth': (r) => JSON.parse(r.body).dateOfBirth !== undefined,
  });
}
