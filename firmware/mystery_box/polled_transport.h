#pragma once
#include <stdint.h>
// WiFiS3's connected() performs serial AT requests. Cache a healthy result for
// 500 ms so MQTT's repeated checks cannot monopolize local display/game time.
// A disconnected result is never cached; stop() always invalidates the cache.
template <class Transport>
class PolledTransport : public Transport {
  bool healthy = false;
  uint32_t checkedAt = 0;
public:
  uint8_t connected() override {
    const uint32_t now = millis();
    if (healthy && uint32_t(now - checkedAt) < 500UL) return 1;
    checkedAt = now; healthy = Transport::connected(); return healthy;
  }
  void stop() override { healthy = false; Transport::stop(); }
};
