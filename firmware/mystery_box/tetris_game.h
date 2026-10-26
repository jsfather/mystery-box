#pragma once
#include <stdint.h>
#include <string.h>
// Mini Tetris uses the matrix's native 12-column, 8-row orientation.
class TetrisGame {
  uint16_t rows[8] = {}, fallMs = 900;
  uint8_t bag[7], bagAt = 7, type = 0, rotation = 0;
  int8_t x = 4, y = 0;
  uint32_t randomState = 1, fallenAt = 0, points = 0, clearedLines = 0;
  uint32_t random() { randomState ^= randomState << 13; randomState ^= randomState >> 17; randomState ^= randomState << 5; return randomState; }
  uint16_t shape(uint8_t turn) const {
    static const uint8_t cells[7][4][2] = {
      {{0,1},{1,1},{2,1},{3,1}}, // I
      {{1,0},{2,0},{1,1},{2,1}}, // O
      {{1,0},{0,1},{1,1},{2,1}}, // T
      {{0,0},{0,1},{1,1},{2,1}}, // J
      {{2,0},{0,1},{1,1},{2,1}}, // L
      {{1,0},{2,0},{0,1},{1,1}}, // S
      {{0,0},{1,0},{1,1},{2,1}}  // Z
    };
    uint16_t mask = 0;
    for (uint8_t i = 0; i < 4; ++i) {
      uint8_t cx = cells[type][i][0], cy = cells[type][i][1];
      if (type != 1) for (uint8_t r = 0; r < turn; ++r) { const uint8_t next = (type == 0 ? 3 : 2) - cy; cy = cx; cx = next; }
      mask |= uint16_t(1) << (cy * 4 + cx);
    }
    return mask;
  }
  bool fits(int8_t left, int8_t top, uint8_t turn) const {
    const uint16_t mask = shape(turn);
    for (uint8_t bit = 0; bit < 16; ++bit) if (mask & (uint16_t(1) << bit)) {
      const int cx = left + bit % 4, cy = top + bit / 4;
      if (cx < 0 || cx >= 12 || cy >= 8 || (cy >= 0 && (rows[cy] & (1U << cx)))) return false;
    }
    return true;
  }
  void spawn() {
    if (bagAt == 7) {
      for (uint8_t i = 0; i < 7; ++i) bag[i] = i;
      for (uint8_t i = 6; i > 0; --i) { const uint8_t at = random() % (i + 1); const uint8_t old = bag[i]; bag[i] = bag[at]; bag[at] = old; }
      bagAt = 0;
    }
    type = bag[bagAt++]; rotation = 0; x = 4; y = 0;
    if (!fits(x, y, rotation)) status = Over;
  }
  void lock() {
    const uint16_t mask = shape(rotation);
    for (uint8_t bit = 0; bit < 16; ++bit) if ((mask & (1U << bit)) && y + bit / 4 < 0) { status = Over; ++revision; return; }
    for (uint8_t bit = 0; bit < 16; ++bit) if (mask & (1U << bit)) rows[y + bit / 4] |= 1U << (x + bit % 4);
    const uint8_t count = clearRows(rows);
    static const uint16_t rewards[] = {0,100,300,500,800};
    points += rewards[count <= 4 ? count : 4]; clearedLines += count;
    spawn(); ++revision;
  }
  void down(bool manual) {
    if (fits(x, y + 1, rotation)) { ++y; if (manual) ++points; ++revision; }
    else lock();
  }
public:
  enum Status { Idle, Ready, Playing, Paused, Over };
  Status status = Idle;
  uint32_t revision = 0;
  static uint8_t clearRows(uint16_t board[8]) {
    uint8_t count = 0;
    for (int row = 7; row >= 0; --row) if (board[row] == 0xfff) {
      for (int above = row; above > 0; --above) board[above] = board[above - 1];
      board[0] = 0; ++count; ++row;
    }
    return count;
  }
  uint16_t interval() const { return fallMs; }
  uint32_t score() const { return points; }
  uint32_t lines() const { return clearedLines; }
  uint8_t piece() const { return type; }
  const char* label() const { const char* labels[] = {"idle", "ready", "playing", "paused", "over"}; return labels[status]; }
  void start(uint32_t now, uint32_t seed, uint16_t speed = 900) {
    memset(rows, 0, sizeof(rows)); points = clearedLines = 0; bagAt = 7;
    randomState = seed ? seed : 1; fallMs = speed >= 300 && speed <= 1500 && speed % 100 == 0 ? speed : 900;
    fallenAt = now; status = Ready; spawn(); ++revision;
  }
  void stop() { status = Idle; ++revision; }
  void pause() { if (status == Playing) { status = Paused; ++revision; } }
  void resume(uint32_t now) { if (status == Paused) { status = Playing; fallenAt = now; ++revision; } }
  void configure(uint16_t speed, uint32_t now) {
    if (speed < 300 || speed > 1500 || speed % 100) return;
    fallMs = speed; fallenAt = now; ++revision;
  }
  bool control(uint8_t direction, uint32_t now) {
    if (direction > 3 || (status != Ready && status != Playing)) return false;
    if (status == Ready) { status = Playing; fallenAt = now; ++revision; }
    if (direction == 2) { down(true); fallenAt = now; return true; }
    if (direction == 0) {
      const uint8_t next = (rotation + 1) % 4;
      const int8_t kicks[] = {0,-1,1,-2,2};
      for (uint8_t i = 0; i < 5; ++i) if (fits(x + kicks[i], y, next)) { x += kicks[i]; rotation = next; ++revision; return true; }
      return false;
    }
    const int8_t nextX = x + (direction == 1 ? 1 : -1);
    if (!fits(nextX, y, rotation)) return false;
    x = nextX; ++revision; return true;
  }
  bool drop(uint32_t now) {
    if (status != Ready && status != Playing) return false;
    if (status == Ready) status = Playing;
    while (fits(x, y + 1, rotation)) { ++y; points += 2; }
    fallenAt = now; lock(); return true;
  }
  bool tick(uint32_t now) {
    if (status != Playing || uint32_t(now - fallenAt) < fallMs) return false;
    fallenAt = now; down(false); return true;
  }
  void activePixels(uint8_t out[8][12]) const {
    memset(out, 0, 96); if (status == Idle) return;
    const uint16_t mask = shape(rotation);
    for (uint8_t bit = 0; bit < 16; ++bit) if (mask & (1U << bit)) {
      const int cx = x + bit % 4, cy = y + bit / 4;
      if (cx >= 0 && cx < 12 && cy >= 0 && cy < 8) out[cy][cx] = 1;
    }
  }
  void pixels(uint8_t out[8][12]) const {
    activePixels(out); if (status == Idle) return;
    for (uint8_t row = 0; row < 8; ++row) for (uint8_t col = 0; col < 12; ++col) if (rows[row] & (1U << col)) out[row][col] = 1;
  }
};
