/* Mystery Box — UNO R4 WiFi + HD44780 1602 I2C LCD.
   Install: PubSubClient (Nick O'Leary), ArduinoJson 7 (Benoit Blanchon),
   hd44780 (Bill Perry). WiFiS3, RTC and Arduino_LED_Matrix ship with the board.
   Copy arduino_secrets.h.example to arduino_secrets.h before compiling.
*/
#include <WiFiS3.h>
#include <PubSubClient.h>
#include <ArduinoJson.h>
#include <Wire.h>
#include <hd44780.h>
#include <hd44780ioClass/hd44780_I2Cexp.h>
#include <Arduino_LED_Matrix.h>
#include <RTC.h>
#include "arduino_secrets.h"
#include "calendar_counter.h"

#if MQTT_TLS
WiFiSSLClient transport;
#else
WiFiClient transport;
#endif
PubSubClient mqtt(transport);
hd44780_I2Cexp lcd;  // Autodetect backpack address and pin mapping.
ArduinoLEDMatrix matrix;
const char FRAME_TOPIC[] = "mystery-box/" DEVICE_ID "/frame";
const char STATUS_TOPIC[] = "mystery-box/" DEVICE_ID "/status";
const char HELLO_TOPIC[] = "mystery-box/" DEVICE_ID "/hello";
uint32_t lastFrameAt = 0, lastSyncAt = 0, lastTelemetryAt = 0;
uint32_t nextAttempt = 0, retryMs = 1000, lastSeq = 0, lastOfflineDraw = 0;
int32_t utcOffset = 0, cachedDateKey = 0;
bool synced = false, lcdReady = false, lightOn = true;
bool hour12 = false, showSeconds = true, loveEnabled = false;
uint32_t loveSince = 0;
uint8_t loveFormat = 0;
int64_t loveStartWall = 0;
int32_t loveOffset = 0;
char loveTitle[17] = "YOU & ME <3";
char displayed[2][17] = {{0}, {0}}, cachedDate[17] = "Waiting for time";
uint8_t pixels[8][12] = {{0}};

// Signed deadline comparison and unsigned elapsed times survive millis() rollover.
bool due(uint32_t now, uint32_t deadline) {
  return (int32_t)(now - deadline) >= 0;
}

void row(uint8_t index, const char* text) {
  char padded[17];
  memset(padded, ' ', 16);
  padded[16] = '\0';
  size_t n = strlen(text);
  if (n > 16) n = 16;
  memcpy(padded, text, n);
  // Write only changed rows: no lcd.clear() flicker in the main loop.
  if (lcdReady && memcmp(displayed[index], padded, 16) != 0) {
    lcd.setCursor(0, index);
    lcd.print(padded);
    memcpy(displayed[index], padded, 17);
  }
}

void centered(uint8_t index, const char* text) {
  char padded[17];
  memset(padded, ' ', 16);
  padded[16] = '\0';
  size_t n = strlen(text);
  if (n > 16) n = 16;
  memcpy(padded + (16 - n) / 2, text, n);
  row(index, padded);
}

int hexValue(char c) {
  if (c >= '0' && c <= '9') return c - '0';
  if (c >= 'a' && c <= 'f') return c - 'a' + 10;
  if (c >= 'A' && c <= 'F') return c - 'A' + 10;
  return -1;
}

bool lcdLine(const char* text) {
  if (!text || strlen(text) != 16) return false;
  for (uint8_t i = 0; i < 16; i++) {
    if (text[i] < 32 || text[i] > 126) return false;
  }
  return true;
}

