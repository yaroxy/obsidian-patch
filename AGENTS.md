# Patches

## Project memory

Before planning or editing this plugin, including testing or deployment in `dev-vault` or `spacetime`, read `/Users/roxy/.codex/memories/obsidian-patch.md`.

## Feature references

Before changing a feature's behavior, read its design document:

- Banner properties, media, or layout: `docs/banner-design.md`.
- HTML table editing or Markdown conversion: `docs/table-design.md`.
- Callout editing, conversion, or GitHub compatibility: `docs/callout-design.md`.
- Math parsing or formatting: `docs/math-format-design.md`.
- Heading labels or PDF navigation: `docs/heading-and-pdf-design.md`.

Use current source and configuration for implementation status and versions. Treat dated verification records as historical evidence.

Before changing release packaging, build variants, or plugin ID migration, read `docs/releases.md`.

## Repository conventions

- Use the `obsidian-patch-<feature>` prefix for feature CSS classes.
- For user-visible changes, update `CHANGELOG.md` under `Unreleased` and keep README instructions and examples consistent with the resulting behavior.
- Keep each Markdown prose paragraph on one source line. Add line breaks only where syntax or intended layout requires them.
- Keep detailed feature decisions in the relevant design document; use this file for instructions and pointers that apply across development tasks.

## Validation

Read `package.json` for current build and unit-test commands. Before running or changing integration suites, read `docs/integration-testing.md` and the relevant runner: these checks deploy the plugin and modify vault fixtures. Report the checks actually run, their results, and any skipped coverage.
