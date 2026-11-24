/*! jsdiff — BSD 3-Clause License

Copyright (c) 2009-2015, Kevin Decker <kpdecker@gmail.com>
All rights reserved.

Redistribution and use in source and binary forms, with or without
modification, are permitted provided that the following conditions are met:

1. Redistributions of source code must retain the above copyright notice, this
   list of conditions and the following disclaimer.

2. Redistributions in binary form must reproduce the above copyright notice,
   this list of conditions and the following disclaimer in the documentation
   and/or other materials provided with the distribution.

3. Neither the name of the copyright holder nor the names of its
   contributors may be used to endorse or promote products derived from
   this software without specific prior written permission.

THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS"
AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE
IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE
DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE LIABLE
FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL
DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR
SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER
CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY,
OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE
OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
 */
import { structuredPatch, type StructuredPatchHunk } from "diff";
import { editorLines } from "../note-check-source";

export function noteChanges(before: string, current: string): StructuredPatchHunk[] {
  const normalize = (text: string): string => editorLines(text.replace(/^\uFEFF/, ""));
  const patch = structuredPatch("", "", normalize(before), normalize(current), undefined, undefined, { context: 3, timeout: 350 });
  if (!patch) throw new Error("This comparison is too large to display interactively.");
  return patch.hunks;
}

export interface DiffLine {
  line?: number;
  mark: string;
  text: string;
}

export function hunkLines(hunk: StructuredPatchHunk, side: "before" | "current"): DiffLine[] {
  let line = side === "before" ? hunk.oldStart : hunk.newStart;
  const hidden = side === "before" ? "+" : "-";
  const rows: DiffLine[] = [];
  let lastMark = "";
  for (const value of hunk.lines) {
    const mark = value.charAt(0);
    if (mark === "\\") {
      if (lastMark !== hidden) rows.push({ mark, text: value.slice(2) });
    } else {
      lastMark = mark;
      if (mark !== hidden) rows.push({ line: line++, mark, text: value.slice(1) });
    }
  }
  return rows;
}

export interface ChangedLine {
  line: number;
  kind: "added" | "modified" | "deleted";
  hunk: number;
  /** A deletion past the last current line is drawn at its lower edge. */
  atEnd?: boolean;
}

export function changedLines(hunks: StructuredPatchHunk[], lineCount: number): ChangedLine[] {
  const result: ChangedLine[] = [];
  hunks.forEach((hunk, index) => {
    let line = Math.max(1, hunk.newStart);
    const removed: string[] = [], added: string[] = [];
    const flush = (): void => {
      let start = 0, oldEnd = removed.length, newEnd = added.length;
      if (oldEnd !== newEnd) {
        // A change at EOF can include the last surviving line solely because its newline changed.
        while (start < oldEnd && start < newEnd && removed[start] === added[start]) start++;
        while (oldEnd > start && newEnd > start && removed[oldEnd - 1] === added[newEnd - 1]) { oldEnd--; newEnd--; }
      }
      for (let i = start; i < newEnd; i++) result.push({ line: line + i, kind: i < oldEnd ? "modified" : "added", hunk: index });
      if (oldEnd > newEnd) {
        const anchor = line + newEnd;
        result.push({ line: Math.min(anchor, lineCount), kind: "deleted", hunk: index, atEnd: anchor > lineCount });
      }
      line += added.length;
      removed.length = 0;
      added.length = 0;
    };
    for (const value of hunk.lines) {
      if (value.startsWith("-")) removed.push(value.slice(1));
      else if (value.startsWith("+")) added.push(value.slice(1));
      else if (value.startsWith(" ")) { flush(); line++; }
    }
    flush();
  });
  return result;
}
