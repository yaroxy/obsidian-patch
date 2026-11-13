# Releases and migration

Patches uses one source tree for two builds. The default community build is intended for Community Directory distribution; the full build is available for people who choose to build and install it themselves. Both require Obsidian 1.15.0 or later and use the plugin ID `patches`.

## Build variants

Use Node.js 22 or later and install dependencies with `npm ci`.

| Build | Command | Output | Mermaid versions |
| --- | --- | --- | --- |
| Community | `npm run build` | `dist/community/` | Bundled only |
| Full | `npm run build:full` | `dist/full/` | Bundled, Latest, Custom |

Each output directory contains `main.js`, `manifest.json`, and `styles.css`, plus `metafile.json` and `build-info.json` for validation. Install or publish only the first three files.

The community build excludes the remote Mermaid and ELK loader at build time. It also turns old Latest or Custom settings into Bundled. The full build retains remote loading from jsDelivr and falls back to bundled Mermaid when a remote version cannot be loaded. Both builds may download Simple Icons data; see the README for network use.

Because both builds use the same ID, installing one replaces the other and keeps the same settings and command hotkeys. A subsequent Community Directory update replaces a manually installed full build with the community build. To continue using the full build, build and install it again from source.

## Migrating from obsidian-patch

Run the migration before manually creating a `patches` installation. The tool refuses an existing destination directory or conflicting destination command hotkeys instead of overwriting them.

1. Build the variant you want to install.
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

For the full build, add `--build=full` to both migration commands. Preview is the default; only `--apply` writes to the vault. Applying the migration refuses to proceed while Obsidian is running.

The migration installs the selected build under `.obsidian/plugins/patches/`, copies the old `data.json` when present, replaces the old ID in `community-plugins.json`, and changes `obsidian-patch:` command prefixes in `hotkeys.json` to `patches:`. It preserves whether the old plugin was enabled, retains the old plugin directory, and backs up the original settings and configuration under `.obsidian/patches-migration-backups/<timestamp>-<random>/`. If applying fails, it attempts to restore the configuration and remove the newly created plugin directory, keeps the backup, and reports any restoration errors.

If rollback also fails, the tool records `recovery-required` in the backup's `migration.json`, retains `.obsidian/patches-migration.lock`, and may retain the new plugin directory. Keep Obsidian closed and use that report and the original backup files to restore `community-plugins.json` and `hotkeys.json`; the report also lists files that were originally absent. After confirming the original configuration is restored, remove the newly installed `patches` directory if it remains, then remove the lock before retrying. Keep the backup until recovery is verified.

Note content does not need migration: `patch-mermaid`, `patch-banner`, and `patch-line-width` keep their existing syntax. CSS classes and variables with the `obsidian-patch-` prefix also stay the same. Do not enable the old and new plugin together; both register the same note-rendering features.

## Preparing a release

Keep these values consistent before building:

- `package.json`: the new version.
- `package-lock.json`: the same version in the top-level and root-package entries.
- `manifest.json`: the same version, `id: patches`, `name: Patches`, and the supported minimum Obsidian version.
- `versions.json`: an entry mapping the new version to that minimum Obsidian version. Preserve historical entries.
- `CHANGELOG.md`: move the release's changes from `Unreleased` into a section with the version and actual publication date, leaving an empty `Unreleased` section for future work.

Builds check that package, lockfile, manifest, and compatibility-map versions agree. Run the unit tests and validate the chosen output before creating its tag:

```sh
npm test
npm run build
npm run check:release
```

For the full build:

```sh
npm run build:full
npm run check:release -- --build=full
```

Before tagging a release, include its exact version in the check, for example `npm run check:release -- --tag=0.3.0`. This also checks the tag version and changelog entry; it will fail while that release is still under `Unreleased`.

Install the candidate files in the development vault and verify the affected features. Follow [Integration testing](integration-testing.md) for suites that deploy files and create fixtures. Record the actual tested revision, Obsidian version, platform, results, and skipped checks; earlier verification records are not evidence that the candidate passed.

Commit the release preparation and tag that tested commit with the exact manifest version, such as `0.3.0`, without a `v` prefix. Keep published tags unchanged. In particular, the published `0.2.0` preview used the old `obsidian-patch` ID and reported `0.1.0` in its attached manifest; any corrective release needs a new version rather than reusing its tag.

## Publishing to GitHub

Create a draft release for the prepared tag. Upload `main.js`, `manifest.json`, and `styles.css` from `dist/community/` as three separate attachments. Keep validation metadata, vault settings, and `node_modules` out of the release attachments. GitHub's generated source archives are not installable plugin packages.

Review the title, installation instructions, supported Obsidian version, tested platforms, and attachment versions before publishing. Use the pre-release option when distributing a preview. Publish a regular release when it is ready for the intended release channel, then update the README download instructions to point to it.

The full build remains available through its source-build instructions. The standard release attachments always contain the community build, so Community Directory installation cannot accidentally receive the full build.

See [GitHub release management](https://docs.github.com/en/repositories/releasing-projects-on-github/managing-releases-in-a-repository) and [Obsidian's release requirements](https://docs.obsidian.md/plugins/releasing/submit-plugin).

## Community Directory submission

Before submitting, verify the published name and ID remain available, review the [developer policies](https://docs.obsidian.md/community-directory/developer-policies) and [submission requirements](https://docs.obsidian.md/community-directory/submission-requirements-for-plugins), and confirm that the default branch's manifest matches the published release. Provide the community build command and explain the separate full-build option so reviewers can reproduce the submitted package.

Sign in at [community.obsidian.md](https://community.obsidian.md), connect the repository owner's GitHub account, and choose **Plugins → New plugin**. Submit the repository URL and address review feedback through new commits and releases. Only describe the plugin as available through Community plugins after confirming that users can install it there.
