#pragma once
#include <stdint.h>
#include <string.h>
class MessageAlert {
  char lastId[81] = "";
  uint32_t started = 0;
public:
  bool active = false;
  void cancel() { active = false; }
  void accept(const char* id, bool enabled, uint32_t age, uint32_t now) {
    if (!enabled || !id[0]) cancel();
    if (!id[0] || !strcmp(lastId, id)) return;
    strncpy(lastId, id, 80); lastId[80] = 0;
    // Do not re-alert old messages when reconnecting or restarting mid-window.
    if (enabled && age < 4000UL) { started = now; active = true; }
  }
  bool update(uint32_t now) {
    if (active && uint32_t(now - started) >= 3000UL) active = false;
    return active;
  }
  bool bright(uint32_t now) const { return (uint32_t(now - started) / 250) % 2 == 0; }
};
