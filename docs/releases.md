# Releases and migration

Patches maintains two distributions in separate branches. `main` and official version tags contain the Community source for Community Directory distribution; `codex/full` preserves Full for people who choose to build and install it themselves. Both require Obsidian 1.15.0 or later and use the plugin ID `patches`.

## Build variants

Use Node.js 22 or later and install dependencies with `npm ci`.

| Branch | Distribution | Command | Output | Mermaid versions |
| --- | --- | --- | --- | --- |
| `main` | Community | `npm run build` | `dist/community/` | Bundled only |
| `codex/full` | Full | `npm run build` | `dist/full/` | Bundled, Latest, Custom |

Each output directory contains `main.js`, `manifest.json`, and `styles.css`, plus `metafile.json` and `build-info.json` for validation. Install or publish only the first three files.

Embedded icon packs use the exact build-only dependency `fflate@0.8.3` with compression level 9 and a zero gzip timestamp. This produces gzip bytes without depending on native zlib or the operating system; the compressor is not included in the plugin runtime, and the complete icon data is preserved. Use the same source and `npm ci` lockfile when comparing builds. Release validation records the compression helper's hash so changing it requires a rebuild.

The published `0.3.0` build mismatch was reproduced on macOS using the same source and locked dependencies with Node 22.23.5 and Node 26.0.0: their native zlib versions produced different compressed icon bytes. The Node 26 build matched the published asset, and substituting only those compressed bytes into the Node 22 build reproduced that asset exactly. The new compressor removes that measured source of variation. The review service's Linux environment has not been reproduced locally, and local checks do not establish that a new release has passed its build verification.

The Community source tree contains no Full remote Mermaid or ELK loader. Excluding it only at build time was insufficient for the 0.3.1 source scan; see [Community review history](community-review-history.md). It also turns old Latest or Custom settings into Bundled. The full build retains remote loading from jsDelivr and falls back to bundled Mermaid when a remote version cannot be loaded. Both builds may download Simple Icons data; see the README for network use.

Keep shared feature fixes synchronized from Community into Full while preserving each branch's runtime, build, validation, CI, and documentation differences. Do not merge Full wholesale back into Community. Run each branch's tests and default build independently. Full has no official release-publication workflow; version tags and directory assets are created from Community only.

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

For Full, run the same migration commands from the `codex/full` checkout after building there; that branch selects `dist/full/` by default. Preview is the default; only `--apply` writes to the vault. Applying the migration refuses to proceed while Obsidian is running.

The migration installs the selected build under `.obsidian/plugins/patches/`, copies the old `data.json` when present, replaces the old ID in `community-plugins.json`, and changes `obsidian-patch:` command prefixes in `hotkeys.json` to `patches:`. It preserves whether the old plugin was enabled, retains the old plugin directory, and backs up the original settings and configuration under `.obsidian/patches-migration-backups/<timestamp>-<random>/`. If applying fails, it attempts to restore the configuration and remove the newly created plugin directory, keeps the backup, and reports any restoration errors.

If rollback also fails, the tool records `recovery-required` in the backup's `migration.json`, retains `.obsidian/patches-migration.lock`, and may retain the new plugin directory. Keep Obsidian closed and use that report and the original backup files to restore `community-plugins.json` and `hotkeys.json`; the report also lists files that were originally absent. After confirming the original configuration is restored, remove the newly installed `patches` directory if it remains, then remove the lock before retrying. Keep the backup until recovery is verified.

Note content does not need migration: `patch-mermaid`, `patch-banner`, and `patch-line-width` keep their existing syntax. CSS classes and variables with the `obsidian-patch-` prefix also stay the same. Do not enable the old and new plugin together; both register the same note-rendering features.

After checking that Patches has your settings and hotkeys and works with your notes, you can uninstall **Obsidian Patch** under **Settings → Community plugins**. Keeping it disabled temporarily is also fine. The migration intentionally retains its directory for recovery; the new plugin uses its own `patches/data.json`. Keep the migration backup until you are satisfied with the new installation, and leave **Patches** installed when removing the old plugin.

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

