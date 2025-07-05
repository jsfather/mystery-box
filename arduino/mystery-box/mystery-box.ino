#include <ArduinoMqttClient.h>
#include <WiFiS3.h>
#include "arduino_secrets.h"
#include <LiquidCrystal_I2C.h>
#include <ArduinoJson.h>
#include "Arduino_LED_Matrix.h"
#include "animation.h"

WiFiClient wifiClient;
MqttClient mqttClient(wifiClient);
LiquidCrystal_I2C lcd(0x27, 16, 2);
DynamicJsonDocument doc(1024);
ArduinoLEDMatrix matrix;

const char broker[] = "192.168.1.103";
int port = 1883;
const char topic[] = "data";

const int MAX_WIFI_RETRIES = 5;
const int MAX_MQTT_RETRIES = 3;
const int WIFI_TIMEOUT = 10000;
const int MQTT_TIMEOUT = 5000;
const int DISPLAY_DELAY = 2000;

void setup() {
  matrix.loadSequence(frames);
  matrix.begin();
  matrix.play(true);
  Serial.begin(9600);
  while (!Serial) {
    ;
  }

  lcd.init();
  lcd.backlight();
  lcd.setCursor(0, 0);

  Serial.print("SSID: ");
  Serial.println(ssid);
  Serial.print("Connecting to WiFi...");
  Serial.println();

  lcd.print("SSID: ");
  lcd.setCursor(6, 0);
  lcd.print(ssid);
  lcd.setCursor(0, 1);
  lcd.print("Connecting ...");
  delay(DISPLAY_DELAY);

  bool wifiConnected = false;
  for (int attempt = 1; attempt <= MAX_WIFI_RETRIES && !wifiConnected; attempt++) {
    Serial.print("WiFi attempt ");
    Serial.print(attempt);
    Serial.print(" of ");
    Serial.println(MAX_WIFI_RETRIES);

    lcd.clear();
    lcd.setCursor(0, 0);
    lcd.print("WiFi Attempt ");
    lcd.print(attempt);
    lcd.setCursor(0, 1);
    lcd.print("of ");
    lcd.print(MAX_WIFI_RETRIES);
    delay(DISPLAY_DELAY);

    WiFi.begin(ssid, pass);

    unsigned long startTime = millis();
    while (WiFi.status() != WL_CONNECTED && (millis() - startTime) < WIFI_TIMEOUT) {
      Serial.print(".");
      delay(500);
    }

    if (WiFi.status() == WL_CONNECTED) {
      wifiConnected = true;
      Serial.println();
      Serial.print("Connected to ");
      Serial.println(ssid);

      lcd.clear();
      lcd.setCursor(0, 0);
      lcd.print("WiFi Connected!");
      lcd.setCursor(0, 1);
      lcd.print(ssid);
      delay(DISPLAY_DELAY);
    } else {
      Serial.println();
      Serial.print("Failed to connect (attempt ");
      Serial.print(attempt);
      Serial.println(")");

      lcd.clear();
      lcd.setCursor(0, 0);
      lcd.print("WiFi Failed!");
      lcd.setCursor(0, 1);
      lcd.print("Attempt ");
      lcd.print(attempt);
      delay(DISPLAY_DELAY);
    }
  }

  if (!wifiConnected) {
    Serial.println("Failed to connect to WiFi after all attempts!");
    lcd.clear();
    lcd.setCursor(0, 0);
    lcd.print("WiFi Failed!");
    lcd.setCursor(0, 1);
    lcd.print("Check settings");
    while (1) {
      delay(1000);
    }
  }

  bool mqttConnected = false;
  for (int attempt = 1; attempt <= MAX_MQTT_RETRIES && !mqttConnected; attempt++) {
    Serial.print("MQTT attempt ");
    Serial.print(attempt);
    Serial.print(" of ");
    Serial.println(MAX_MQTT_RETRIES);
    Serial.print("Attempting to connect to broker: ");
    Serial.println(broker);

    lcd.clear();
    lcd.setCursor(0, 0);
    lcd.print("MQTT Attempt ");
    lcd.print(attempt);
    lcd.setCursor(0, 1);
    lcd.print("of ");
    lcd.print(MAX_MQTT_RETRIES);
    delay(DISPLAY_DELAY);

    lcd.clear();
    lcd.setCursor(0, 0);
    lcd.print("Connecting to");
    lcd.setCursor(0, 1);
    lcd.print(broker);
    delay(DISPLAY_DELAY);

    if (mqttClient.connect(broker, port)) {
      mqttConnected = true;
      Serial.println("Connected to MQTT broker!");

      lcd.clear();
      lcd.setCursor(0, 0);
      lcd.print("MQTT Connected!");
      lcd.setCursor(0, 1);
      lcd.print(broker);
      delay(DISPLAY_DELAY);
    } else {
      Serial.print("MQTT connection failed! Error code = ");
      Serial.println(mqttClient.connectError());

      lcd.clear();
      lcd.setCursor(0, 0);
      lcd.print("MQTT Failed!");
      lcd.setCursor(0, 1);
      lcd.print("Error: ");
      lcd.print(mqttClient.connectError());
      delay(DISPLAY_DELAY);

      if (attempt < MAX_MQTT_RETRIES) {
        Serial.print("Retrying in 3 seconds...");
        lcd.clear();
        lcd.setCursor(0, 0);
        lcd.print("Retrying in");
        lcd.setCursor(0, 1);
        lcd.print("3 seconds...");
        delay(3000);
      }
    }
  }

  if (!mqttConnected) {
    Serial.println("Failed to connect to MQTT broker after all attempts!");
    lcd.clear();
    lcd.setCursor(0, 0);
    lcd.print("MQTT Failed!");
    lcd.setCursor(0, 1);
    lcd.print("Check broker");
    while (1) {
      delay(1000);
    }
  }

  Serial.print("Subscribing to topic: ");
  Serial.println(topic);

  lcd.clear();
  lcd.setCursor(0, 0);
  lcd.print("Subscribing to");
  lcd.setCursor(0, 1);
  lcd.print("topic: ");
  lcd.print(topic);
  delay(DISPLAY_DELAY);

  mqttClient.subscribe(topic);

  Serial.print("Waiting for messages on topic: ");
  Serial.println(topic);
  Serial.println();

  lcd.clear();
  lcd.setCursor(0, 0);
  lcd.print("Ready!");
  lcd.setCursor(0, 1);
  lcd.print("Waiting data...");
  delay(DISPLAY_DELAY);

  lcd.clear();
}

