import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import {
  matrixModes,
  matrixCatalog,
  presetModes,
  matrixFrame,
  matrixFrameCount,
  matrixInterval,
  matrixProgram,
  matrixNeedsStream,
  encodePixels,
  presetPixels,
} from "../shared/matrix.js";
import { defaults, settingsSchema } from "../shared/model.js";
import { generatedMatrixHeader } from "../scripts/generate-matrix.js";

test("all 24 expressions are selectable and every preset animates with bounded binary frames", () => {
  assert.equal(matrixModes.length, 24);
  assert.deepEqual([...matrixCatalog.map((m) => m.id)].sort(), [...matrixModes].sort());
  for (const mode of matrixModes)
    assert.ok(
      settingsSchema.safeParse({ ...defaults, matrix: { ...defaults.matrix, mode } })
        .success,
    );
  for (const mode of presetModes) {
    const frames = Array.from({ length: 64 }, (_, f) =>
      encodePixels(presetPixels(mode, f)),
    );
    assert.ok(new Set(frames).size >= 2, mode);
    for (const f of frames) assert.match(f, /^[0-9a-f]{24}$/);
    assert.equal(
      encodePixels(presetPixels(mode, 0)),
      encodePixels(presetPixels(mode, 64)),
    );
  }
});

test("program payload fits the broker and device limits; irrelevant fields do not restart playback", () => {
  const custom = {
    ...defaults.matrix,
    mode: "custom" as const,
    frames: Array(32).fill("ffffffffffffffffffffffff"),
    text: '"'.repeat(80),
    speed: 10,
  };
  const p = matrixProgram(custom);
  assert.equal(matrixNeedsStream(custom), true);
  assert.equal(matrixNeedsStream(custom, p.revision), false);
  assert.equal(matrixNeedsStream({ ...custom, speed: 9 }, p.revision), true);
  assert.ok(Buffer.byteLength(JSON.stringify(p)) <= 1024);
  assert.equal(matrixProgram({ ...custom, text: "ignored" }).revision, p.revision);
  assert.notEqual(matrixProgram({ ...custom, speed: 9 }).revision, p.revision);
  assert.equal(matrixFrameCount({ ...custom, mode: "text" }), 510);
  assert.equal(matrixInterval({ ...custom, mode: "wave" }), 40);
});

test("device presets, all text frames and custom sequences exactly match the preview", () => {
  assert.equal(
    readFileSync("firmware/mystery_box/matrix_program.h", "utf8"),
    generatedMatrixHeader(),
  );
  const dir = mkdtempSync(join(tmpdir(), "matrix-program-"));
  const text = "Mixed case!? " + "A".repeat(67);
  assert.equal(text.length, 80);
  try {
    writeFileSync(
      join(dir, "check.cpp"),
      `
#include <cstdio>
#include <cassert>
#include "matrix_program.h"
uint32_t frames[512][4];
void dump(const char* mode, const char* text, const char* const* custom, int count) {
  auto n=MatrixProgram::build(mode,5,text,custom,count,frames);
  assert(n>0&&n<=512);
  for(int f=0;f<n;f++)printf("%08x%08x%08x\\n",frames[f][0],frames[f][1],frames[f][2]);
}
int main(){
  for(auto mode:MatrixProgram::names)dump(mode,"",nullptr,0);
  dump("text",${JSON.stringify(text)},nullptr,0);
  const char* custom[]={"800000000000000000000001","ffffffffffffffffffffffff"};
  dump("custom","",custom,2);
  dump("off","",nullptr,0);
}`,
    );
    execFileSync("c++", [
      "-std=c++11",
      "-I",
      resolve("firmware/mystery_box"),
      join(dir, "check.cpp"),
      "-o",
      join(dir, "check"),
    ]);
    const actual = execFileSync(join(dir, "check"), { encoding: "utf8" })
      .trim()
      .split("\n");
    const expected: string[] = [];
    for (const mode of presetModes)
      for (let f = 0; f < 64; f++) expected.push(encodePixels(presetPixels(mode, f)));
    const s = { ...defaults.matrix, mode: "text" as const, text };
    for (let f = 0; f < matrixFrameCount(s); f++)
      expected.push(matrixFrame(s, f * matrixInterval(s)));
    expected.push("800000000000000000000001", "ffffffffffffffffffffffff", "0".repeat(24));
    assert.deepEqual(actual, expected);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
