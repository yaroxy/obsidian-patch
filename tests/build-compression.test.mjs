import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { gunzipSync } from "node:zlib";
import test from "node:test";
import { compressBuildData } from "../scripts/lib/build-compression.mjs";

const require = createRequire(import.meta.url);

test("embedded build data has stable gzip bytes regardless of the build date", t => {
  const input = Buffer.from('{"prefix":"demo","icons":{"coffee":{"body":"<path d=\\"M2 2h8v8H2z\\"/>"}},"label":"京都 ☕"}\n'.repeat(64));
  t.mock.timers.enable({ apis: ["Date"], now: new Date("2024-01-01T00:00:00Z") });
  for (const date of ["2024-01-01T00:00:00Z", "2040-07-01T12:34:56Z"]) {
    t.mock.timers.setTime(new Date(date).getTime());
    const compressed = compressBuildData(input);
    assert.ok(Buffer.isBuffer(compressed));
    // Locked-format fixture: fflate 0.8.3, level 9, zero timestamp, checked with native gunzip.
    assert.equal(createHash("sha256").update(compressed).digest("hex"), "5154b58d849c7a8182341e0fdb4870f6c171ca3376152e9c13447c86cbe1958c");
  }
});

for (const pack of ["logos", "material-icon-theme"]) {
  test(`${pack} icon data survives native gunzip and Web DecompressionStream byte for byte`, async () => {
    const input = readFileSync(require.resolve(`@iconify-json/${pack}/icons.json`));
    const compressed = compressBuildData(input);
    assert.deepEqual(gunzipSync(compressed), input);
    const decoded = await new Response(new Blob([compressed]).stream().pipeThrough(new DecompressionStream("gzip"))).arrayBuffer();
    assert.deepEqual(Buffer.from(decoded), input);
  });
}
