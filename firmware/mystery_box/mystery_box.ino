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
#include "steady_clock.h"
#include "heartbeat.h"
#include "matrix_program.h"
#include "lcd_scroll.h"

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
const char MATRIX_TOPIC[] = "mystery-box/" DEVICE_ID "/matrix";
uint32_t matrixFrames[512][4], matrixRevision = 0;
bool matrixProgramReady = false;
uint32_t lastFrameAt = 0, lastTelemetryAt = 0;
uint32_t nextAttempt = 0, retryMs = 1000, lastSeq = 0, lastLocalDraw = 0;
uint32_t lastWifiCheck = 0, lastMqttPoll = 0;
uint64_t newestFrameMs = 0;
SteadyClock displayClock;
bool localClock = false, localLove = false, clockTop = false, localHeart = false;
bool wifiConnected = false;
uint8_t heartSpeed = 5, playingHeartSpeed = 0;
uint32_t heartFrames[6][4];
uint32_t lastDrawSecond = 0, lastTickAt = 0, tickMin = UINT32_MAX, tickMax = 0;
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
LcdScroll scroll;
uint8_t errors = 0, occurred = 0, shownError = 0, reportedErrors = 0;
uint16_t programFrames = 0;
uint32_t errorFrames[42][4]; // Two-character scrolling codes, independent of user animation.
bool mqttReady = false, brokerConnected = false, statusLight = false;
uint32_t waitingSince = 0;

void fault(uint8_t code, bool active) {
  const uint8_t bit = 1U << (code - 1);
  if (active && !(errors & bit)) {
    occurred |= bit;
    Serial.print("Error E"); Serial.println(code);
  }
  if (active) errors |= bit;
  else errors &= ~bit;
}

