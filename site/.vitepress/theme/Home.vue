<script setup>
import { withBase } from 'vitepress';
import { computed, ref } from 'vue';
import overview from '../../../docs/images/home-overview.png';
import headingsDemo from '../../../docs/images/heading-number-alignment.png';
import gitDemo from '../../../docs/images/git-change-runs.png';
import brandDemo from '../../../docs/images/callout-brand-appearance.png';
import fontDemo from '../../../docs/images/table-font-suggestions.png';
const demos = [
  { id: 'headings', label: 'Heading numbers', title: 'Number sections in a single note', description: 'In the development build, add patch-heading-numbering: decimal to a note’s properties. Section numbers follow the outline and wrapped titles line up beneath their first word.', image: headingsDemo, alt: 'Sections 9, 9.1, 10 and 10.1 in a shared number column beside Chinese headings', guide: '/features/heading-levels.html#heading-numbering' },
  { id: 'git', label: 'Git changes', title: 'See where an edit begins and ends', description: 'In the development build, one blue bar spans consecutive edited lines and a green bar spans additions. Click either to compare your edits with the last commit.', image: gitDemo, alt: 'A blue bar beside lines 10 to 12 and a green bar beside lines 13 to 15', guide: '/reference/commands.html#compare-a-note-with-git' },
  { id: 'icons', label: 'Callout icons', title: 'Give a callout its brand color', description: 'Install Simple Icons once, then choose a brand logo for a callout, file or folder. Use its official color or pick your own swatch.', image: brandDemo, alt: 'A blue Python logo and color swatches for the PYTHON-NOTES callout type', guide: '/features/callouts.html#type-appearance' },
  { id: 'font', label: 'Table code fonts', title: 'Preview an installed code font', description: 'Type part of a font name and select a suggestion on supported devices. The setting applies to inline code in HTML table cells.', image: fontDemo, alt: 'Typing JetBrains Mo brings up JetBrains Mono and JetBrains Mono NL', guide: '/features/tables.html#inline-code-font' },
];
const selectedDemo = ref('headings');
const demo = computed(() => demos.find(item => item.id === selectedDemo.value));
const groups = [
  { number: '01', title: 'Give ideas a little structure.', description: 'Merge table cells, edit callouts with a live preview, and line up equations without changing the formulas.', links: [['HTML tables', 'tables'], ['Callouts', 'callouts'], ['Math formatting', 'math-format']] },
  { number: '02', title: 'Make the note feel like yours.', description: 'Choose a comfortable reading width. Add a cover and recognizable file icons. Keep your place with quiet editor cues.', links: [['Banners', 'banner'], ['Icons', 'icons'], ['Line width', 'line-width'], ['Active line', 'active-line'], ['Heading levels', 'heading-levels']] },
  { number: '03', title: 'Keep the details when you share.', description: 'Use newer Mermaid diagram types and give exported PDFs a useful outline with working heading links.', links: [['Mermaid diagrams', 'mermaid'], ['PDF navigation', 'pdf-export']] },
];
</script>

<template>
  <div class="patches-home">
    <section class="patches-hero">
      <div class="patches-hero-copy">
        <p class="patches-eyebrow">FOR EVERYDAY OBSIDIAN WORK</p>
        <h1>Small refinements.<br><span>Better notes.</span></h1>
        <p class="patches-intro">Edit tables and callouts, shape your reading space, and make diagrams and exported PDFs more useful.</p>
        <div class="patches-actions">
          <a class="patches-primary" :href="withBase('/getting-started.html')">Get started <span aria-hidden="true">↗</span></a>
          <a class="patches-secondary" href="https://github.com/yaroxy/obsidian-patch" target="_blank" rel="noreferrer">View on GitHub</a>
        </div>
        <p class="patches-requirement">Obsidian 1.15+ <span>·</span> Free & open source</p>
      </div>
      <figure class="patches-demo">
        <div class="patches-demo-top"><span class="patches-window-dots" aria-hidden="true">● ● ●</span><span>A weekend in Kyoto</span><span class="patches-demo-label">ONE NOTE, A FEW PATCHES</span></div>
        <img :src="overview" alt="One Kyoto travel note with the original autumn cover, a merged itinerary table, and a callout with tinted, highlighted code" width="1200" height="1082" fetchpriority="high">
        <figcaption>A cover, a clearer itinerary, and code that fits its callout. <a :href="withBase('/features/banner.html')">Start with a banner →</a></figcaption>
      </figure>
    </section>
    <section class="patches-updates" aria-labelledby="updates-title">
      <div class="patches-section-heading"><h2 id="updates-title">Feature demos</h2></div>
      <div class="patches-demo-switcher" role="group" aria-label="Choose a feature demo">
        <button v-for="item in demos" :key="item.id" type="button" :aria-pressed="selectedDemo === item.id" aria-controls="feature-demo" @click="selectedDemo = item.id">{{ item.label }}</button>
      </div>
      <div id="feature-demo" class="patches-update-panel">
        <div class="patches-update-copy" aria-live="polite"><h3>{{ demo.title }}</h3><p>{{ demo.description }}</p><a :href="withBase(demo.guide)">See the guide →</a></div>
        <div class="patches-update-media"><img :key="demo.id" :src="demo.image" :alt="demo.alt" loading="lazy"></div>
      </div>
    </section>
    <section class="patches-workflows" aria-labelledby="workflows-title">
      <div class="patches-section-heading"><p class="patches-eyebrow">A FEW FOCUSED TOOLS</p><h2 id="workflows-title">Right where you write.</h2><a :href="withBase('/features/index.html')">Explore every feature →</a></div>
      <div v-for="group in groups" :key="group.number" class="patches-workflow">
        <span class="patches-number">{{ group.number }}</span>
        <h3>{{ group.title }}</h3>
        <div><p>{{ group.description }}</p><div class="patches-feature-links"><a v-for="[name, slug] in group.links" :key="slug" :href="withBase(`/features/${slug}.html`)">{{ name }} <span aria-hidden="true">↗</span></a></div></div>
      </div>
    </section>
    <section class="patches-start">
      <div><p class="patches-eyebrow">START WITH ONE SMALL CHANGE</p><h2>A little more room to think.</h2><p>Give one note a wider reading column with a property. The other notes keep their own width.</p><a :href="withBase('/features/line-width.html')">Try per-note line width →</a></div>
      <div class="patches-code"><div>NOTE PROPERTIES <span>YAML</span></div><pre><code>---
<span>patch-line-width:</span> 1100
---</code></pre><p>Enable Readable line length in Obsidian’s editor settings first.</p></div>
    </section>
  </div>
</template>
