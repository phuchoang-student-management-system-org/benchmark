# Repository Guidelines

## Project Structure & Module Organization

This checkout contains the benchmark harness. `scenarios/` holds k6 workloads, `lib/` holds shared k6 configuration, sessions, thresholds, and reporting helpers, and `seed/` generates deterministic MySQL datasets and manifests. Root scripts such as `report.js` and `scale-sweep.js` analyze k6 exports. `observability/` contains Prometheus and Grafana configuration. Generated manifests and run summaries belong in `out/`; do not commit them. The Makefile and README still refer to sibling `management/` and `docs/` directories, which are not present in this checkout.

## Build, Test, and Development Commands

Run commands from this directory. Install Node.js 18+, k6, and the dependencies needed by the target you run; benchmark runs also require a running, migrated API and MySQL database.

```sh
npm ci                                           # install seed-generator dependencies
make help                                        # list benchmark targets
npm run seed -- --scale=S1 --seed=local-example  # generate a reproducible dataset
make bench SCENARIO=student-search SCALE=S1 PROMETHEUS_RW=0
make bench-ci-smoke SCALE=S1 PROMETHEUS_RW=0     # short k6 smoke run
make bench-report SCALE=S1                      # summarize existing exports
```

`make bench-seed` truncates and reseeds data; use it only against a disposable benchmark database. Set `PROMETHEUS_RW=1` only when the Prometheus receiver is available.

## Coding Style & Naming Conventions

Use ES modules, two-space indentation, single-quoted strings, and semicolons, matching nearby JavaScript. Name scenario files in kebab case (`student-search.js`) and exported workload functions after their benchmark IDs (`bmStu002`). Keep shared session and threshold logic in `lib/`; scenario files should declare k6 options and measured requests. There is no configured formatter or linter, so review formatting against adjacent files.

## Testing Guidelines

There is no `npm test` script or stated coverage threshold. Run `node --check` on changed Node scripts and `make bench-ci-smoke SCALE=S1 PROMETHEUS_RW=0` for changes affecting scenarios or shared k6 code. Use a seeded, disposable database and record the scale and seed when comparing results. Keep destructive workloads such as `cascade-delete` separate from read-only runs.

## Commit & Pull Request Guidelines

Git history commonly uses short, scoped subjects such as `perf(*): ...`, `docs(*): ...`, and `build: ...`; use a concise imperative subject with a relevant type and scope. In PRs, describe the workload or reporting change, link its issue when applicable, include the commands and scale used for validation, and attach before/after metrics for performance claims. Document new environment variables and avoid committing credentials or generated `out/` data.
