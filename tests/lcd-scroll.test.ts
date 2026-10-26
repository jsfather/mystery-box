import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { render } from "../server/render.js";
import { defaults } from "../shared/model.js";

test("scroll commands fit transport limits, preserve identity and stop on cancellation or expiry", () => {
  const now = Date.parse("2026-10-26T12:00:00Z");
  const message = {
    id: "12345678-1234-1234-1234-123456789012",
    text: '"'.repeat(160),
    startsAt: now,
    expiresAt: now + 300000,
    createdAt: now,
    cancelled: false,
  };
  const frame = render(defaults, [message], now);
  assert.equal(frame.scroll?.text, message.text);
  assert.equal(frame.scroll?.phase, 0);
  assert.equal(render(defaults, [message], now + 1000).scroll?.id, frame.scroll?.id);
  assert.equal(render(defaults, [message], now + 1000).scroll?.remaining, 299000);
  assert.ok(Buffer.byteLength(JSON.stringify(frame)) <= 1280);
  assert.equal(render(defaults, [message], message.expiresAt).scroll, null);
  assert.equal(render(defaults, [{ ...message, cancelled: true }], now).scroll, null);
  assert.equal(
    render(defaults, [{ ...message, text: "A small note" }], now).scroll,
    null,
  );
});

test("Arduino scrolling ignores packet jitter, handles rollover and expires its lease", () => {
  const dir = mkdtempSync(join(tmpdir(), "mystery-scroll-"));
  try {
    writeFileSync(
      join(dir, "test.cpp"),
      `
#include <cassert>
#include <cstring>
#include "lcd_scroll.h"
#include "matrix_program.h"
int main() {
  LcdScroll scroll; char row[17];
  scroll.set("one", "ABCDEFGHIJKLMNOPQRSTUVWXYZ", 0, 5000, 0xfffffff0UL);
  assert(scroll.draw(0xfffffff0UL, row) && !strcmp(row, "ABCDEFGHIJKLMNOP"));
  assert(scroll.draw(284, row) && !strcmp(row, "BCDEFGHIJKLMNOPQ"));
  // A delayed refresh must not restart or jump the animation.
  scroll.set("one", "ABCDEFGHIJKLMNOPQRSTUVWXYZ", 0, 4000, 334);
  assert(scroll.draw(584, row) && !strcmp(row, "CDEFGHIJKLMNOPQR"));
  assert(!scroll.draw(4334, row));
  scroll.set("two", "ABCDEFGHIJKLMNOPQRSTUVWXYZ", 900, 1000, 5000);
  assert(scroll.draw(5000, row) && !strcmp(row, "DEFGHIJKLMNOPQRS"));
  scroll.stop(); assert(!scroll.draw(5001, row));
  // Error sequences fit the dedicated buffer (with a guard against overflow).
  struct { uint32_t frames[42][4]; uint32_t guard; } out;
  out.guard = 0x12345678;
  for (char code = '1'; code <= '8'; ++code) {
    char text[] = {'E', code, 0};
    assert(MatrixProgram::build("text", 7, text, nullptr, 0, out.frames) == 42);
    assert(out.guard == 0x12345678);
  }
}`,
    );
    execFileSync("c++", [
      "-std=c++11",
      "-I",
      resolve("firmware/mystery_box"),
      join(dir, "test.cpp"),
      "-o",
      join(dir, "test"),
    ]);
    execFileSync(join(dir, "test"));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
