import { setIcon } from "obsidian";
import type { AppearanceSettings } from "../appearance";
import { iconColorCss } from "../icons/color";
import { isValidCalloutType } from "./model";

export interface CalloutType {
  name: string;
  icon: string;
  /** A CSS color. Obsidian 1.14+ gives `--callout-color` as hex; older versions and some themes as an `r, g, b` triple. */
  color: string;
}

export interface CalloutTypeGroup {
  primary: string;
  icon: string;
  color: string;
  aliases: string[];
  builtin: boolean;
}

export interface CalloutTypeCatalog {
  github: CalloutType[];
  builtin: CalloutTypeGroup[];
  custom: CalloutTypeGroup[];
  all: CalloutType[];
}

export interface CalloutTypeFilterResult {
  directMatches: CalloutType[];
  canUseCustom: boolean;
  customError?: string;
}

export const BUILTIN_CALLOUT_FAMILIES: readonly (readonly string[])[] = [
  ["note"],
  ["abstract", "summary", "tldr"],
  ["info"],
  ["todo"],
  ["tip", "hint", "important"],
  ["success", "check", "done"],
  ["question", "help", "faq"],
  ["warning", "caution", "attention"],
  ["failure", "fail", "missing"],
  ["danger", "error"],
  ["bug"],
  ["example"],
  ["quote", "cite"],
];

export const BUILTIN_TYPE_NAMES: readonly string[] = BUILTIN_CALLOUT_FAMILIES.flat();

const GITHUB_ALERT_TYPES = ["note", "tip", "important", "warning", "caution"] as const;

const cssColor = (value: string): string => (/^\d+\s*,\s*\d+\s*,\s*\d+$/.test(value) ? `rgb(${value})` : value);

function unquote(value: string): string {
  const trimmed = value.trim();
  return (trimmed.startsWith('"') && trimmed.endsWith('"')) || (trimmed.startsWith("'") && trimmed.endsWith("'"))
    ? trimmed.slice(1, -1).trim()
    : trimmed;
}

/** Rules from every stylesheet, using duck-typing so popout window rules match too. */
function* styleRules(doc: Document): Generator<CSSStyleRule> {
  const walk = function* (rules: CSSRuleList): Generator<CSSStyleRule> {
    for (const rule of Array.from(rules)) {
      if (typeof (rule as CSSStyleRule).selectorText === "string") yield rule as CSSStyleRule;
      if ("cssRules" in rule && rule.cssRules && (rule.cssRules as CSSRuleList).length > 0) {
        yield* walk(rule.cssRules as CSSRuleList);
      }
    }
  };
  for (const sheet of Array.from(doc.styleSheets)) {
    let rules: CSSRuleList;
    try {
      rules = sheet.cssRules;
    } catch {
      continue; // A cross-origin sheet hides its rules.
    }
    yield* walk(rules);
  }
}

/**
 * The callout types Obsidian and loaded themes/snippets define, with each type's
 * icon and color probed from the document's active stylesheets.
 */
export function discoverCalloutTypes(doc: Document, entries: AppearanceSettings["calloutTypes"] = {}, themeOnly = false): CalloutType[] {
  const overrides = new Map(Object.entries(entries));
  const names = [...BUILTIN_TYPE_NAMES];
  const seen = new Set(names.map((name) => name.toLowerCase()));
  function addName(name: string): void {
    const key = name.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      names.push(name);
    }
  }
  for (const rule of styleRules(doc)) {
    for (const match of rule.selectorText.matchAll(/\.callout\[data-callout=["']?([^"'\]]+)["']?\]/g)) {
      if (match[1]) addName(match[1]);
    }
  }
  for (const name of overrides.keys()) addName(name);
  const win = doc.defaultView;
  const probe = doc.body.createDiv({ cls: "callout", attr: { style: "display: none" } });
  probe.addClass("obsidian-patch-callout-theme-probe");
  const types = names.map((name) => {
    const key = name.toLowerCase();
    probe.dataset.callout = key;
    const entry = themeOnly ? undefined : overrides.get(key);
    probe.style.setProperty("--callout-color", iconColorCss(entry?.color) ?? "");
    const style = win ? win.getComputedStyle(probe) : getComputedStyle(probe);
    return {
      name,
      icon: entry?.icon ?? unquote(style.getPropertyValue("--callout-icon")),
      color: cssColor(style.getPropertyValue("--callout-color").trim()),
    };
  });
  probe.remove();
  return types;
}

