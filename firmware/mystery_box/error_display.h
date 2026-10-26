#pragma once
#include <stdint.h>
#include <string.h>
namespace ErrorDisplay {
// Two stationary 5x7 glyphs, separated by two columns, fit the 12x8 matrix.
inline void draw(uint8_t code, uint8_t pixels[8][12]) {
  static const uint8_t glyphs[9][7] = {
    {31,16,16,30,16,16,31}, // E
    {4,12,4,4,4,4,14},     // 1
    {14,17,1,2,4,8,31},    // 2
    {30,1,1,14,1,1,30},    // 3
    {2,6,10,18,31,2,2},    // 4
    {31,16,16,30,1,1,30},  // 5
    {14,16,16,30,17,17,14},// 6
    {31,1,2,4,8,8,8},      // 7
    {14,17,17,14,17,17,14} // 8
  };
  memset(pixels, 0, 96);
  if (code < 1 || code > 8) return;
  for (uint8_t y = 0; y < 7; ++y) {
    for (uint8_t x = 0; x < 5; ++x) {
      pixels[y][x] = (glyphs[0][y] >> (4 - x)) & 1;
      pixels[y][x + 7] = (glyphs[code][y] >> (4 - x)) & 1;
    }
  }
}
}
