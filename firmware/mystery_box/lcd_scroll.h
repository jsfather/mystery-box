#pragma once
#include <stdint.h>
#include <string.h>
// Local animation state. Refresh packets extend the lease without resetting motion.
class LcdScroll {
  char id[81] = "", text[161] = "";
  uint32_t started = 0, received = 0, lease = 0;
  uint16_t stepMs = 300;
public:
  bool active = false;
  void stop() { active = false; id[0] = 0; }
  void set(const char* key, const char* value, uint32_t phase, uint32_t remaining, uint32_t now, uint16_t step = 300) {
    if (step < 200 || step > 1000 || step % 50) return;
    if (!active || strcmp(id, key) || strcmp(text, value)) {
      strncpy(id, key, 80); id[80] = 0;
      strncpy(text, value, 160); text[160] = 0;
      stepMs = step;
      started = now - phase;
    } else if (stepMs != step) {
      // Retain the current character and its fractional progress on a live speed change.
      const uint32_t elapsed = now - started;
      const uint32_t adjusted = (elapsed / stepMs) * step + (elapsed % stepMs) * step / stepMs;
      stepMs = step;
      started = now - adjusted;
    }
    received = now; lease = remaining; active = true;
  }
  uint32_t untilNext(uint32_t now) const {
    return active ? stepMs - uint32_t(now - started) % stepMs : 0xffffffffUL;
  }
  bool draw(uint32_t now, char out[17]) {
    if (!active || uint32_t(now - received) >= lease) { stop(); return false; }
    const unsigned length = strlen(text), cycle = length + 4;
    const unsigned pos = (uint32_t(now - started) / stepMs) % cycle;
    for (unsigned i = 0; i < 16; ++i) {
      const unsigned at = (pos + i) % cycle;
      out[i] = at < length ? text[at] : ' ';
    }
    out[16] = 0; return true;
  }
};
