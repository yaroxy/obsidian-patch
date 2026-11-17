import { defineConfig } from 'vitepress';

export default defineConfig({
  title: 'Patches',
  description: 'Focused fixes and enhancements for everyday Obsidian work.',
  lang: 'en-US',
  base: '/obsidian-patch/',
  cleanUrls: false,
  lastUpdated: false,
  markdown: { image: { lazyLoading: true } },
  themeConfig: {
    siteTitle: 'Patches',
    nav: [
      { text: 'Guide', link: '/getting-started' },
      { text: 'Features', link: '/features/' },
      { text: 'Reference', link: '/reference/properties' },
      { text: 'Changelog', link: '/changelog' },
    ],
    sidebar: [
      { text: 'Start here', items: [
        { text: 'Getting started', link: '/getting-started' },
        { text: 'Feature overview', link: '/features/' },
      ] },
      { text: 'Write & edit', items: [
        { text: 'HTML tables', link: '/features/tables' },
        { text: 'Callouts', link: '/features/callouts' },
        { text: 'Math formatting', link: '/features/math-format' },
      ] },
      { text: 'Shape your notes', items: [
        { text: 'Banners', link: '/features/banner' },
        { text: 'File & folder icons', link: '/features/icons' },
        { text: 'Line width', link: '/features/line-width' },
        { text: 'Active line', link: '/features/active-line' },
        { text: 'Heading levels', link: '/features/heading-levels' },
      ] },
      { text: 'Render & share', items: [
        { text: 'Mermaid diagrams', link: '/features/mermaid' },
        { text: 'PDF navigation', link: '/features/pdf-export' },
      ] },
      { text: 'Reference & help', items: [
        { text: 'Note properties', link: '/reference/properties' },
        { text: 'Commands', link: '/reference/commands' },
        { text: 'Views & platforms', link: '/reference/compatibility' },
        { text: 'CSS customization', link: '/reference/appearance' },
        { text: 'Network & privacy', link: '/privacy' },
        { text: 'Troubleshooting', link: '/troubleshooting' },
        { text: 'Changelog', link: '/changelog' },
      ] },
    ],
    socialLinks: [{ icon: 'github', link: 'https://github.com/yaroxy/obsidian-patch' }],
    search: { provider: 'local' },
    outline: { level: [2, 3], label: 'On this page' },
    footer: { message: 'An independent Obsidian community plugin. Released under the MIT License.', copyright: 'Patches · Made by yaroxy' },
  },
});
