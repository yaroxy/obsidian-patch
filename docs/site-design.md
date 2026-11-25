# Documentation website

The repository README introduces Patches, provides installation and support links, and keeps the required network disclosures and acknowledgments. `site/` contains the English user documentation; `docs/` retains development designs, testing records, and release procedures. Old-plugin migration is deliberately omitted from the README and getting-started guide at the maintainer’s request. Existing historical release records remain in place.

## Local work

Run `npm run docs:dev` for the live local preview at `http://127.0.0.1:4173/obsidian-patch/`. Run `npm run docs:build` followed by `npm run docs:preview` to inspect the generated static site. Both servers bind only to the loopback interface. The static preview uses Vite directly because VitePress 1.6.4's preview implementation does not honor `--host` or `--strictPort`. No deployment is part of these scripts.

The site uses VitePress 1.6.4, with a scoped override to Vite 6.4.5 because the stable VitePress dependency range selects Vite 5, whose development server has known vulnerabilities. The Vue plugin supports Vite 6. Build and browser checks cover this combination; remove/reassess the override when upgrading VitePress. Neither tool is bundled into the Obsidian plugin.

## Content

The homepage and README share a real travel-note capture combining the existing autumn cover, a merged itinerary table, and a tinted code block inside a callout. The homepage also has a button-controlled demo gallery for heading numbers, Git change markers, callout brand icons, and installed table code fonts, followed by three workflow groups. Guides explain the feature, show its result, give usable examples, and state settings and limitations. Navigation groups writing/editing, note appearance, and rendering/export. The reference section documents note properties, commands, view/platform scope, and CSS variables. Troubleshooting collects recurring questions without duplicating full guides.

Markdown pages reference the original images in `docs/images/`; Vite processes these shared files into site assets. `scripts/prepare-site.mjs` copies the two downloadable examples into the ignored `site/public/examples/` directory. The changelog page includes the root `CHANGELOG.md`, which remains the single source of release notes. Local browser search is enabled; no analytics or remote search provider is configured. Fonts are shipped by the VitePress theme rather than requested from a remote font service.