void received(char* topic, byte* payload, unsigned int length) {
  if (strcmp(topic, FRAME_TOPIC) != 0 || length > 768) return;
  JsonDocument doc;
  if (deserializeJson(doc, payload, length) || doc["v"].as<int>() != 1) return;
  const char* a = doc["line1"] | "";
  const char* b = doc["line2"] | "";
  const char* hex = doc["matrix"] | "";
  if (!lcdLine(a) || !lcdLine(b) || strlen(hex) != 24 ||
      !doc["epoch"].is<uint32_t>() || !doc["offset"].is<int32_t>() ||
      !doc["dateKey"].is<int32_t>()) return;
  for (uint8_t i = 0; i < 24; i++) {
    if (hexValue(hex[i]) < 0) return;
  }
  const uint32_t now = millis(), epoch = doc["epoch"].as<uint32_t>();
  const int32_t offset = doc["offset"].as<int32_t>();
  if (epoch < 1700000000UL || epoch > 4102444800UL ||
      offset < -50400 || offset > 50400) return;

  if (!synced || now - lastSyncAt >= 60000UL) {
    RTCTime t((time_t)epoch);
    if (RTC.setTime(t)) {
      lastSyncAt = now;
      synced = true;
    }
  }
  const char* title = doc["loveTitle"] | "YOU & ME <3";
  if (strlen(title) < 1 || strlen(title) > 16) return;
  for (size_t i = 0; i < strlen(title); i++) {
    if (title[i] < 32 || title[i] > 126) return;
  }
  loveEnabled = (doc["loveEnabled"] | false) && doc["loveSince"].is<uint32_t>();
  loveSince = doc["loveSince"] | 0UL;
  loveFormat = doc["loveFormat"] | 0;
  if (loveFormat > 6) loveFormat = 0;
  loveStartWall = doc["loveStartWall"] | (int64_t)loveSince;
  loveOffset = doc["loveOffset"] | 0;
  if (loveOffset < -50400 || loveOffset > 50400) loveOffset = 0;
  if (loveSince > epoch) loveEnabled = false;
  strncpy(loveTitle, title, 16);
  loveTitle[16] = '\0';
  utcOffset = offset;
  hour12 = doc["hour12"] | false;
  showSeconds = doc["seconds"] | true;
  if (doc["clock"] | false) {
    memcpy(cachedDate, b, 17);
    cachedDateKey = doc["dateKey"].as<int32_t>();
  }
  const bool light = doc["backlight"] | true;
  if (lightOn != light) {
    lightOn = light;
    if (lcdReady) {
      if (light) lcd.backlight();
      else lcd.noBacklight();
    }
  }
  row(0, a);
  row(1, b);
  for (uint8_t i = 0; i < 96; i++) {
    pixels[i / 12][i % 12] = (hexValue(hex[i / 4]) >> (3 - i % 4)) & 1;
  }
  matrix.renderBitmap(pixels, 8, 12);
  lastSeq = doc["seq"] | 0UL;
  lastFrameAt = now;
}

void telemetry() {
  JsonDocument doc;
  doc["online"] = true;
  doc["rssi"] = WiFi.RSSI();
  doc["ip"] = WiFi.localIP().toString();
  doc["firmware"] = "1.1.0";
  doc["seq"] = lastSeq;
  char buffer[224];
  serializeJson(doc, buffer, sizeof(buffer));
  mqtt.publish(STATUS_TOPIC, buffer, false);
  lastTelemetryAt = millis();
}

