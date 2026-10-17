#pragma once
#include <stdint.h>

class SteadyClock {
  uint64_t timeMs = 0;
  uint32_t last = 0, sampledAt = 0;
  int64_t correction = 0;
  uint32_t slewRemainder = 0;
public:
  bool ready = false;
  uint64_t now(uint32_t monotonic) {
    const uint32_t delta = monotonic - last;
    const uint64_t budget = (uint64_t)delta + slewRemainder;
    const int64_t limit = budget / 50;
    slewRemainder = budget % 50;
    const int64_t adjustment = correction < -limit ? -limit : (correction > limit ? limit : correction);
    timeMs += (int64_t)delta + adjustment;
    correction -= adjustment;
    last = monotonic;
    return timeMs;
  }
  void sample(uint64_t serverTime, uint32_t monotonic) {
    if (!ready) {
      timeMs = serverTime;
      last = sampledAt = monotonic;
      ready = true;
    } else if ((uint32_t)(monotonic - sampledAt) >= 60000UL) {
      now(monotonic);
      correction = (int64_t)serverTime - (int64_t)timeMs;
      sampledAt = monotonic;
    }
  }
};
