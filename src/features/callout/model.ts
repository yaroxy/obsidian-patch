/**
 * Callouts as text: finding them in a note, rewriting their header, wrapping
 * lines into a callout and unwrapping one back to text, and checking what
 * GitHub renders as an alert.
 */

export type Fold = "" | "+" | "-";

export interface CalloutHeader {
  type: string;
  /** Text after `|` inside the brackets, which themes read; "" when absent. */
  metadata: string;
  fold: Fold;
  title: string;
}

export interface Callout {
  /** Offset of the header line. */
  from: number;
  /** Offset just past the last line, before its line break. */
  to: number;
  /** Line number of the header. */
  line: number;
  /** Whitespace before the markers, as in a list item. */
  indent: string;
  /** Blockquote markers on the header line: 1 for a top-level callout. */
  depth: number;
  header: CalloutHeader;
  /** The lines after the header without this callout's markers. */
  body: string[];
}

const HEADER = /^([ \t]*)((?:>[ \t]?)+)[ \t]*\[!([^\]|]+?)(?:\|([^\]]*))?\]([+-]?)(.*)$/;
const MARKERS = /^(?:[ \t]*>[ \t]?)*[ \t]*/;
const FENCE = /^(`{3,}|~{3,})/;

export function parseHeader(line: string): { indent: string; depth: number; header: CalloutHeader } | undefined {
  const match = HEADER.exec(line);
  if (!match) return undefined;
  const [, indent = "", markers = "", type = "", metadata = "", fold = "", title = ""] = match;
  return { indent, depth: (markers.match(/>/g) ?? []).length, header: { type: type.trim(), metadata: metadata.trim(), fold: fold as Fold, title: title.trim() } };
}

export function formatHeader({ type, metadata, fold, title }: CalloutHeader): string {
  return `[!${type}${metadata ? `|${metadata}` : ""}]${fold}${title ? ` ${title}` : ""}`;
}

/** The title Obsidian shows for a callout without one: the type in lower case, hyphens as spaces, capitalized. */
export function defaultTitle(type: string): string {
  const words = type.toLowerCase().replace(/-/g, " ");
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/** A line at the given blockquote depth: `> > text`, or a bare `> >` when empty. */
export function withMarkers(content: string, indent: string, depth: number): string {
  if (depth === 0) return content === "" ? "" : indent + content;
  const markers = Array.from({ length: depth }, () => ">").join(" ");
  return `${indent}${markers}${content === "" ? "" : ` ${content}`}`;
}

/** The line without its indent and first `depth` markers, or undefined when it lacks them. */
function contentOf(line: string, indent: string, depth: number): string | undefined {
  if (!line.startsWith(indent)) return undefined;
  let rest = line.slice(indent.length);
  for (let i = 0; i < depth; i++) {
    const marker = /^[ \t]*>[ \t]?/.exec(rest);
    if (!marker) return undefined;
    rest = rest.slice(marker[0].length);
  }
  return rest;
}

const closesFence = (text: string, fence: string): boolean => text.startsWith(fence) && /^[`~]+\s*$/.test(text);

