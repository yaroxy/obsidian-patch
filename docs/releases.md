# Full builds and migration

This branch, `codex/full`, is the independent Full source distribution. It requires Obsidian 1.15.0 or later and uses the plugin ID `patches`. Community Directory source and standard GitHub releases come from [`main`](https://github.com/yaroxy/obsidian-patch/tree/main); do not submit this branch as Community Directory source.

## Build and installation

Use Node.js 22 or later:

```sh
git clone --branch codex/full --single-branch https://github.com/yaroxy/obsidian-patch.git obsidian-patch-full
cd obsidian-patch-full
npm ci
npm test
npm run build
npm run check:release
```

The default build writes `dist/full/`. `npm run dev` watches that same output, and `build:full` / `dev:full` are aliases. The branch's build, validation, integration and migration tools accept Full only.

Install `main.js`, `manifest.json`, and `styles.css` from `dist/full/` into `<vault>/.obsidian/plugins/patches/`. `metafile.json` and `build-info.json` are local validation metadata, not installation files. Keep an existing `data.json` when updating, then reload Obsidian.

Full includes Bundled, Latest, and Custom Mermaid choices. Latest and Custom load executable Mermaid and ELK modules from jsDelivr without an integrity check; they have the same access as the plugin itself. Failed remote loads fall back to bundled Mermaid. Bundled needs no remote Mermaid request. Both Full and Community can download Simple Icons data, as described in the README.

Full and Community use the same plugin ID, settings and command hotkeys. Installing one replaces the other. A Community Directory update replaces a manually installed Full build with Community; rebuild and install `codex/full` again to keep using Full.

## Reproducible builds

Use `npm ci` and the same source revision. Embedded icon packs use the exact build-only dependency `fflate@0.8.3`, compression level 9 and a zero gzip timestamp. This avoids native zlib differences while retaining complete icon data; the compressor is not included in the runtime. Validation records its source hash so changing it requires a rebuild.

The build and validation commands check version consistency across `package.json`, `package-lock.json`, `manifest.json`, and `versions.json`, require the remote Mermaid loader in the Full dependency graph, and reject modified artifacts or stale source inputs. Run the affected development-vault suites before installing a changed build in a personal vault. See [Integration testing](integration-testing.md); historical verification is not a fresh test of a new revision.

## Migrating from obsidian-patch

Run the migration before manually creating a `patches` installation. The tool refuses an existing destination directory or conflicting destination command hotkeys instead of overwriting them.

1. Build Full with `npm run build` on `codex/full`.
2. Close Obsidian completely.
3. Preview the migration, using the absolute path to the vault:

   ```sh
   node scripts/migrate-plugin.mjs "/absolute/path/to/vault"
   ```

4. Review the planned paths and changes, then apply them:

   ```sh
   node scripts/migrate-plugin.mjs "/absolute/path/to/vault" --apply
   ```

5. Reopen Obsidian and check **Settings → Community plugins → Patches**, your plugin settings, and assigned hotkeys.

Full is the default and only supported build on this branch; `--build=full` remains optional. Preview is the default; only `--apply` writes to the vault. Applying the migration refuses to proceed while Obsidian is running.

The migration installs the selected build under `.obsidian/plugins/patches/`, copies the old `data.json` when present, replaces the old ID in `community-plugins.json`, and changes `obsidian-patch:` command prefixes in `hotkeys.json` to `patches:`. It preserves whether the old plugin was enabled, retains the old plugin directory, and backs up the original settings and configuration under `.obsidian/patches-migration-backups/<timestamp>-<random>/`. If applying fails, it attempts to restore the configuration and remove the newly created plugin directory, keeps the backup, and reports any restoration errors.

If rollback also fails, the tool records `recovery-required` in the backup's `migration.json`, retains `.obsidian/patches-migration.lock`, and may retain the new plugin directory. Keep Obsidian closed and use that report and the original backup files to restore `community-plugins.json` and `hotkeys.json`; the report also lists files that were originally absent. After confirming the original configuration is restored, remove the newly installed `patches` directory if it remains, then remove the lock before retrying. Keep the backup until recovery is verified.

Note content does not need migration: `patch-mermaid`, `patch-banner`, and `patch-line-width` keep their existing syntax. CSS classes and variables with the `obsidian-patch-` prefix also stay the same. Do not enable the old and new plugin together; both register the same note-rendering features.

After checking that Patches has your settings and hotkeys and works with your notes, you can uninstall **Obsidian Patch** under **Settings → Community plugins**. Keeping it disabled temporarily is also fine. The migration intentionally retains its directory for recovery; the new plugin uses its own `patches/data.json`. Keep the migration backup until you are satisfied with the new installation, and leave **Patches** installed when removing the old plugin.

## Distribution policy

Full is distributed through this branch's source-build instructions. Its CI runs the Full build, unit tests and installation-file validation on pushes and pull requests to `codex/full`. It has no release-publishing workflow and does not create GitHub artifact attestations.

Standard `x.y.z` tags and GitHub release assets belong to Community source on `main`. Do not attach `dist/full/` files to those releases or reuse their tags for Full. Keep the Full manifest version aligned with the corresponding shared feature version, and record branch-specific changes without implying that Full has passed Community Directory review.

When applying common fixes from `main`, retain this branch's Full runtime entry, Full-only build and migration defaults, and CI configuration. Re-run `npm test`, `npm run build`, and `npm run check:release` after integrating those fixes. Do not copy the Community release workflow into this branch.
