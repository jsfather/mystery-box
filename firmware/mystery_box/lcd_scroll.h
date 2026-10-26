#pragma once
#include <stdint.h>
#include <string.h>
// Local animation state. Refresh packets extend the lease without resetting motion.
class LcdScroll {
  char id[81] = "", text[161] = "";
  uint32_t started = 0, received = 0, lease = 0;
public:
  bool active = false;
  void stop() { active = false; id[0] = 0; }
  void set(const char* key, const char* value, uint32_t phase, uint32_t remaining, uint32_t now) {
    if (!active || strcmp(id, key) || strcmp(text, value)) {
      strncpy(id, key, 80); id[80] = 0;
      strncpy(text, value, 160); text[160] = 0;
      started = now - phase;
    }
    received = now; lease = remaining; active = true;
  }
  bool draw(uint32_t now, char out[17]) {
    if (!active || uint32_t(now - received) >= lease) { stop(); return false; }
    const unsigned length = strlen(text), cycle = length + 4;
    const unsigned pos = (uint32_t(now - started) / 300) % cycle;
    for (unsigned i = 0; i < 16; ++i) {
      const unsigned at = (pos + i) % cycle;
      out[i] = at < length ? text[at] : ' ';
    }
    out[16] = 0; return true;
  }
};
