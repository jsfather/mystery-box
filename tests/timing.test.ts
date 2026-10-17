import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { SteadyClock } from "../shared/steady-clock.js";
import { heartbeatPixels, heartStage } from "../shared/heartbeat.js";

test("clock advances evenly despite delayed/bunched samples and slews corrections", () => {
  const clock = new SteadyClock();
  clock.sample(1700000000000, 0);
  for (let t = 0; t <= 60000; t += 100) {
    // Simulate replaying old network samples followed by a newer one.
    clock.sample(1700000000000 + Math.max(0, t - 5000), t);
    assert.equal(clock.now(t), 1700000000000 + t);
  }
  const before = clock.now(60000);
  assert.equal(clock.now(61000) - before, 980); // correction cannot jump backwards
  const fast = new SteadyClock();
  fast.sample(1700000000000, 0);
  fast.sample(1700000070000, 60000);
  assert.equal(fast.now(61000), 1700000061020); // no ten-second catch-up burst
});

test("heart keeps its lobes and tip through two distinct pulses then a longer rest", () => {
  const stages = [0, 100, 160, 210, 280, 525].map((p) => heartStage(p, 5));
  assert.deepEqual(stages, [1, 2, 1, 0, 1, 0]); // 80bpm = 750ms period
  for (const t of [100, 160, 210]) {
    const p = heartbeatPixels(t, 5);
    const rows = Array.from({ length: 8 }, (_, y) => p.slice(y * 12, y * 12 + 12));
    const occupied = rows.filter((row) => row.some(Boolean));
    const top = occupied[0];
    assert.equal(top[5], 0);
    assert.equal(top[6], 0);
    assert.ok(top.slice(0, 5).some(Boolean) && top.slice(7).some(Boolean));
    assert.equal(
      occupied.at(-1)!.reduce((a, b) => a + b, 0),
      2,
    );
  }
});

test("firmware clock survives millis rollover, and its pulse shapes match the preview", () => {
  const dir = mkdtempSync(join(tmpdir(), "mystery-box-timing-"));
  try {
    const header = resolve("firmware/mystery_box");
    writeFileSync(
      join(dir, "check.cpp"),
      `
#include <cassert>
#include <cstdio>
#include "steady_clock.h"
#include "heartbeat.h"
#include "calendar_counter.h"
int main() {
  SteadyClock clock;
  clock.sample(1700000000000ULL, 0xfffffff0UL);
  assert(clock.now(984) == 1700000001000ULL);
  clock.sample(1700000070000ULL, 59984);
  auto before = clock.now(59984);
  for (uint32_t t = 59985; t <= 60984; ++t) clock.now(t);
  assert(clock.now(60984) - before == 1020);
  clock.sample(1700000100000ULL, 119984);
  before = clock.now(119984);
  assert(clock.now(120984) - before == 980);
  char date[17];
  StoryCalendar::format(date, sizeof(date), 1696119480LL, 1792196280LL);
  printf("%s\\n", date);
  for (int speed = 1; speed <= 10; ++speed) {
    uint32_t frames[6][4];
    Heartbeat::sequence(frames, speed);
    uint32_t total = 0;
    const uint8_t stages[] = {1,2,1,0,1,0};
    for (int f = 0; f < 6; ++f) {
      total += frames[f][3];
      assert(frames[f][3] > 0);
      uint8_t pixels[8][12];
      Heartbeat::draw(pixels, stages[f]);
      for (int i = 0; i < 96; ++i)
        assert(((frames[f][i / 32] >> (31 - i % 32)) & 1) == pixels[i / 12][i % 12]);
    }
    assert(total == 60000UL / (50 + speed * 6));
    for (int t = 0; t < 1200; t += 25) {
      uint8_t p[8][12];
      Heartbeat::draw(p, Heartbeat::stage(t, speed));
      for (int y = 0; y < 8; ++y) for (int x = 0; x < 12; ++x) printf("%d",p[y][x]);
      printf("\\n");
    }
  }
}`,
    );
    execFileSync("c++", [
      "-std=c++11",
      "-I",
      header,
      join(dir, "check.cpp"),
      "-o",
      join(dir, "check"),
    ]);
    const lines = execFileSync(join(dir, "check"), { encoding: "utf8" })
      .trim()
      .split("\n");
    assert.equal(lines.shift(), "3y 0m 16d");
    let i = 0;
    for (let speed = 1; speed <= 10; speed++)
      for (let t = 0; t < 1200; t += 25)
        assert.equal(lines[i++], heartbeatPixels(t, speed).join(""));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