In a clean `codex/full` checkout, the same commands build and check `dist/full/`. The Community checkout rejects Full as a build, migration, or integration target, including stale `dist/full/` files left over from older versions.

Before tagging a release, include its exact version in the check, for example `npm run check:release -- --tag=0.3.2`. This also checks the tag version and changelog entry; it will fail while that release is still under `Unreleased`.

Install the candidate files in the development vault and verify the affected features. Follow [Integration testing](integration-testing.md) for suites that deploy files and create fixtures. Record the actual tested revision, Obsidian version, platform, results, and skipped checks; earlier verification records are not evidence that the candidate passed.

Commit the release preparation and tag that tested commit with the exact manifest version, such as `0.3.2`, without a `v` prefix. Keep published tags unchanged. In particular, the published `0.2.0` preview used the old `obsidian-patch` ID and reported `0.1.0` in its attached manifest; any corrective release needs a new version rather than reusing its tag.

## Publishing to GitHub

Use the manually dispatched **Prepare release** workflow in `.github/workflows/release.yml` to build and attest the release files before creating a draft. Commit the workflow to the default branch, finalize the version and changelog, then push the tested release commit and its exact version tag. The tag must contain the workflow. Dispatch from that same tag so the attestation identifies the source that was actually built; for example, after preparing a new `0.3.2` tag:

```sh
gh workflow run release.yml --repo yaroxy/obsidian-patch --ref 0.3.2 -f tag=0.3.2
```

The workflow checks that the tag exists, matches the dispatched source commit, and has no existing Release or draft. It installs locked dependencies, builds Community, runs unit tests, and checks its package against the tag and finalized changelog. It then creates GitHub artifact attestations for the three Community files and uploads those exact files to an unpublished draft, verifying the uploaded checksums. Release notes come from that version's changelog entry. The workflow never publishes automatically and refuses to overwrite an existing Release, draft, or its attachments. If an upload fails after the draft is created, inspect that draft before deciding how to recover; rerunning the workflow will refuse it.

Attestations exist only after a successful attestation step in an actual GitHub Actions run. Adding this workflow does not attest earlier local builds or published releases. After downloading an asset from a release built by this workflow, verify it with:

```sh
gh attestation verify main.js --repo yaroxy/obsidian-patch
```

Use the same command with `manifest.json` or `styles.css` to verify the other assets. See [GitHub's artifact attestation guide](https://docs.github.com/en/actions/security-for-github-actions/using-artifact-attestations/using-artifact-attestations-to-establish-provenance-for-builds).

The installable package consists of `main.js`, `manifest.json`, and `styles.css` from `dist/community/` as three separate attachments. Keep validation metadata, vault settings, and `node_modules` out of the release attachments. GitHub's generated source archives are not installable plugin packages.

Review the title, installation instructions, supported Obsidian version, tested platforms, and attachment versions before publishing. Use the pre-release option when distributing a preview. Publish a regular release when it is ready for the intended release channel, then update the README download instructions to point to it.

Full remains available through the separate `codex/full` branch and its source-build instructions. The standard release attachments always contain the community build, so Community Directory installation cannot accidentally receive the full build.

See [GitHub release management](https://docs.github.com/en/repositories/releasing-projects-on-github/managing-releases-in-a-repository) and [Obsidian's release requirements](https://docs.obsidian.md/plugins/releasing/submit-plugin).

## Community Directory submission

Before submitting, verify the published name and ID remain available, review the [developer policies](https://docs.obsidian.md/community-directory/developer-policies) and [submission requirements](https://docs.obsidian.md/community-directory/submission-requirements-for-plugins), and confirm that the default branch's manifest matches the published release. Provide the default Community build command and explain the separate Full branch so reviewers can reproduce the submitted package. Read [Community review history](community-review-history.md) before preparing the candidate; preview its exact commit with **Review branch** before tagging a new release.

Sign in at [community.obsidian.md](https://community.obsidian.md), connect the repository owner's GitHub account, and choose **Plugins → New plugin**. Submit the repository URL and address review feedback through new commits and releases. Only describe the plugin as available through Community plugins after confirming that users can install it there.
