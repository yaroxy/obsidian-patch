import assert from "node:assert/strict";
import test from "node:test";
import { build } from "esbuild";

async function load(entryPoint) {
  const bundle = await build({ entryPoints: [entryPoint], bundle: true, write: false, format: "esm", platform: "node" });
  return import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString("base64")}`);
}

const { convertIconize, iconizeName, iconRules, parseIconId, parseIconSettings, renameIconPaths } =
  await load("src/features/icons/config.ts");
const { parseIconifySet } = await load("src/features/icons/simple-icons.ts");

const SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M0 0h24v24H0z"/></svg>';

test("settings keep valid icons and drop malformed entries", () => {
  assert.deepEqual(parseIconSettings(undefined), { enabled: true, paths: {}, svgs: {}, cachedLatest: undefined });
  const settings = parseIconSettings({
    enabled: false,
    paths: { Notes: "lucide:atom", "Notes/Python": "simple-icons:python", "": "lucide:atom", Bad: "LiAtom", Num: 3 },
    svgs: { "simple-icons:python": SVG, "lucide:atom": SVG, "simple-icons:rust": "<path/>" },
    cachedLatest: "1.2.101",
  });
  assert.deepEqual(settings, {
    enabled: false,
    paths: { Notes: "lucide:atom", "Notes/Python": "simple-icons:python" },
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

test("rules escape paths and embed SVGs as data URLs", () => {
  assert.equal(iconRules([]), "");
  const css = iconRules([['Say "hi"\\', SVG], ["Notes/日本語", SVG]]);
  assert.match(css, /\[data-path="Say \\"hi\\"\\\\"\]/);
  assert.match(css, /\[data-path="Notes\/日本語"\]/);
  assert.match(css, /--obsidian-patch-icon: url\("data:image\/svg\+xml,%3Csvg/);
  assert.doesNotMatch(css, /<svg/);
  assert.equal(css.match(/content: "";/g)?.length, 1);
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
