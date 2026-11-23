# Student Management Benchmark Harness

## What is this?

This project is the load-testing and data-generation companion for the Student Management backend. It is **not the backend server**: it runs k6 scenarios against a separately running API and prepares deterministic MySQL datasets for those scenarios. The backend source and its startup scripts are not included in this checkout.

The harness measures student and book searches, course and enrollment reads, authentication, writes, and longer mixed workloads. It saves k6 summaries and dataset manifests in `out/`, then turns those summaries into reports. Reusing the same scale and seed makes runs comparable when checking a backend change for latency or error regressions.

## Project layout

| Path | Purpose |
| --- | --- |
| `scenarios/` | k6 workload files, including `ci-smoke.js` and read/write scenarios |
| `lib/` | Shared k6 configuration, sessions, thresholds, and report helpers |
| `seed/` | Deterministic MySQL data generator and scenario manifest builder |
| `report.js`, `scale-sweep.js`, `xc003-report.js` | Analyze saved k6 summaries |
| `observability/` | Optional Prometheus and Grafana configuration |
| `out/` | Generated manifests and run results; ignored by Git |

## Get started

1. Install Node.js 18+, npm, and [k6](https://grafana.com/docs/k6/latest/set-up/install-k6/). Have the Student Management API running at `http://localhost:8080` and a MySQL database with the backend's migrations applied. Use a disposable database: the seed generator writes directly to it.
2. From this directory, install dependencies and provide database settings if they differ from the defaults in `seed/db.js` (`localhost:3306`, database/user/password `management`). The generator reads `DB_HOST`, `DB_PORT`, `MYSQL_DATABASE`, `MYSQL_USER`, and `MYSQL_PASSWORD` from the shell environment.
3. Generate a small dataset and its manifest, then run the smoke scenario:

   ```sh
   npm ci
   npm run seed -- --scale=S1 --seed=local-example
   npm run manifest -- --scale=S1
   make bench-ci-smoke SCALE=S1 PROMETHEUS_RW=0
   ```

The seed command refuses a database that already contains data. To intentionally replace a disposable dataset, add `--force` to the seed command; this truncates benchmark tables. Record the seed when comparing runs. `S1` is small, `S2` is the main benchmark scale, and `S3` is for stress testing.

## Run and review benchmarks

Run one scenario against the seeded scale, then summarize its saved exports:

```sh
make bench SCENARIO=student-search SCALE=S1 PROMETHEUS_RW=0
make bench-report SCALE=S1
make help
```

Set `BENCH_BASE_URL` if the API is not at `http://localhost:8080`. `PROMETHEUS_RW=0` disables optional Prometheus remote write; see [observability/README.md](observability/README.md) to enable dashboards. The `Makefile` has additional targets for isolated authentication, write, soak, and destructive cascade runs. Read their descriptions with `make help` before using them. k6 consumes `scenarios/` and `lib/` directly; npm dependencies are used by the seed scripts.