/** Lines that start their own block, so they never continue a paragraph lazily. */
const STARTS_BLOCK = /^(?:#{1,6}(?:\s|$)|`{3,}|~{3,}|\$\$|[-*+](?:\s|$)|\d{1,9}[.)](?:\s|$)|(?:[-*_][ \t]*){3,}$|>)/;
/** Lines after which a lazy line cannot continue: headings, rules and math delimiters. */
const ENDS_PARAGRAPH = /^(?:#{1,6}(?:\s|$)|(?:[-*_][ \t]*){3,}$|\$\$)/;

/**
 * Every callout in a note, nested ones included, outside frontmatter and
 * fenced code. A callout runs while lines carry its markers, plus lines that
 * lazily continue a paragraph, as in CommonMark.
 */
export function findCallouts(markdown: string): Callout[] {
  const lines = markdown.split("\n");
  const offsets: number[] = [];
  let offset = 0;
  for (const line of lines) {
    offsets.push(offset);
    offset += line.length + 1;
  }
  const callouts: Callout[] = [];
  let i = 0;
  if (lines[0] === "---") {
    const close = lines.findIndex((line, index) => index > 0 && (line === "---" || line === "..."));
    i = close < 0 ? lines.length : close + 1;
  }
  let fence: string | undefined;
  for (; i < lines.length; i++) {
    const line = lines[i] ?? "";
    const inner = line.replace(MARKERS, "");
    if (fence !== undefined) {
      if (closesFence(inner, fence)) fence = undefined;
      continue;
    }
    const opening = FENCE.exec(inner);
    if (opening) {
      fence = opening[1];
      continue;
    }
    const head = parseHeader(line);
    if (!head) continue;

    const body: string[] = [];
    let paragraph = true;
    let innerFence: string | undefined;
    let j = i + 1;
    for (; j < lines.length; j++) {
      const next = lines[j] ?? "";
      const content = contentOf(next, head.indent, head.depth);
      if (content !== undefined) {
        body.push(content);
        const text = content.replace(MARKERS, "");
        if (innerFence !== undefined) {
          if (closesFence(text, innerFence)) innerFence = undefined;
          paragraph = false;
        } else if (FENCE.test(text)) {
          innerFence = FENCE.exec(text)?.[1];
          paragraph = false;
        } else {
          paragraph = text.trim() !== "" && !ENDS_PARAGRAPH.test(text.trim());
        }
        continue;
      }
      const lazy = next.trimStart();
      if (lazy === "" || !paragraph || innerFence !== undefined || STARTS_BLOCK.test(lazy)) break;
      body.push(lazy);
    }
    callouts.push({
      from: offsets[i] ?? 0,
      to: (offsets[j - 1] ?? 0) + (lines[j - 1] ?? "").length,
      line: i,
      indent: head.indent,
      depth: head.depth,
      header: head.header,
      body,
    });
  }
  return callouts;
}

/** The innermost callout around an offset. */
export function calloutAt(callouts: Callout[], offset: number): Callout | undefined {
  return callouts.filter(({ from, to }) => from <= offset && offset <= to)
    .reduce<Callout | undefined>((inner, callout) => (inner && inner.depth >= callout.depth ? inner : callout), undefined);
}

/** A callout's lines from its parts, with canonical `> ` markers. */
export function calloutLines(indent: string, depth: number, header: CalloutHeader, body: string[]): string[] {
  return [withMarkers(formatHeader(header), indent, depth), ...body.map((content) => withMarkers(content, indent, depth))];
}

/** The leading whitespace that every non-blank line shares, such as a list item's indent. */
export function commonIndent(lines: string[]): string {
  const leads = lines.filter((line) => line.trim() !== "").map((line) => /^[ \t]*/.exec(line)?.[0] ?? "");
  return leads.length === 0 ? "" : leads.reduce((common, lead) => (lead.startsWith(common) ? common : common.startsWith(lead) ? lead : ""));
}

/** Wraps whole lines into a callout placed at their common indent. */
export function wrapLines(lines: string[], header: CalloutHeader): string[] {
  const indent = commonIndent(lines);
  return calloutLines(indent, 1, header, lines.map((line) => (line.trim() === "" ? "" : line.slice(indent.length))));
}

/** The callout as plain text one level out; its title becomes a bold first line. */
export function unwrapToText(callout: Callout): string[] {
  const { indent, depth, header, body } = callout;
  const lines = body.map((content) => withMarkers(content, indent, depth - 1));
  if (header.title === "") return lines;
  const title = withMarkers(`**${header.title}**`, indent, depth - 1);
  return body[0]?.trim() ? [title, withMarkers("", indent, depth - 1), ...lines] : [title, ...lines];
}

/** The callout as a plain blockquote; its title becomes a bold first line. */
export function unwrapToBlockquote(callout: Callout): string[] {
  const { indent, depth, header, body } = callout;
  const lines = [...(header.title ? [`**${header.title}**`] : []), ...body].map((content) => withMarkers(content, indent, depth));
  return lines.length > 0 ? lines : [withMarkers("", indent, depth)];
}

export const GITHUB_TYPES = ["NOTE", "TIP", "IMPORTANT", "WARNING", "CAUTION"];

const GITHUB_TYPE: Record<string, string> = {
  note: "NOTE", info: "NOTE", abstract: "NOTE", summary: "NOTE", tldr: "NOTE", todo: "NOTE", question: "NOTE",
  help: "NOTE", faq: "NOTE", example: "NOTE", quote: "NOTE", cite: "NOTE",
  tip: "TIP", hint: "TIP", success: "TIP", check: "TIP", done: "TIP",
  important: "IMPORTANT",
  warning: "WARNING", attention: "WARNING", bug: "WARNING",
  caution: "CAUTION", danger: "CAUTION", error: "CAUTION", failure: "CAUTION", fail: "CAUTION", missing: "CAUTION",
};

/** The GitHub alert closest to a callout type; unknown types become NOTE. */
export const githubType = (type: string): string => GITHUB_TYPE[type.toLowerCase()] ?? "NOTE";

export interface GitHubIssue {
  /** `error`: GitHub shows a plain blockquote. `warning`: the alert shows, but part of it does not render. */
  level: "error" | "warning" | "info";
  message: string;
}

const OBSIDIAN_SYNTAX = /!?\[\[[^\]]*\]\]|==[^=\s][^=]*==|%%|\s\^[A-Za-z0-9-]+\s*$/;

/** How GitHub renders a callout, from the rules of its Markdown renderer. */
export function githubIssues(callout: Pick<Callout, "indent" | "depth" | "header" | "body">): GitHubIssue[] {
  const { header, body } = callout;
  const issues: GitHubIssue[] = [];
  const error = (message: string): void => { issues.push({ level: "error", message }); };
  if (!GITHUB_TYPES.includes(header.type.toUpperCase())) {
    error(`GitHub has no "${header.type}" alert, only NOTE, TIP, IMPORTANT, WARNING and CAUTION.`);
  }
  if (header.title) error("GitHub alerts have no title: text after the marker makes it a plain blockquote.");
  if (header.fold) error(`GitHub alerts cannot fold: "${header.fold}" makes it a plain blockquote.`);
  if (header.metadata) error(`GitHub does not read "|${header.metadata}": it makes it a plain blockquote.`);
  if (callout.depth > 1 || callout.indent !== "") {
    error("GitHub shows alerts only at the top level, not inside lists, quotes or other callouts.");
  }
  if (!body.some((line) => line.replace(MARKERS, "").trim() !== "")) error("GitHub needs at least one line of content to show an alert.");
  if (body.some((line) => parseHeader(line) !== undefined)) {
    issues.push({ level: "warning", message: "A callout inside this one shows on GitHub as a plain blockquote starting with [!TYPE]." });
  }
  if (body.some((line) => OBSIDIAN_SYNTAX.test(line))) {
    issues.push({ level: "warning", message: "GitHub shows Obsidian syntax such as [[links]], ![[embeds]], ==highlights== and %%comments%% as plain text." });
  }
  if (header.type.toLowerCase() === "caution") {
    issues.push({ level: "info", message: "Obsidian draws caution like warning, in orange; GitHub shows CAUTION in red." });
  }
  return issues;
}

/**
 * The closest GitHub-compatible form: a GitHub type, no fold or metadata, and
 * the title as a bold first line. Placement in lists or quotes stays as it is.
 */
export function toGitHub(header: CalloutHeader, body: string[]): { header: CalloutHeader; body: string[] } {
  const lines = header.title ? [`**${header.title}**`, ...body] : body;
  return { header: { type: githubType(header.type), metadata: "", fold: "", title: "" }, body: lines };
}
