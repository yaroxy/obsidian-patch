# Releases and migration

Patches maintains two distributions in separate branches. `main` and official version tags contain the Community source for Community Directory distribution; `codex/full` preserves Full for people who choose to build and install it themselves. Both require Obsidian 1.15.0 or later and use the plugin ID `patches`.

## Build variants

Use Node.js 22 or later and install dependencies with `npm ci`.

| Branch | Distribution | Command | Output | Mermaid versions |
| --- | --- | --- | --- | --- |
| `main` | Community | `npm run build` | `dist/community/` | Bundled only |
| `codex/full` | Full | `npm run build` | `dist/full/` | Bundled, Latest, Custom |

Each output directory contains `main.js`, `manifest.json`, and `styles.css`, plus `metafile.json` and `build-info.json` for validation. Install or publish only the first three files.

The Community development build records the package version and SHA-256 of each locked Iconify `icons.json` in `main.js`. The icon data is available through post-install downloads in Patch Mermaid settings. Package validation rejects bundled Logos or Material Icon Theme JSON. The 0.7.0 release embedded both packs using the pinned `fflate@0.8.3` compressor, level 9 and a zero gzip timestamp.

The published `0.3.0` build mismatch was reproduced on macOS using the same source and locked dependencies with Node 22.23.5 and Node 26.0.0: their native zlib versions produced different compressed icon bytes. The Node 26 build matched the published asset, and substituting only those compressed bytes into the Node 22 build reproduced that asset exactly. The pinned compressor addressed that historical mismatch. The Directory verifies each new release separately.

The Community source tree contains no Full remote Mermaid or ELK loader. Excluding it only at build time was insufficient for the 0.3.1 source scan; see [Community review history](community-review-history.md). It also turns old Latest or Custom settings into Bundled. The full build retains remote loading from jsDelivr and falls back to bundled Mermaid when a remote version cannot be loaded. Both builds may download Simple Icons data; see the README for network use.

Keep shared feature fixes synchronized from Community into Full while preserving each branch's runtime, build, validation, CI, and documentation differences. Do not merge Full wholesale back into Community. Run each branch's tests and default build independently. Full has no official release-publication workflow; version tags and directory assets are created from Community only.

Because both builds use the same ID, installing one replaces the other and keeps the same settings and command hotkeys. A subsequent Community Directory update replaces a manually installed full build with the community build. To continue using the full build, build and install it again from source.

## Updating Obsidian and CodeMirror dependencies

Obsidian provides CodeMirror at runtime. In both distributions, keep `@codemirror/state` and `@codemirror/view` pinned to the exact peer versions declared by the `obsidian` package. Dependabot leaves routine version updates for these three packages to the maintainer.

When updating `obsidian`, check the target package's peers with `npm view obsidian@VERSION peerDependencies`. Set all three versions together in `package.json`, regenerate `package-lock.json` with `npm install --package-lock-only`, then run `npm ci`, `npm test`, and `npm run build`. Commit the manifest and lockfile changes together.

