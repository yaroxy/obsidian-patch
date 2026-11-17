import assert from "node:assert/strict";
import { after, test } from "node:test";
import { build } from "esbuild";

const previousWindow = globalThis.window;
const network = { request: () => { throw new Error("Unexpected icon request"); } };
globalThis.__patchesIconsNetworkTest = network;
globalThis.window = globalThis;
after(() => {
  delete globalThis.__patchesIconsNetworkTest;
  if (previousWindow === undefined) delete globalThis.window;
  else globalThis.window = previousWindow;
});

async function load(entryPoint) {
  const bundle = await build({ entryPoints: [entryPoint], bundle: true, write: false, format: "esm", platform: "node",
    plugins: [{ name: "icons-network-test", setup(builder) {
      builder.onResolve({ filter: /^obsidian$/ }, () => ({ path: "obsidian", namespace: "icons-test" }));
      builder.onLoad({ filter: /.*/, namespace: "icons-test" }, () => ({
        contents: "export function requestUrl(options) { return globalThis.__patchesIconsNetworkTest.request(options); }",
      }));
    } }],
  });
  return import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString("base64")}`);
}

const { convertIconize, iconizeName, svgUrl, parseIconId, parseIconSettings, renameIconPaths } =
  await load("src/features/icons/config.ts");
const { parseIconifySet, loadSimpleIcons } = await load("src/features/icons/simple-icons.ts");
const { parseIconColor, iconColorCss } = await load("src/features/icons/color.ts");

const SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M0 0h24v24H0z"/></svg>';

test("old assignments retain text color; invalid and orphaned color assignments are discarded", () => {
  const s = parseIconSettings({ paths: { A: "lucide:atom", B: "simple-icons:python", C: "lucide:atom" },
    colors: { A: "brand", B: "brand", C: "#abc", Missing: "red" },
    brandColors: { "simple-icons:python": "#3776AB", "simple-icons:bad": "red; color: blue", "lucide:atom": "#123456" } });
  assert.deepEqual(s.colors, { B: "brand", C: "#AABBCC" });
  assert.deepEqual(s.brandColors, { "simple-icons:python": "#3776AB" });
  assert.equal(iconColorCss(undefined), undefined);
  assert.equal(iconColorCss("text"), undefined);
  assert.equal(iconColorCss("brand", s.brandColors["simple-icons:python"]), "#3776AB");
  assert.equal(iconColorCss("brand"), undefined);
  assert.equal(iconColorCss("blue"), "var(--color-blue)");
  for (const bad of ["red;display:none", "var(--anything)", "#12345g", "#12345678", 5]) assert.equal(parseIconColor(bad), undefined);
});

test("brand metadata uses explicit slugs, upstream title normalization and aliases", () => {
  const set = parseIconifySet({ icons: { cplusplus: { body: "<path/>" }, special: { body: "<path/>" } }, aliases: { cpp: { parent: "cplusplus" } } }, "16.36.0", "1.2.101",
    [{ title: "C++", hex: "00599c" }, { title: "Unrelated title", slug: "special", hex: "123456" }, { title: "bad", hex: "not-a-color" }]);
  assert.equal(set.color("cplusplus"), "#00599C");
  assert.equal(set.color("cpp"), "#00599C");
  assert.equal(set.color("special"), "#123456");
  assert.equal(set.color("bad"), undefined);
});

test("a color metadata outage leaves the icon set usable", async () => {
  network.request = async ({ url }) => {
    if (url.endsWith("data/simple-icons.json")) throw new Error("Metadata unavailable");
    const data = url.includes("/resolved?") ? { version: "1.2.101" } : url.endsWith("info.json") ? { version: "16.36.0" } : { icons: { python: { body: "<path/>" } } };
    return { status: 200, text: JSON.stringify(data) };
  };
  const set = await loadSimpleIcons(undefined, () => {});
  assert.ok(set.svg("python"));
  assert.equal(set.color("python"), undefined);
});

test("settings keep valid icons and drop malformed entries", () => {
  assert.deepEqual(parseIconSettings(undefined), { enabled: true, paths: {}, colors: {}, brandColors: {}, svgs: {}, cachedLatest: undefined });
  const settings = parseIconSettings({
    enabled: false,
    paths: { Notes: "lucide:atom", "Notes/Python": "simple-icons:python", "": "lucide:atom", Bad: "LiAtom", Num: 3 },
    svgs: { "simple-icons:python": SVG, "lucide:atom": SVG, "simple-icons:rust": "<path/>" },
    cachedLatest: "1.2.101",
  });
  assert.deepEqual(settings, {
    enabled: false,
    paths: { Notes: "lucide:atom", "Notes/Python": "simple-icons:python" },
    colors: {}, brandColors: {},
    svgs: { "simple-icons:python": SVG },
    cachedLatest: "1.2.101",
  });
});

test("icon ids name a source and a kebab-case icon", () => {
  assert.deepEqual(parseIconId("lucide:calendar-days"), { source: "lucide", name: "calendar-days" });
  assert.deepEqual(parseIconId("simple-icons:1password"), { source: "simple-icons", name: "1password" });
  for (const id of ["lucide:", "fa:house", "lucide:Atom", "simple-icons:a--b", "atom"]) {
    assert.equal(parseIconId(id), undefined, id);
  }
});

test("Iconize names match its own normalization of Lucide names", () => {
  assert.equal(iconizeName("calendar-days"), "CalendarDays");
  assert.equal(iconizeName("building-2"), "Building2");
  assert.equal(iconizeName("arrow-down-0-1"), "ArrowDown01");
});

test("Iconize data converts Lucide and Simple Icons and reports everything else", () => {
  const lucide = new Map([["Atom", "atom"], ["CalendarDays", "calendar-days"], ["Building2", "building-2"]]);
  const result = convertIconize({
    settings: { iconPacksPath: ".obsidian/icons" },
    "03-Knowledge": "LiAtom",
    "06-Daily": { iconName: "LiCalendarDays", iconColor: "#ff0000" },
    "Lab": "LiBuilding2",
    "03-Knowledge/Colab": "SiGooglecolab",
    "Vault/1P": "Si1password",
    "00-Inbox": "📥",
    "01-Projects": "FaHouse",
    "02-Areas": "LiNotAnIcon",
    "Empty": "",
    "Odd": { color: "#000" },
  }, lucide);
  assert.deepEqual(result.paths, {
    "03-Knowledge": "lucide:atom",
    "06-Daily": "lucide:calendar-days",
    "Lab": "lucide:building-2",
    "03-Knowledge/Colab": "simple-icons:googlecolab",
    "Vault/1P": "simple-icons:1password",
  });
  assert.deepEqual(result.skipped, [
    { path: "00-Inbox", icon: "📥" },
    { path: "01-Projects", icon: "FaHouse" },
    { path: "02-Areas", icon: "LiNotAnIcon" },
  ]);
  assert.deepEqual(convertIconize(null, lucide), { paths: {}, skipped: [] });
});

test("renames move a folder's icon and its descendants, but not similarly named siblings", () => {
  const paths = { Notes: "lucide:atom", "Notes/Python": "simple-icons:python", "Notes Archive": "lucide:archive", Other: "lucide:map" };
  assert.deepEqual(renameIconPaths(paths, "Notes", "Knowledge"), {
    "Notes Archive": "lucide:archive",
    Other: "lucide:map",
    Knowledge: "lucide:atom",
    "Knowledge/Python": "simple-icons:python",
  });
  assert.equal(renameIconPaths(paths, "Elsewhere", "Moved"), undefined);
});

test("a moved icon wins over one left at its new path by a deleted file", () => {
  assert.deepEqual(renameIconPaths({ B: "lucide:map", A: "lucide:atom" }, "A", "B"), { B: "lucide:atom" });
});

test("SVGs are encoded as image data URLs rather than HTML or CSS declarations", () => {
  const image = svgUrl(SVG);
  assert.match(image, /^url\("data:image\/svg\+xml,%3Csvg/);
  assert.doesNotMatch(image, /<svg/);
  assert.equal(decodeURIComponent(image.slice('url("data:image/svg+xml,'.length, -2)), SVG);
  assert.doesNotMatch(svgUrl('<svg><path d="x\"); color: red; /*"/></svg>'), /\); color:/);
});

test("Iconify sets build SVGs from their defaults and hide deprecated icons", () => {
  const set = parseIconifySet({
    width: 24,
    height: 24,
    icons: { python: { body: "<path/>" }, old: { body: "<path/>", hidden: true }, wide: { body: "<g/>", width: 48 }, bad: { svg: "x" } },
    aliases: { py: { parent: "python" } },
  }, "16.36.0", "1.2.101");
  assert.equal(set.version, "16.36.0");
  assert.deepEqual(set.names, ["python", "wide"]);
  assert.equal(set.svg("python"), '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path/></svg>');
  assert.equal(set.svg("py"), set.svg("python"));
  assert.equal(set.svg("old"), '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path/></svg>');
  assert.equal(set.svg("wide"), '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 24"><g/></svg>');
  assert.equal(set.svg("bad"), undefined);
  assert.throws(() => parseIconifySet({ prefix: "simple-icons" }, "1", "1"), /invalid icon set/);
});

test("Simple Icons loads JSON through requestUrl and reports the resolved package version", async () => {
  const requests = [], resolved = [];
  network.request = async (options) => {
    requests.push(options);
    const data = options.url.includes("/resolved?") ? { version: "1.2.101" }
      : options.url.endsWith("info.json") ? { version: "16.36.0" }
        : options.url.endsWith("data/simple-icons.json") ? [{ title: "Python", hex: "3776AB" }] : { icons: { python: { body: "<path/>" } } };
    return { status: 200, text: JSON.stringify(data) };
  };
  const set = await loadSimpleIcons(undefined, (version) => resolved.push(version));
  assert.equal(set.version, "16.36.0");
  assert.deepEqual(set.names, ["python"]);
  assert.deepEqual(resolved, ["1.2.101"]);
  assert.equal(requests.length, 4);
  assert.equal(set.color("python"), "#3776AB");
  assert.match(requests[3].url, /simple-icons@16\.36\.0\/data\/simple-icons\.json$/);
  assert.equal(requests.every(({ throw: shouldThrow }) => shouldThrow === false), true);
  assert.equal(requests.slice(1, 3).every(({ url }) => url.includes("@1.2.101/")), true);
});

test("Simple Icons uses its cached version when the latest lookup fails and tolerates missing info", async () => {
  network.request = async ({ url }) => {
    if (url.includes("/resolved?")) throw new Error("Offline lookup");
    if (url.endsWith("info.json")) return { status: 404, text: "missing" };
    assert.match(url, /@1\.2\.100\/icons\.json$/);
    return { status: 200, text: JSON.stringify({ icons: { rust: { body: "<path/>" } } }) };
  };
  const set = await loadSimpleIcons("1.2.100", () => {});
  assert.equal(set.version, "1.2.100");
  assert.deepEqual(set.names, ["rust"]);
});

test("Simple Icons rejects non-success responses and invalid resolved versions", async () => {
  network.request = async () => ({ status: 503, text: "unavailable" });
  await assert.rejects(loadSimpleIcons(undefined, () => {}), /503/);
  network.request = async () => ({ status: 200, text: JSON.stringify({ version: "../invalid" }) });
  await assert.rejects(loadSimpleIcons(undefined, () => {}), /did not resolve/);
});

test("Simple Icons times out without using late responses and clears its timeout", async () => {
  const previous = globalThis.window;
  let complete, cleared = 0, resolved = 0;
  globalThis.window = {
    setTimeout(callback, delay) { assert.equal(delay, 30_000); queueMicrotask(callback); return 42; },
    clearTimeout(timer) { assert.equal(timer, 42); cleared += 1; },
  };
  network.request = () => new Promise((resolve) => { complete = resolve; });
  try {
    await assert.rejects(loadSimpleIcons(undefined, () => { resolved += 1; }), /Timed out after 30 seconds/);
    complete({ status: 200, text: JSON.stringify({ version: "1.2.101" }) });
    await Promise.resolve();
    assert.equal(resolved, 0);
    assert.equal(cleared, 1);
  } finally { globalThis.window = previous; }
});
