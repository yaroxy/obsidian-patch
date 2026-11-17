# Network and privacy

Patches performs note editing and presentation locally. No account is required to use the plugin, and it does not include analytics or telemetry.

## Simple Icons

Opening the icon picker for the first time in a session, or selecting **Patch Icons → Update**, can contact jsDelivr to resolve and download the latest Simple Icons set. Used icons missing their cached SVG can also trigger a download. Brand colors are read from JSON for the matching Simple Icons version.

These requests retrieve graphic and color data. They do not download executable JavaScript modules. Already-used icon graphics and their available brand colors are cached in plugin settings and display offline. The picker’s search is performed locally; note contents, file names, and search text are not sent in the requests.

As with any network request, the service receives normal connection information, including the requesting IP address. See [jsDelivr’s privacy policy](https://www.jsdelivr.com/terms/privacy-policy-jsdelivr-net).

## Mermaid

The **Community** build includes Mermaid and its layouts in the plugin. They update with Patches releases and do not need a remote runtime download.

The optional **Full** build can download and execute Mermaid/ELK JavaScript from jsDelivr when Latest or Custom is selected. Those modules run with access to Obsidian. Full is distributed separately for manual installation.

## Vault media and imports

The cover picker lists media paths inside the vault locally. Iconize import reads that plugin’s settings inside the vault configuration directory. These operations do not upload the files or their contents.

## This documentation site

The documentation uses a local search index in your browser. No analytics or external search service is configured. External links open their respective services.
