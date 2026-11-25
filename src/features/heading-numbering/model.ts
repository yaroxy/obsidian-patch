import { headingText, markdownBlocks } from "../markdown-blocks";

export const NUMBERING_PROPERTY = "patch-heading-numbering";
export const PRESETS = { decimal: "Decimal hierarchy", "zh-report": "Chinese report", "en-outline": "English outline", continuous: "Continuous" } as const;
export type Preset = keyof typeof PRESETS;
export interface NumberingSettings {
  enabled: boolean;
  preset: Preset;
  /** Zero selects the automatic document-title rule. */
  startLevel: number;
  maxDepth: number;
  startAt: number;
}

export function isPreset(value: unknown): value is Preset {
  return typeof value === "string" && Object.prototype.hasOwnProperty.call(PRESETS, value);
}

function integer(value: unknown, min: number, max: number, fallback: number): number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= min && value <= max ? value : fallback;
}

export function parseNumberingSettings(value: unknown): NumberingSettings {
  const data = (value && typeof value === "object" ? value : {}) as Partial<NumberingSettings>;
  return {
    enabled: data.enabled === true, preset: isPreset(data.preset) ? data.preset : "decimal",
    startLevel: integer(data.startLevel, 0, 6, 0), maxDepth: integer(data.maxDepth, 1, 6, 6),
    startAt: integer(data.startAt, 1, Number.MAX_SAFE_INTEGER, 1),
  };
}

export function notePreset(settings: NumberingSettings, property: unknown): Preset | undefined {
  if (property === false || property === "false") return undefined;
  if (isPreset(property)) return property;
  return settings.enabled ? settings.preset : undefined;
}

export interface Heading { line: number; level: number; title: string; }
export interface NumberedHeading extends Heading { prefix: string; depth: number; handwritten: boolean; }
export interface Numbering {
  headings: Map<number, NumberedHeading>;
  conflict?: { heading: NumberedHeading; actual: string };
  romanFallback: boolean;
}

/** Read only headings at the root of the Markdown document. Token maps are zero-based. */
export function bodyHeadings(body: string, firstLine: number): Heading[] {
  const env = {};
  const tokens = markdownBlocks(body, env), headings: Heading[] = [];
  for (const [i, token] of tokens.entries()) {
    if (token.type === "heading_open" && token.level === 0 && token.map) {
      headings.push({ line: firstLine + token.map[0], level: Number(token.tag.slice(1)), title: headingText(tokens[i + 1]!.content, env) });
    }
  }
  return headings;
}

function letters(value: bigint): string {
  let text = "";
  for (let n = value; n > 0n; n = (n - 1n) / 26n) text = String.fromCharCode(65 + Number((n - 1n) % 26n)) + text;
  return text;
}

const romanPlaces = [
  ["", "I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX"],
  ["", "X", "XX", "XXX", "XL", "L", "LX", "LXX", "LXXX", "XC"],
  ["", "C", "CC", "CCC", "CD", "D", "DC", "DCC", "DCCC", "CM"], ["", "M", "MM", "MMM"],
];
function roman(n: bigint): string {
  if (n > 3999n) return String(n);
  return Array.from(String(n)).reverse().map((digit, place) => romanPlaces[place]![Number(digit)]).reverse().join("");
}

function chinese(value: bigint): string {
  const groups = String(value).match(/\d{1,4}(?=(?:\d{4})*$)/g)!;
  const groupUnits = ["", "万", "亿", "兆", "京"];
  let text = "", zero = false;
  for (const [i, group] of groups.entries()) {
    if (+group === 0) { zero = true; continue; }
    if (text && (zero || +group < 1000)) text += "零";
    zero = false;
    let part = "";
    for (const [j, digit] of Array.from(group).entries()) {
      if (digit === "0") { zero = !!part; continue; }
      if (zero) part += "零";
      part += "零一二三四五六七八九"[Number(digit)]! + ["", "十", "百", "千"][group.length - 1 - j]!;
      zero = false;
    }
    text += part + groupUnits[groups.length - 1 - i]!;
    zero = false;
  }
  return text.replace(/^一十/, "十");
}

function formatPrefix(preset: Preset, path: bigint[], ordinal: bigint): string {
  const depth = path.length, n = path[depth - 1]!;
  if (preset === "continuous") return String(ordinal);
  if (preset === "decimal") return path.join(".");
  if (preset === "zh-report") {
    switch (depth) {
      case 1: return chinese(n) + "、";
      case 2: return "（" + chinese(n) + "）";
      case 3: return n + ".";
      case 4: return "（" + n + "）";
      case 5: return letters(n).toLowerCase() + ".";
      default: return "（" + letters(n).toLowerCase() + "）";
    }
  }
  switch (depth) {
    case 1: return roman(n) + ".";
    case 2: return letters(n) + ".";
    case 3: return n + ".";
    case 4: return letters(n).toLowerCase() + ".";
    case 5: return "(" + n + ")";
    default: return "(" + letters(n).toLowerCase() + ")";
  }
}

function writtenPrefix(title: string, expected: string, preset: Preset): string | undefined {
  if (title.startsWith(expected)) {
    const rest = title.slice(expected.length);
    if (!rest || /^\s/.test(rest) || /[、）]$/.test(expected)) return expected;
  }
  // A bare year, a word like 3D, and I/O are all legitimate parts of a title.
  const clear = /^(\d+(?:\.\d+)+\.?|\d+\.|\((?:\d+|[a-z]{1,2})\))(?=\s|$)|^([零一二三四五六七八九十百千万亿兆京]+、|（(?:[零一二三四五六七八九十百千万亿兆京\d]+|[a-z]{1,2})）)/.exec(title);
  if (clear) return clear[1] ?? clear[2];
  if (preset === "en-outline" || preset === "zh-report") return /^((?:[A-Z]{1,2}|[a-z]{1,2}|[IVXLCDM]+)\.)(?=\s|$)/.exec(title)?.[1];
  return undefined;
}

export function numberHeadings(headings: Heading[], settings: NumberingSettings, preset: Preset): Numbering {
  const result: Numbering = { headings: new Map(), romanFallback: false };
  const skipTitle = settings.startLevel === 0 && headings[0]?.level === 1 && headings.filter(h => h.level === 1).length === 1;
  const root = { level: 0, children: BigInt(settings.startAt) - 1n, path: [] as bigint[] };
  const stack = [root];
  let ordinal = BigInt(settings.startAt);
  for (const [index, heading] of headings.entries()) {
    if (index === 0 && skipTitle) continue;
    while (stack.length > 1 && stack[stack.length - 1]!.level >= heading.level) stack.pop();
    if (heading.level < settings.startLevel || stack.length > settings.maxDepth) continue;
    const parent = stack[stack.length - 1]!, path = [...parent.path, ++parent.children];
    stack.push({ level: heading.level, children: 0n, path });
    const prefix = formatPrefix(preset, path, ordinal++);
    const actual = writtenPrefix(heading.title, prefix, preset);
    const row = { ...heading, prefix, depth: path.length, handwritten: actual === prefix };
    result.headings.set(heading.line, row);
    if (actual && actual !== prefix) result.conflict ??= { heading: row, actual };
    if (preset === "en-outline" && path.length === 1 && path[0]! > 3999n) result.romanFallback = true;
  }
  return result;
}