/**
 * Groups visually identical callout aliases (by icon + color when probed, or by
 * Obsidian's built-in semantic families otherwise) while preserving every alias
 * for direct search, GitHub shortcuts, and theme customizations.
 */
export function groupCalloutTypes(types: readonly CalloutType[]): CalloutTypeCatalog {
  const byLower = new Map<string, CalloutType>();
  for (const type of types) {
    const lower = type.name.toLowerCase();
    if (!byLower.has(lower)) byLower.set(lower, type);
  }
  const builtinRank = new Map<string, { family: number; rank: number }>();
  BUILTIN_CALLOUT_FAMILIES.forEach((familyNames, family) => {
    familyNames.forEach((name, rank) => builtinRank.set(name, { family, rank }));
  });

  const all = [...byLower.values()];
  const github = GITHUB_ALERT_TYPES.map((name) => byLower.get(name) ?? { name, icon: "", color: "" });
  const buildGroups = (items: CalloutType[], builtin: boolean): CalloutTypeGroup[] => {
    const buckets = new Map<string, CalloutType[]>();
    for (const item of items) {
      const lower = item.name.toLowerCase();
      const hasVisual = item.icon !== "" || item.color !== "";
      const key = hasVisual
        ? `${item.icon.toLowerCase()}\0${item.color.toLowerCase()}`
        : builtin
          ? `family:${builtinRank.get(lower)!.family}`
          : `name:${lower}`;
      const list = buckets.get(key);
      if (list) list.push(item);
      else buckets.set(key, [item]);
    }
    return [...buckets.values()].map((members) => {
      const ordered = builtin
        ? [...members].sort((a, b) => {
          const left = builtinRank.get(a.name.toLowerCase())!;
          const right = builtinRank.get(b.name.toLowerCase())!;
          return left.family - right.family || left.rank - right.rank;
        })
        : members;
      const leader = ordered[0]!;
      return {
        primary: leader.name,
        icon: leader.icon,
        color: leader.color,
        aliases: ordered.map((member) => member.name),
        builtin,
      };
    });
  };

  return {
    github,
    builtin: buildGroups(all.filter((t) => builtinRank.has(t.name.toLowerCase())), true),
    custom: buildGroups(all.filter((t) => !builtinRank.has(t.name.toLowerCase())), false),
    all,
  };
}

/** Filters all known callout types (including aliases and custom types) and validates custom type input. */
export function filterCalloutCatalog(catalog: CalloutTypeCatalog, query: string): CalloutTypeFilterResult {
  const trimmed = query.trim();
  if (trimmed === "") return { directMatches: [], canUseCustom: false };
  if (!isValidCalloutType(trimmed)) {
    return { directMatches: [], canUseCustom: false, customError: 'Type names cannot contain "]" or "|".' };
  }
  const needle = trimmed.toLowerCase();
  const ranked: { type: CalloutType; rank: number }[] = [];
  for (const type of catalog.all) {
    const lower = type.name.toLowerCase();
    if (lower === needle) ranked.push({ type, rank: 0 });
    else if (lower.startsWith(needle)) ranked.push({ type, rank: 1 });
    else if (lower.includes(needle)) ranked.push({ type, rank: 2 });
  }
  ranked.sort((a, b) => a.rank - b.rank);
  const directMatches = ranked.map((entry) => entry.type);
  const canUseCustom = !catalog.all.some((type) => type.name.toLowerCase() === needle);
  return { directMatches, canUseCustom };
}

/** Renders a Lucide icon safely, skipping raw inline SVG theme values that `setIcon` cannot accept. */
export function renderChipIcon(el: HTMLElement, icon: string): void {
  if (icon && !icon.trimStart().startsWith("<")) setIcon(el, icon);
}