In November 2026, Dependabot raised `@codemirror/view` to `6.43.15` while `obsidian@1.14.4` still required `6.43.13`. Both GitHub workflows stopped at `npm ci` with `ERESOLVE`. Restoring the matching peer pin allowed the other two dependency updates to proceed. [Dependency PR #39](https://github.com/yaroxy/obsidian-patch/pull/39) · [Build failure](https://github.com/yaroxy/obsidian-patch/actions/runs/44318558495)

## Choose a bundled Mermaid version for a personal build

Official builds use the exact Mermaid version in the release lockfile. Dependabot checks npm weekly, and the build reads the installed Mermaid version for the settings page and `dist/community/build-info.json`. A personal Community build can bundle a different version and still render diagrams offline. The production build prints the selected version and a reminder to test custom builds.

In a separate checkout of the desired Patches release, run the following commands. Replace `12.1.0` with the exact version you want to try. The install updates that checkout’s `package.json` and `package-lock.json`, so the same selection can be rebuilt with `npm ci`.

```sh
npm install --save-exact mermaid@12.1.0
npm test
npm run build
npm run check:release
```

**Compatibility:** The standard Mermaid package includes ELK and its named layouts from 12.0.0 onward. This build uses that implementation. Personal builds with an older major version need a matching ELK adapter to render those layouts. A different Mermaid version can also change diagram syntax and SVG output. [Mermaid layout documentation](https://mermaid.js.org/config/layouts.html)

Before using a personal build in your main vault, run `node scripts/test-mermaid.mjs /absolute/path/to/dev-vault` from the same checkout. This suite installs that build into the named development vault and exercises the actual renderer. See [Integration testing](integration-testing.md) for prerequisites, fixtures, and settings restoration. Try representative diagrams from your own notes as well. A later directory update replaces the personal build with the official bundle.

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

## Community release workflow

### Review the pushed branch

After pushing a Community release candidate, open the Patches entry in the Community Directory and run **Review branch** for the exact commit SHA. Record the branch, SHA, date, and Directory result in [Community review history](community-review-history.md). Fix blocking findings, push the revised commit, and run the preview again. Document why any remaining warnings or recommendations can be accepted. [Community Directory review instructions](https://docs.obsidian.md/community-directory/manage-entry#fix-a-failed-review)

### Prepare the release materials

Once the branch review passes, prepare all three items for the release.

- **README update.** Summarize the main user-visible changes, refresh affected instructions and examples, and check the release and download links once they are live.
- **Documentation site update.** Update the affected guides and reference pages. Refresh the homepage demo when it shows changed behavior. Run `npm run docs:build` and `npm run docs:check`, then verify changed screenshots and copyable examples in the site preview. [Documentation website guide](site-design.md)
- **English forum draft.** Prepare a reply for the existing Patches topic explaining what changed and how users can try it. Include the release and relevant guide links. Add a screenshot or a copyable example when it helps demonstrate the change. [Patches forum topic](https://forum.obsidian.md/t/patches-focused-fixes-and-enhancements-for-everyday-obsidian-use/121923)

Keep feature names, setup steps, and compatibility details consistent across the three items. Follow the versioning, validation, and publication steps below. If release preparation changes anything covered by the branch review, push the updated candidate and run **Review branch** again before tagging. After publication, verify the GitHub release and the deployed site. Confirm that the Directory offers the new version before telling users to update through **Community plugins**.

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

After publishing 0.8.0, use the [prepared forum reply about heading numbers](forum-heading-numbering.md) in the [existing Patches discussion](https://forum.obsidian.md/t/patches-focused-fixes-and-enhancements-for-everyday-obsidian-use/121923). It includes a sample note and a screenshot pinned to its source commit.

For 0.7.0, see the [prepared forum reply about Git changes and brand icons](forum-git-and-brand-icons.md) in the [existing Patches discussion](https://forum.obsidian.md/t/patches-focused-fixes-and-enhancements-for-everyday-obsidian-use/121923). Its screenshots link to the commit that contains the captures. The [directory gallery guide](site-design.md#community-directory-screenshots) lists all five 0.7.0 desktop uploads in order.

Full remains available through the separate `codex/full` branch and its source-build instructions. The standard release attachments always contain the community build, so Community Directory installation cannot accidentally receive the full build.

See [GitHub release management](https://docs.github.com/en/repositories/releasing-projects-on-github/managing-releases-in-a-repository) and [Obsidian's release requirements](https://docs.obsidian.md/plugins/releasing/submit-plugin).

## Community Directory submission

Before submitting, verify the published name and ID remain available, review the [developer policies](https://docs.obsidian.md/community-directory/developer-policies) and [submission requirements](https://docs.obsidian.md/community-directory/submission-requirements-for-plugins), and confirm that the default branch's manifest matches the published release. Provide the default Community build command and explain the separate Full branch so reviewers can reproduce the submitted package. For subsequent releases, follow the [Community release workflow](#community-release-workflow).

Sign in at [community.obsidian.md](https://community.obsidian.md), connect the repository owner's GitHub account, and choose **Plugins → New plugin**. Submit the repository URL and address review feedback through new commits and releases. Only describe the plugin as available through Community plugins after confirming that users can install it there.