The README and homepage highlight the 0.7.0 Git, icon and font features. The [table guide](../site/features/tables.md#convert-an-html-table-to-markdown) includes a copyable watchlist for reverse conversion alongside the [0.5.1 inline-formula example](../site/features/tables.md#convert-tables-with-inline-formulas).

The [watchlist conversion](../site/features/tables.md#convert-an-html-table-to-markdown) and [callout appearance](../site/features/callouts.md#type-appearance) screenshots come from the release candidate on Debian with Obsidian 1.15.1. The movie examples use a temporary note in the development vault. The table preview repeats the merged Friday cell for both films. The WATCHLIST callout uses the Lucide clapperboard icon and color `#327771`.

The [callout appearance recording](images/callout-type-appearance.gif) follows the same example in Patches 0.6.0 on Debian with Obsidian 1.15.1. It shows where to open Customize, how to find the icon and apply a color, and what the result looks like in the note. The feature guide displays a still of the result when the browser requests reduced motion.

## Refresh the editor preview images

Build the Community plugin and open the Debian development vault with the **Obsidian (Patches Dev)** launcher. Run the navigation and Git suites sequentially with the absolute dev-vault path. Both commands deploy the build and use temporary notes. The navigation suite also needs Python with `pypdf` and `pdfplumber`. Each runner prints its own output directory. [Runner commands and prerequisites](integration-testing.md#running)

| Runner | PNG in the successful run | Destination in `docs/images/` |
| --- | --- | --- |
| Navigation | `aligned-headings-reading-light.png` | `heading-number-alignment.png` |
| Navigation | `aligned-headings-reading-dark.png` | `heading-number-alignment-dark.png` |
| Navigation | `numbering-settings.png` | `heading-numbering-settings.png` |
| Git diff | `layout-wrapped-heading.png` | `active-numbered-heading.png` |
| Git diff | `change-runs-live-preview.png` | `git-change-runs.png` |
| Git diff | `note-git-gutter.png` | `note-git-gutter.png` |

Inspect each PNG at its original size before copying it. Check that the wrapped title lines up, the Git bars span consecutive lines and the controls named in the caption are visible. The README, feature guides and homepage import the images from this directory. Build and check the site after replacing them.

The [heading numbering forum reply](forum-heading-numbering.md) is ready to post after 0.8.0 is published in the [existing Patches topic](https://forum.obsidian.md/t/patches-focused-fixes-and-enhancements-for-everyday-obsidian-use/121923). Its screenshot URL points to the commit containing the published capture. When replacing the image, pin the new URL to its pushed commit. Check the image and guide link in the forum composer preview before posting.

## Community Directory screenshots

Upload the five PNGs in [the 0.7.0 desktop set](images/community/0.7.0/) in filename order under **Edit listing → Screenshots**. Each image is 1200 × 800 and below 5 MB. The captions sit outside the real captures. [Directory screenshot requirements](https://docs.obsidian.md/community-directory/manage-entry)

| Slot | Upload | Visible features |
| --- | --- | --- |
| 1 | [Reading and layout](images/community/0.7.0/01-reading-and-layout.png) | Kyoto cover, merged itinerary cells, tinted callout code, heading levels and the reading-width setting. |
| 2 | [Git changes](images/community/0.7.0/02-git-changes.png) | Added, edited and deleted lines in the gutter beside the same watchlist compared with its last commit. |
| 3 | [Tables and fonts](images/community/0.7.0/03-tables-and-fonts.png) | HTML-to-Markdown preview with merged cells and a caption, plus installed-font suggestions for inline code. |
| 4 | [Callouts and icons](images/community/0.7.0/04-callouts-and-icons.png) | The Python callout appearance and the explorer picker share an installed Simple Icons catalog and brand-color controls. |
| 5 | [Diagrams and PDF](images/community/0.7.0/05-diagrams-and-pdf.png) | Numbered Mermaid arrows, exported PDF heading bookmarks and links within the document. |

The Git screenshots and font suggestions were captured with the reviewed 0.7.0 build on Debian in Obsidian 1.15.1. The Git example shows the same unsaved watchlist before and after clicking its Friday margin marker. The font field was captured before choosing JetBrains Mono. The icon examples come from the 0.7.0 desktop Icons suite. The layout, table conversion, Mermaid and PDF examples reuse earlier real captures. Earlier directory sets remain in the parent folder.

## Feature demo captures

The original 0.6.0 gallery’s Mermaid screenshot and the [three-second flowchart loop](images/mermaid-flow-steps.gif) come from the published Community 0.4.0 files in Obsidian 1.15.1. Use the English publishing workflow in the [Mermaid guide](../site/features/mermaid.md#number-the-steps-in-a-flowchart) with Bundled and Strict. Set `layout: dagre` within the diagram. In this example, the bundled default ELK layout plays the steps but omits both badges. Obsidian’s native block draws the same nodes and arrows without step numbering or playback.

For the Directory comparison, show the same source in `patch-mermaid` and `mermaid` fences in one Reading view. The site loop samples that rendered SVG at 20 frames per second for one complete cycle. A still from the loop is displayed when the browser requests reduced motion.

The icon-color, exact-width, and callout-code demos were refreshed from the working Community build on 2026-11-17, using macOS / Obsidian 1.15.1 and the default theme. They are stepped animations of real captured interface states. The source frames are only scaled and palette-encoded; controls and rendered output are not reconstructed or painted over. The callout note labels the active background option and theme so the before/after states remain clear.

To refresh them, build the plugin, then run the following with Obsidian open and no dialogs in `dev-vault`. Read [integration testing](integration-testing.md) first: capture deploys the built plugin, creates temporary notes, and changes settings while recording.

```sh
npm run build
node scripts/capture-feature-demos.mjs /path/to/dev-vault /tmp/patches-feature-demos
node scripts/encode-feature-demos.mjs /tmp/patches-feature-demos
```

The capture uses the shared integration runner to restore plugin settings and active tabs, and additionally restores theme, zoom, readable-line-length and inline-title preferences and removes its run folder. The width capture targets Obsidian's separate native settings window. Simple Icons uses the plugin's actual online data loader. The encoder requires `ffmpeg` and writes `docs/images/icons-colors.gif`, `line-width-settings.gif`, and `callout-code-blocks.gif`; inspect the captured frames and resulting site before accepting them. This capture is not a replacement for the full regression suites.

The combined homepage capture uses the original `docs/images/kyoto-cover.jpg` without cropping or changing the image. Refresh it with `node scripts/capture-home-demo.mjs /path/to/dev-vault /tmp/patches-home-demo`, then scale the captured `home-overview.png` to 1200 px wide with `ffmpeg -i /tmp/patches-home-demo/home-overview.png -vf scale=1200:-1 -frames:v 1 docs/images/home-overview.png`. It uses the same isolated session and additionally restores the properties-display preference. Capture at zoom 1 so Electron's native crop coordinates match the DOM rectangle. The temporary capture folder is removed after the run. Inspect the full image for clipping before using it in the README and homepage.

## GitHub Pages deployment

The project-site base is `/obsidian-patch/`, corresponding to `https://yaroxy.github.io/obsidian-patch/`. The repository's Pages source is GitHub Actions. `.github/workflows/docs.yml` builds and checks the site on every push to `main`, relevant pull requests, and manual dispatch. A failed build or local-link check prevents deployment.

Only pushes or manual runs on `main` upload a Pages artifact and run the dependent deployment job. That job configures Pages and deploys `site/.vitepress/dist/` to the `github-pages` environment, with Pages/OIDC write permissions limited to the deployment job. Build jobs have read-only repository permissions. Pull requests and manual runs on other branches upload a seven-day review artifact and cannot deploy. Production runs are serialized without canceling an active deployment; superseded PR runs can be canceled.

Site deployment is independent of the plugin's manual release workflow. It does not create a version tag, attach plugin files, or publish a GitHub Release. Keep next-release availability notes until the plugin itself ships after the Community Directory review. The README links to the published user guides; `docs:check` validates those URLs and anchors against the local build as well as checking repository file links.

The first deployment from `f4b03b18856878f0aa13f3b78ef53eb8a048a5e9` completed successfully on 2026-11-17 ([Actions run](https://github.com/yaroxy/obsidian-patch/actions/runs/44045358174)). The live homepage, cover and icon-demo images, local search results, and direct icon-guide URL were checked before updating the README links. That first deployment published documentation only; the new plugin features were still unreleased at that time.
