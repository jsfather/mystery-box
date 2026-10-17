#pragma once
#include <stdint.h>

namespace Heartbeat {
inline uint8_t stage(uint64_t now, uint8_t speed) {
  const uint32_t period = 60000UL / (50 + speed * 6);
  const uint32_t phase = (now % period) * 1000 / period;
  if (phase < 80) return 1;
  if (phase < 180) return 2;
  if (phase < 250) return 1;
  if (phase < 330) return 0;
  if (phase < 430) return 1;
  return 0;
}
inline void draw(uint8_t pixels[8][12], uint8_t phase) {
  const char* small[] = {"010010","111111","111111","011110","001100"};
  const char* medium[] = {"01100110","11111111","11111111","01111110","00111100","00011000"};
  const char* large[] = {"0011001100","0111111110","1111111111","1111111111","0111111110","0011111100","0001111000","0000110000"};
  const char** shape = phase == 2 ? large : (phase == 1 ? medium : small);
  const int width = phase == 2 ? 10 : (phase == 1 ? 8 : 6);
  const int height = phase == 2 ? 8 : (phase == 1 ? 6 : 5);
  const int left = (12 - width) / 2, top = (8 - height) / 2;
  for (int y = 0; y < 8; ++y)
    for (int x = 0; x < 12; ++x)
      pixels[y][x] = x >= left && x < left + width && y >= top && y < top + height
        ? shape[y - top][x - left] == '1' : 0;
}
inline void sequence(uint32_t frames[6][4], uint8_t speed) {
  const uint8_t stages[] = {1, 2, 1, 0, 1, 0};
  const uint16_t durations[] = {80, 100, 70, 80, 100};
  const uint32_t period = 60000UL / (50 + speed * 6);
  uint32_t used = 0;
  for (int f = 0; f < 6; ++f) {
    uint8_t pixels[8][12];
    draw(pixels, stages[f]);
    for (int word = 0; word < 3; ++word) {
      frames[f][word] = 0;
      for (int bit = 0; bit < 32; ++bit) {
        const int i = word * 32 + bit;
        frames[f][word] = (frames[f][word] << 1) | pixels[i / 12][i % 12];
      }
    }
    frames[f][3] = f == 5 ? period - used : period * durations[f] / 1000;
    used += frames[f][3];
  }
}
}
