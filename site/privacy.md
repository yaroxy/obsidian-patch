# Network and privacy

Patches performs note editing and presentation locally. No account is required to use the plugin, and it does not include analytics or telemetry.

## Simple Icons

In 0.7.0, choosing **Install** or **Update** for Simple Icons downloads the optional catalog to the plugin folder. The initial installation tip makes no network request. Subsequent searches, including after restarting Obsidian, read local data. Opening a picker or rendering a note works offline.

A full load makes up to four JSON requests. It looks up the package version at `data.jsdelivr.com`, then retrieves the icon set, its release information and the matching brand colors from `cdn.jsdelivr.net`. Only package names and versions appear in the request URLs. Note contents, file paths and picker searches stay local. Already-used icons and their available colors are cached in plugin settings for offline display.

In 0.6.0, opening the icon picker for the first time in a session, or selecting **Patch Icons → Update**, can contact jsDelivr to resolve and download the latest Simple Icons set. Used icons missing their cached SVG can also trigger a download. Brand colors are read from JSON for the matching Simple Icons version.

As with any network request, the service receives normal connection information, including the requesting IP address. See [jsDelivr’s privacy policy](https://www.jsdelivr.com/terms/privacy-policy-jsdelivr-net).

## Mermaid

The **Community** build includes Mermaid and its layouts in the plugin. Its two diagram icon packs are compressed JSON stored inside `main.js`. Patches decodes and decompresses each pack locally when a diagram first uses it.

The optional **Full** build can download and execute Mermaid/ELK JavaScript from jsDelivr when Latest or Custom is selected. Those modules run with access to Obsidian. Full is distributed separately for manual installation.

## Local Git and fonts

Patches 0.7.0 uses the desktop Git executable to read a note’s committed contents when its comparison is open or its editor change markers are enabled. It compares those contents with the current editor buffer in memory. The vault stores one device-local on/off preference for all editors. Only visible Markdown editors and open comparison tabs need note contents. The root check looks for Git metadata in the vault directory and its ancestors when the plugin loads or the app regains focus. Font suggestions use the device’s local font list while you use a font field. Both features work offline.

## Vault media and imports

Opening the cover picker lists vault files and filters by media extension. GitHub folder completion lists local folder paths as you type in that setting. Iconize import reads that plugin’s settings inside the vault configuration directory. These operations keep paths and files on the device.

## This documentation site

The documentation uses a local search index in your browser. No analytics or external search service is configured. External links open their respective services.