void offlineClock() {
  if (!synced) return;
  RTCTime t;
  if (!RTC.getTime(t)) return;
  const int64_t utc = (int64_t)t.getUnixTime();
  if (loveEnabled) {
    const uint32_t elapsed = utc > loveSince ? (uint32_t)(utc - loveSince) : 0;
    char dedication[17], counter[17];
    memset(dedication, ' ', 16);
    dedication[16] = '\0';
    const size_t n = strlen(loveTitle);
    memcpy(dedication + (16 - n) / 2, loveTitle, n);
    dedication[15] = '*';
    uint8_t format = loveFormat;
    if (format == 5) {
      const uint8_t formats[] = {0, 1, 3, 4};
      format = formats[(utc / 10) % 4];
    }
    const unsigned long days = elapsed / 86400UL;
    const unsigned int h = (elapsed / 3600UL) % 24;
    const unsigned int m = (elapsed / 60UL) % 60;
    const unsigned int sec = elapsed % 60;
    switch (format) {
      case 1:
        if (elapsed <= 99999999UL) snprintf(counter, sizeof(counter), "%lu seconds", (unsigned long)elapsed);
        else snprintf(counter, sizeof(counter), "%lus", (unsigned long)elapsed);
        break;
      case 2: snprintf(counter, sizeof(counter), "%lu days of us", days); break;
      case 3: snprintf(counter, sizeof(counter), "%luw %lud %02u:%02u", days / 7, days % 7, h, m); break;
      case 4: snprintf(counter, sizeof(counter), "%luh %02um %02us", (unsigned long)(elapsed / 3600UL), m, sec); break;
      case 6: StoryCalendar::format(counter, sizeof(counter), loveStartWall, utc + loveOffset); break;
      default: snprintf(counter, sizeof(counter), "%lud %02u:%02u:%02u", days, h, m, sec); break;
    }
    row(0, dedication);
    centered(1, counter);
    return;
  }
  const int64_t local = utc + utcOffset;
  const uint32_t daySeconds = (uint32_t)((local % 86400 + 86400) % 86400);
  const int h = daySeconds / 3600, m = (daySeconds / 60) % 60, s = daySeconds % 60;
  const int displayHour = hour12 ? (h % 12 ? h % 12 : 12) : h;
  char text[17], clockText[14];
  if (showSeconds) {
    snprintf(clockText, sizeof(clockText), "%02d:%02d:%02d", displayHour, m, s);
  } else {
    snprintf(clockText, sizeof(clockText), "%02d:%02d", displayHour, m);
  }
  snprintf(text, sizeof(text), "%s%s", clockText, hour12 ? (h < 12 ? " AM" : " PM") : "");
  centered(0, text);
  // Calendar rules belong to the server. Never display yesterday's cached date.
  if (local / 86400 == cachedDateKey) {
    char date[17];
    memcpy(date, cachedDate, 17);
    date[15] = '*';
    row(1, date);
  } else {
    centered(1, "Date needs sync");
  }
}

void scheduleRetry() {
  nextAttempt = millis() + retryMs;
  retryMs = retryMs < 15000UL ? retryMs * 2 : 30000UL;
}

void setup() {
  Serial.begin(115200);  // Never wait for USB Serial: run unattended.
  Wire.begin();
  lcdReady = lcd.begin(16, 2) == 0;
  if (!lcdReady) Serial.println("LCD not found. Check wiring; run I2CexpDiag.");
  if (lcdReady) lcd.backlight();
  centered(0, "MYSTERY BOX");
  centered(1, "Connecting...");
  RTC.begin();
  matrix.begin();
  matrix.clear();
#if MQTT_TLS
  if (strlen(MQTT_ROOT_CA) > 0) transport.setCACert(MQTT_ROOT_CA);
#endif
  mqtt.setServer(MQTT_HOST, MQTT_PORT);
  mqtt.setCallback(received);
  if (!mqtt.setBufferSize(1024)) Serial.println("MQTT buffer allocation failed");
  mqtt.setKeepAlive(20);
  mqtt.setSocketTimeout(2);
  WiFi.setTimeout(2000);
}

void loop() {
  const uint32_t now = millis();
  if (synced && now - lastFrameAt > 3000UL && now - lastOfflineDraw >= 200UL) {
    offlineClock();
    lastOfflineDraw = now;
  }
  if (WiFi.status() != WL_CONNECTED) {
    if (mqtt.connected()) mqtt.disconnect();
    if (due(now, nextAttempt)) {
      Serial.println("Connecting Wi-Fi");
      WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
      scheduleRetry();
    }
    return;
  }
  if (!mqtt.connected()) {
    if (due(now, nextAttempt)) {
      Serial.println("Connecting MQTT");
      if (mqtt.connect("mb-" DEVICE_ID, MQTT_USERNAME, MQTT_PASSWORD,
                       STATUS_TOPIC, 1, true, "{\"online\":false}")) {
        mqtt.subscribe(FRAME_TOPIC, 0);
        mqtt.publish(HELLO_TOPIC, "{}", false);
        telemetry();
        retryMs = 1000;
      } else {
        scheduleRetry();
      }
    }
    return;
  }
  mqtt.loop();
  nextAttempt = millis();  // Keep deadlines fresh even after months of uptime.
  if (millis() - lastTelemetryAt >= 15000UL) telemetry();
}
