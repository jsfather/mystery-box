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
#include "error_display.h"
uint32_t fakeNow = 0;
uint32_t millis() { return fakeNow; }
class FakeTransport {
public:
  int checks = 0; bool socketAlive = true;
  virtual uint8_t connected() { ++checks; return socketAlive; }
  virtual void stop() { socketAlive = false; }
};
#include "polled_transport.h"
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
  scroll.set("fast", "ABCDEFGHIJKLMNOPQRSTUVWXYZ", 0, 5000, 0, 200);
  assert(scroll.untilNext(190) == 10);
  assert(scroll.draw(200, row) && !strcmp(row, "BCDEFGHIJKLMNOPQ"));
  PolledTransport<FakeTransport> transport;
  fakeNow = 0xfffffff0UL; assert(transport.connected());
  for (int i = 0; i < 100; ++i) assert(transport.connected());
  assert(transport.checks == 1);
  fakeNow = 484; transport.socketAlive = false;
  assert(!transport.connected()); assert(transport.checks == 2);
  transport.socketAlive = true; assert(transport.connected());
  transport.stop(); assert(!transport.connected());
  // All fixed error codes fit the matrix, retain the E prefix, and differ.
  struct { uint8_t pixels[8][12]; uint32_t guard; } out;
  uint8_t previous[8][12] = {};
  out.guard = 0x12345678;
  const uint8_t prefix[] = {31,16,16,30,16,16,31};
  for (uint8_t code = 1; code <= 8; ++code) {
    ErrorDisplay::draw(code, out.pixels);
    assert(out.guard == 0x12345678);
    if (code > 1) assert(memcmp(previous, out.pixels, 96) != 0);
    memcpy(previous, out.pixels, 96);
    for (int y = 0; y < 8; ++y) for (int x = 0; x < 12; ++x) {
      assert(out.pixels[y][x] <= 1);
      if (y == 7 || x == 5 || x == 6) assert(out.pixels[y][x] == 0);
      else if (x < 5) assert(out.pixels[y][x] == ((prefix[y] >> (4-x)) & 1));
    }
  }
  ErrorDisplay::draw(0, out.pixels);
  for (auto& row : out.pixels) for (auto pixel : row) assert(pixel == 0);

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
