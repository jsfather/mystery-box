#pragma once
#include <stdint.h>
#include <string.h>
// The board owns the simulation. Network commands never advance game time.
class SnakeGame {
  uint8_t body[96], length = 3, food = 0, dir = 1, turns[2], queued = 0;
  uint32_t steppedAt = 0, randomState = 1;
  uint32_t random() { randomState ^= randomState << 13; randomState ^= randomState >> 17; randomState ^= randomState << 5; return randomState; }
  bool occupied(uint8_t cell, uint8_t count) const {
    for (uint8_t i = 0; i < count; ++i) if (body[i] == cell) return true;
    return false;
  }
  void placeFood() {
    uint8_t free = 96 - length;
    if (!free) { status = Won; return; }
    uint8_t choice = random() % free;
    for (uint8_t cell = 0; cell < 96; ++cell)
      if (!occupied(cell, length) && choice-- == 0) { food = cell; return; }
  }
public:
  enum Status { Idle, Playing, Paused, Over, Won };
  Status status = Idle;
  uint32_t revision = 0;
  uint16_t interval() const { const int speed = 280 - score() * 6; return speed < 140 ? 140 : speed; }
  uint8_t score() const { return length - 3; }
  uint8_t head() const { return body[0]; }
  uint8_t apple() const { return food; }
  uint8_t direction() const { return dir; }
  const char* label() const {
    const char* names[] = {"idle", "playing", "paused", "over", "won"}; return names[status];
  }
  void start(uint32_t now, uint32_t seed) {
    length = 3; body[0] = 40; body[1] = 39; body[2] = 38;
    dir = 1; queued = 0; steppedAt = now; randomState = seed ? seed : 1;
    status = Playing; placeFood(); ++revision;
  }
  void stop() { status = Idle; queued = 0; ++revision; }
  void pause() { if (status == Playing) { status = Paused; queued = 0; ++revision; } }
  void resume(uint32_t now) { if (status == Paused) { status = Playing; steppedAt = now; ++revision; } }
  bool turn(uint8_t next) {
    if (status != Playing || next > 3 || queued == 2) return false;
    const uint8_t previous = queued ? turns[queued - 1] : dir;
    if (next == previous || next == (previous + 2) % 4) return false;
    turns[queued++] = next; return true;
  }
  bool tick(uint32_t now) {
    if (status != Playing || uint32_t(now - steppedAt) < interval()) return false;
    // Never catch up in a lethal burst after a delayed network operation.
    steppedAt = now;
    if (queued) { dir = turns[0]; turns[0] = turns[1]; --queued; }
    const int x = body[0] % 12 + (dir == 1 ? 1 : dir == 3 ? -1 : 0);
    const int y = body[0] / 12 + (dir == 2 ? 1 : dir == 0 ? -1 : 0);
    if (x < 0 || x >= 12 || y < 0 || y >= 8) { status = Over; ++revision; return true; }
    const uint8_t next = y * 12 + x;
    const bool eating = next == food;
    // Moving into the vacated tail is legal unless this move grows the snake.
    if (occupied(next, length - (eating ? 0 : 1))) { status = Over; ++revision; return true; }
    if (eating) ++length;
    for (int i = length - 1; i > 0; --i) body[i] = body[i - 1];
    body[0] = next;
    if (eating) placeFood();
    ++revision; return true;
  }
  void pixels(uint8_t out[8][12]) const {
    memset(out, 0, 96);
    if (status == Idle) return;
    for (uint8_t i = 0; i < length; ++i) out[body[i] / 12][body[i] % 12] = 1;
    if (status != Won) out[food / 12][food % 12] = 1;
  }
};