void drawError() {
  uint8_t code = 0;
  for (uint8_t i = 1; i <= 8; ++i) if (errors & (1U << (i - 1))) { code = i; break; }
  if (code == shownError) return;
  noInterrupts(); matrix.autoscroll(0); interrupts();
  shownError = code;
  if (code) {
    char label[] = {'E', char('0' + code), 0};
    const uint16_t count = MatrixProgram::build("text", 7, label, nullptr, 0, errorFrames);
    matrix.loadWrapper(errorFrames, count * sizeof(errorFrames[0]));
    matrix.play(true);
  } else if (matrixProgramReady) {
    matrix.loadWrapper(matrixFrames, programFrames * sizeof(matrixFrames[0]));
    matrix.play(true);
  } else if (localHeart) {
    matrix.loadSequence(heartFrames); matrix.play(true);
  } else matrix.renderBitmap(pixels, 8, 12);
}


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
  // Write only changed spans: no lcd.clear() flicker in the main loop.
  if (lcdReady && memcmp(displayed[index], padded, 16) != 0) {
    for (uint8_t at = 0; at < 16;) {
      if (displayed[index][at] == padded[at]) { ++at; continue; }
      if (lcd.setCursor(at, index) != 0) {
        lcdReady = false; fault(1, true); return;
      }
      do {
        if (lcd.write((uint8_t)padded[at]) != 1) {
          lcdReady = false; fault(1, true); return;
        }
        ++at;
      }
      while (at < 16 && displayed[index][at] != padded[at]);
    }
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

void receivedMatrix(byte* payload, unsigned int length) {
  if(length>1024) { fault(8, true); return; }
  JsonDocument doc;
  if(deserializeJson(doc,payload,length) || (doc["v"]|0)!=1 || !doc["revision"].is<uint32_t>()){ fault(8, true); return; }
  const uint32_t revision=doc["revision"].as<uint32_t>();
  if(matrixProgramReady && revision==matrixRevision) { fault(8, false); return; }
  const char* mode=doc["mode"]|"", *text=doc["text"]|"";
  const int speed=doc["speed"]|0;
  if(speed<1||speed>10||strlen(text)>80){ fault(8, true); return; }
  for(unsigned i=0;i<strlen(text);i++)if(text[i]<32||text[i]>126){ fault(8, true); return; }
  if(strcmp(mode,"heart")&&strcmp(mode,"off")&&strcmp(mode,"text")&&strcmp(mode,"custom")&&MatrixProgram::presetIndex(mode)<0){ fault(8, true); return; }
  const char* custom[32];
  const JsonArray array=doc["frames"].as<JsonArray>();
  const unsigned count=array.size();
  if(count>32 || (!strcmp(mode,"custom") && count==0)){ fault(8, true); return; }
  for(unsigned f=0;f<count;f++) {
    custom[f]=array[f]|"";
    if(strlen(custom[f])!=24){ fault(8, true); return; }
    for(int i=0;i<24;i++)if(hexValue(custom[f][i])<0){ fault(8, true); return; }
  }
  // Stop only while replacing the sequence. Steady playback thereafter is
  // handled entirely by the matrix hardware timer, including during reconnects.
  noInterrupts();
  if (!shownError) matrix.autoscroll(0);
  interrupts();
  const uint16_t frames=MatrixProgram::build(mode,speed,text,custom,count,matrixFrames);
  noInterrupts();
  programFrames = frames;
  if (!shownError) {
    matrix.loadWrapper(matrixFrames,frames*sizeof(matrixFrames[0]));
    matrix.play(true);
  }
  interrupts();
  matrixProgramReady=true;
  matrixRevision=revision;
  fault(8, false);
  Serial.print("Local matrix program: "); Serial.print(mode);
  Serial.print("; frames: "); Serial.print(frames);
  Serial.print("; revision: "); Serial.println(revision);
}

void received(char* topic, byte* payload, unsigned int length) {
  if(!strcmp(topic,MATRIX_TOPIC)) { receivedMatrix(payload,length); return; }
  if (strcmp(topic, FRAME_TOPIC) != 0) return;
  if (length > 1280) { fault(7, true); return; }
  JsonDocument doc;
  if (deserializeJson(doc, payload, length) || doc["v"].as<int>() != 1) { fault(7, true); return; }
  const char* a = doc["line1"] | "";
  const char* b = doc["line2"] | "";
  const char* hex = doc["matrix"] | "";
  if (!lcdLine(a) || !lcdLine(b) || strlen(hex) != 24 ||
      !doc["epoch"].is<uint32_t>() || !doc["offset"].is<int32_t>() ||
      !doc["dateKey"].is<int32_t>()) { fault(7, true); return; }
  for (uint8_t i = 0; i < 24; i++) {
    if (hexValue(hex[i]) < 0) { fault(7, true); return; }
  }
  JsonVariant sc = doc["scroll"];
  if (!sc.isNull()) {
    const char* key = sc["id"] | "";
    const char* text = sc["text"] | "";
    if (!*key || strlen(key) > 80 || !*text || strlen(text) > 160 ||
        !sc["phase"].is<uint32_t>() || !sc["remaining"].is<uint32_t>() ||
        sc["phase"].as<uint32_t>() >= (strlen(text) + 4) * 300UL ||
        sc["remaining"].as<uint32_t>() > 300000UL) { fault(7, true); return; }
    for (size_t i = 0; text[i]; ++i) if (text[i] < 32 || text[i] > 126) { fault(7, true); return; }
  }
  const uint32_t now = millis(), epoch = doc["epoch"].as<uint32_t>();
  const int32_t offset = doc["offset"].as<int32_t>();
  if (epoch < 1700000000UL || epoch > 4102444800UL ||
      offset < -50400 || offset > 50400) { fault(7, true); return; }

  const char* title = doc["loveTitle"] | "YOU & ME <3";
  if (strlen(title) < 1 || strlen(title) > 16) { fault(7, true); return; }
  for (size_t i = 0; i < strlen(title); i++) {
    if (title[i] < 32 || title[i] > 126) { fault(7, true); return; }
  }
  const uint16_t fraction = doc["ms"] | 0;
  if (fraction > 999) { fault(7, true); return; }
  const uint64_t frameMs = (uint64_t)epoch * 1000 + fraction;
  if (frameMs < newestFrameMs) { fault(7, false); return; }
  newestFrameMs = frameMs;
  displayClock.sample(frameMs, now);
  if (!synced) {
    RTCTime t((time_t)epoch);
    if (!RTC.setTime(t)) fault(2, true);
    synced = true;
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
  localClock = doc["clock"] | false;
  localLove = doc["love"] | false;
  clockTop = doc["clockTop"] | false;
  const bool wasHeart = localHeart;
  localHeart = doc["heart"] | false;
  heartSpeed = doc["heartSpeed"] | 5;
  if (heartSpeed < 1 || heartSpeed > 10) heartSpeed = 5;
  if (!matrixProgramReady && localHeart && (!wasHeart || heartSpeed != playingHeartSpeed)) {
    // The LED library advances sequences in its hardware timer ISR. Stop it
    // while replacing the persistent frame buffer, then play independently of Wi-Fi.
    noInterrupts();
    if (!shownError) matrix.autoscroll(0);
    interrupts();
    Heartbeat::sequence(heartFrames, heartSpeed);
    noInterrupts();
    if (!shownError) { matrix.loadSequence(heartFrames); matrix.play(true); }
    interrupts();
    playingHeartSpeed = heartSpeed;
  } else if (!shownError && !matrixProgramReady && !localHeart && wasHeart) {
    noInterrupts();
    matrix.autoscroll(0);
    interrupts();
  }
  if (localClock) {
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
  if (sc.isNull()) scroll.stop();
  else scroll.set(sc["id"], sc["text"], sc["phase"], sc["remaining"], now);
  if (!localClock && !localLove && brokerConnected) {
    if (!clockTop) row(0, a);
    if (!scroll.active) row(1, b);
  }
  if (!shownError && !matrixProgramReady && !localHeart) {
    for (uint8_t i = 0; i < 96; i++) {
      pixels[i / 12][i % 12] = (hexValue(hex[i / 4]) >> (3 - i % 4)) & 1;
    }
    matrix.renderBitmap(pixels, 8, 12);
  }
  if (lastFrameAt == 0) Serial.println("First display frame received");
  lastSeq = doc["seq"] | 0UL;
  lastFrameAt = now;
  fault(6, false); fault(7, false);
}

void telemetry() {
  JsonDocument doc;
  doc["online"] = true;
  doc["rssi"] = WiFi.RSSI();
  doc["ip"] = WiFi.localIP().toString();
  doc["firmware"] = "1.4.0";
  doc["errors"] = errors;
  doc["occurred"] = occurred;
  doc["matrixRevision"] = matrixRevision;
  doc["seq"] = lastSeq;
  char buffer[320];
  serializeJson(doc, buffer, sizeof(buffer));
  if (mqtt.publish(STATUS_TOPIC, buffer, false)) { occurred = 0; reportedErrors = errors; }
  Serial.print("Heartbeat; last frame sequence: ");
  Serial.println(lastSeq);
  if (tickMax > 0) {
    Serial.print("Local second intervals (ms): ");
    Serial.print(tickMin);
    Serial.print(" - ");
    Serial.println(tickMax);
    tickMin = UINT32_MAX;
    tickMax = 0;
  }
  lastTelemetryAt = millis();
}

void drawClock(int64_t utc, bool offline, bool story) {
  if (story) {
    const uint32_t elapsed = utc > loveSince ? (uint32_t)(utc - loveSince) : 0;
    char dedication[17], counter[17];
    memset(dedication, ' ', 16);
    dedication[16] = '\0';
    const size_t n = strlen(loveTitle);
    memcpy(dedication + (16 - n) / 2, loveTitle, n);
    if (offline) dedication[15] = '*';
    uint8_t format = loveFormat;
    if (format == 5) {
      const uint8_t formats[] = {0, 6, 1, 2, 3, 4};
      format = formats[(utc / 10) % 6];
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
  if (!offline && clockTop) return; // Keep the message on the bottom row.
  // Calendar rules belong to the server. Never display yesterday's cached date.
  if (local / 86400 == cachedDateKey) {
    char date[17];
    memcpy(date, cachedDate, 17);
    if (offline) date[15] = '*';
    row(1, date);
  } else {
    centered(1, "Date needs sync");
  }
}

void drawLocal(uint32_t now) {
  if (!brokerConnected) {
    if (lcdReady && !statusLight) { lcd.backlight(); statusLight = true; }
    centered(0, "(-_-) zZ");
    centered(1, wifiConnected ? "Broker offline" : "Wi-Fi offline");
    return;
  }
  if (statusLight) {
    if (lcdReady && !lightOn) lcd.noBacklight();
    statusLight = false;
  }
  if (!synced || !lastFrameAt) {
    centered(0, "MYSTERY BOX"); centered(1, "Waiting for sync"); return;
  }
  char message[17];
  if (scroll.draw(now, message)) row(1, message);
  const uint64_t timeMs = displayClock.now(now);
  const uint32_t second = timeMs / 1000;
  if (second != lastDrawSecond) {
    if (lastTickAt != 0) {
      const uint32_t interval = now - lastTickAt;
      if (interval < tickMin) tickMin = interval;
      if (interval > tickMax) tickMax = interval;
    }
    lastTickAt = now;
    lastDrawSecond = second;
  }
  const bool offline = now - lastFrameAt > 3000UL;
  if (localClock || localLove || clockTop || offline)
    drawClock(timeMs / 1000, offline, offline ? loveEnabled : localLove);
}

void scheduleRetry() {
  nextAttempt = millis() + retryMs;
  retryMs = retryMs < 15000UL ? retryMs * 2 : 30000UL;
}

void bootStep(const char* step) {
  Serial.println(step);
  centered(0, "MYSTERY BOX"); centered(1, step);
  delay(250); // Startup only: make each hardware stage readable.
}

void setup() {
  Serial.begin(115200);  // Never wait for USB Serial: run unattended.
  matrix.begin();
  matrix.clear();
  Wire.begin();
  lcdReady = lcd.begin(16, 2) == 0;
  if (!lcdReady) Serial.println("LCD not found. Check wiring; run I2CexpDiag.");
  if (lcdReady) lcd.backlight();
  fault(1, !lcdReady);
  bootStep(lcdReady ? "LCD ready" : "LCD error E1");
  bootStep("Starting RTC");
  fault(2, !RTC.begin());
  bootStep((errors & 2) ? "RTC error E2" : "RTC ready");
  bootStep("LED matrix ready");
  drawError();
  bootStep("Configuring MQTT");
#if MQTT_TLS
  bootStep("Configuring TLS");
  if (strlen(MQTT_ROOT_CA) > 0) transport.setCACert(MQTT_ROOT_CA);
#endif
  mqtt.setServer(MQTT_HOST, MQTT_PORT);
  mqtt.setCallback(received);
  mqttReady = mqtt.setBufferSize(1536);
  fault(3, !mqttReady);
  bootStep(mqttReady ? "MQTT ready" : "MQTT error E3");
  mqtt.setKeepAlive(20);
  mqtt.setSocketTimeout(2);
  WiFi.setTimeout(2000);
  bootStep("Connecting Wi-Fi");
}

void loop() {
  const uint32_t now = millis();
  if (brokerConnected && (!mqtt.connected() || !wifiConnected)) {
    brokerConnected = false; fault(5, true);
  }
  if (brokerConnected) fault(6, now - (lastFrameAt ? lastFrameAt : waitingSince) > 5000UL);
  drawError();
  if (now - lastLocalDraw >= 20UL) {
    drawLocal(now);
    lastLocalDraw = now;
  }
  if (lastWifiCheck == 0 || now - lastWifiCheck >= 1000UL) {
    const bool wasConnected = wifiConnected;
    wifiConnected = WiFi.status() == WL_CONNECTED;
    if (wasConnected && !wifiConnected) fault(4, true);
    lastWifiCheck = now;
  }
  if (!wifiConnected) {
    if (mqtt.connected()) mqtt.disconnect();
    brokerConnected = false;
    if (due(now, nextAttempt)) {
      Serial.println("Connecting Wi-Fi");
      wifiConnected = WiFi.begin(WIFI_SSID, WIFI_PASSWORD) == WL_CONNECTED;
      fault(4, !wifiConnected);
      if (wifiConnected) { retryMs = 1000; nextAttempt = millis(); bootStep("Connecting broker"); }
      else scheduleRetry();
    }
    return;
  }
  fault(4, false);
  if (!mqttReady) return;
  if (now - lastMqttPoll < 20UL) return;
  lastMqttPoll = now;
  if (!mqtt.connected()) {
    if (due(now, nextAttempt)) {
      Serial.println("Connecting MQTT");
      if (mqtt.connect("mb-" DEVICE_ID, MQTT_USERNAME, MQTT_PASSWORD,
                       STATUS_TOPIC, 1, true, "{\"online\":false}")) {
        Serial.println("Wi-Fi and MQTT connected");
        Serial.print("Connectivity firmware: ");
        Serial.println(WiFi.firmwareVersion());
        Serial.println(lcdReady ? "LCD ready" : "LCD not found");
        const bool subscribed = mqtt.subscribe(FRAME_TOPIC, 0) && mqtt.subscribe(MATRIX_TOPIC, 1);
        if (!subscribed || !mqtt.publish(HELLO_TOPIC, "{}", false)) {
          fault(5, true); mqtt.disconnect(); scheduleRetry(); return;
        }
        brokerConnected = true; waitingSince = millis(); lastFrameAt = 0;
        fault(5, false);
        bootStep("Broker connected");
        bootStep("Waiting for sync");
        telemetry();
        retryMs = 1000;
      } else {
        fault(5, true);
        Serial.print("MQTT connection failed; state: ");
        Serial.println(mqtt.state());
        scheduleRetry();
      }
    }
    return;
  }
  mqtt.loop();
  nextAttempt = millis();  // Keep deadlines fresh even after months of uptime.
  const uint32_t sinceTelemetry = millis() - lastTelemetryAt;
  if (sinceTelemetry >= 15000UL ||
      (sinceTelemetry >= 1000UL && (errors != reportedErrors || occurred))) telemetry();
}