void loop() {
  int messageSize = mqttClient.parseMessage();
  if (messageSize) {
    Serial.print("Received a message with topic '");
    Serial.print(mqttClient.messageTopic());
    Serial.print("', length ");
    Serial.print(messageSize);
    Serial.println(" bytes:");

    String message = "";
    while (mqttClient.available()) {
      char c = (char)mqttClient.read();
      Serial.print(c);
      message += c;
    }

    Serial.println();
    Serial.println();

    DynamicJsonDocument doc(1024);
    DeserializationError error = deserializeJson(doc, message);

    if (error) {
      Serial.print("JSON parsing failed: ");
      Serial.println(error.c_str());
      lcd.clear();
      lcd.setCursor(0, 0);
      lcd.print("JSON Error!");
      return;
    }

    int x = doc["x"] | 0;
    int y = doc["y"] | 0;
    String content = doc["content"];
    bool clearScreen = doc["clear"] | false;

    if (doc.containsKey("backlight")) {
      bool backlightState = doc["backlight"];
      if (backlightState) {
        lcd.backlight();
      } else {
        lcd.noBacklight();
      }
    }

    if (x < 0 || x > 15) x = 0;
    if (y < 0 || y > 1) y = 0;

    if (clearScreen) {
      lcd.clear();
    }

    lcd.setCursor(x, y);
    lcd.print(content);
  }
}