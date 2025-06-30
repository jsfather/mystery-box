#include <WiFi.h>
#include <WebServer.h>
#include <LiquidCrystal_I2C.h>
#include <time.h>

// WiFi credentials - UPDATE THESE WITH YOUR NETWORK INFO
const char* ssid = "YOUR_WIFI_NAME";
const char* password = "YOUR_WIFI_PASSWORD";

// LCD setup (address 0x27 is most common, try 0x3F if it doesn't work)
LiquidCrystal_I2C lcd(0x27, 16, 2);

// Web server on port 80
WebServer server(80);

// Time configuration
const char* ntpServer = "pool.ntp.org";
const long gmtOffset_sec = 0;     // Change this for your timezone (e.g., -18000 for EST)
const int daylightOffset_sec = 0;  // Change this for daylight saving time

// Button configuration
const int BUTTON_PIN = 2;  // Change this to your button pin
bool lastButtonState = HIGH;
bool currentButtonState = HIGH;
unsigned long buttonPressTime = 0;
unsigned long buttonReleaseTime = 0;
const unsigned long LONG_PRESS_TIME = 1000; // 1 second for long press
const unsigned long DEBOUNCE_TIME = 50; // 50ms debounce

// Message system variables
String currentMessage = "";
bool showingMessage = false;
bool newMessageFlashing = false;
unsigned long flashStartTime = 0;
int flashCount = 0;
const int TOTAL_FLASHES = 6; // 3 on/off cycles
const unsigned long FLASH_INTERVAL = 500; // 500ms per flash

// Scrolling variables
int scrollPosition = 0;
unsigned long lastScrollTime = 0;
const unsigned long SCROLL_SPEED = 300; // milliseconds between scroll steps
bool scrollingMessage = false;

// Backlight control
bool backlightOn = true;

void setup() {
  Serial.begin(115200);

  // Initialize button pin
  pinMode(BUTTON_PIN, INPUT_PULLUP);

  // Initialize LCD
  lcd.init();
  lcd.backlight();
  lcd.clear();
  lcd.setCursor(0, 0);
  lcd.print("Starting up...");

  // Connect to WiFi
  WiFi.begin(ssid, password);
  lcd.setCursor(0, 1);
  lcd.print("Connecting WiFi");

  while (WiFi.status() != WL_CONNECTED) {
    delay(1000);
    Serial.println("Connecting to WiFi...");
  }

  Serial.println("WiFi connected!");
  Serial.println("IP address: ");
  Serial.println(WiFi.localIP());

  // Initialize time
  configTime(gmtOffset_sec, daylightOffset_sec, ntpServer);

  // Setup web server routes
  server.on("/", handleRoot);
  server.on("/message", HTTP_POST, handleMessage);
  server.begin();

  lcd.clear();
  lcd.setCursor(0, 0);
  lcd.print("Ready!");
  lcd.setCursor(0, 1);
  lcd.print(WiFi.localIP());
  delay(3000);
}

void loop() {
  server.handleClient();
  handleButton();

  // Handle new message flashing
  if (newMessageFlashing) {
    handleNewMessageFlash();
  } else if (showingMessage) {
    displayMessage();
  } else {
    displayTimeAndDate();
  }

  delay(50); // Small delay for responsiveness
}

void handleButton() {
  currentButtonState = digitalRead(BUTTON_PIN);

  // Button pressed (HIGH to LOW transition)
  if (lastButtonState == HIGH && currentButtonState == LOW) {
    buttonPressTime = millis();
  }
  // Button released (LOW to HIGH transition)
  else if (lastButtonState == LOW && currentButtonState == HIGH) {
    buttonReleaseTime = millis();
    unsigned long pressDuration = buttonReleaseTime - buttonPressTime;

    if (pressDuration >= DEBOUNCE_TIME) {
      if (pressDuration >= LONG_PRESS_TIME) {
        // Long press - clear message
        handleLongPress();
      } else {
        // Short press - toggle backlight
        handleShortPress();
      }
    }
  }

  lastButtonState = currentButtonState;
}

void handleShortPress() {
  backlightOn = !backlightOn;
  if (backlightOn) {
    lcd.backlight();
  } else {
    lcd.noBacklight();
  }
  Serial.println("Backlight toggled");
}

void handleLongPress() {
  if (showingMessage) {
    showingMessage = false;
    currentMessage = "";
    scrollingMessage = false;
    scrollPosition = 0;
    Serial.println("Message cleared by long press");
  }
}

void handleNewMessageFlash() {
  unsigned long currentTime = millis();

  if (currentTime - flashStartTime >= FLASH_INTERVAL) {
    flashCount++;

    if (flashCount % 2 == 1) {
      // Odd flash count - show "New Message!"
      lcd.clear();
      lcd.setCursor(2, 0);
      lcd.print("New Message!");
      if (backlightOn) lcd.backlight();
    } else {
      // Even flash count - clear screen
      lcd.clear();
      lcd.noBacklight();
    }

    flashStartTime = currentTime;

    // End flashing after specified number of flashes
    if (flashCount >= TOTAL_FLASHES) {
      newMessageFlashing = false;
      flashCount = 0;
      showingMessage = true;

      // Restore backlight state
      if (backlightOn) {
        lcd.backlight();
      }

      // Check if message needs scrolling
      if (currentMessage.length() > 16) {
        scrollingMessage = true;
        scrollPosition = 0;
      } else {
        scrollingMessage = false;
      }
    }
  }
}

void displayTimeAndDate() {
  static unsigned long lastUpdate = 0;
  if (millis() - lastUpdate < 1000) return; // Update only once per second

  struct tm timeinfo;
  if (!getLocalTime(&timeinfo)) {
    lcd.clear();
    lcd.setCursor(0, 0);
    lcd.print("Time Error");
    lastUpdate = millis();
    return;
  }

  lcd.clear();

  // Display time on top line (HH:MM:SS)
  lcd.setCursor(0, 0);
  lcd.printf("%02d:%02d:%02d", timeinfo.tm_hour, timeinfo.tm_min, timeinfo.tm_sec);

  // Display date on bottom line (DD/MM/YYYY)
  lcd.setCursor(0, 1);
  lcd.printf("%02d/%02d/%04d", timeinfo.tm_mday, timeinfo.tm_mon + 1, timeinfo.tm_year + 1900);

  lastUpdate = millis();
}

void displayMessage() {
  lcd.clear();
  lcd.setCursor(0, 0);
  lcd.print("Message:");

  if (!scrollingMessage) {
    // Static message (16 characters or less)
    lcd.setCursor(0, 1);
    lcd.print(currentMessage);
  } else {
    // Scrolling message
    if (millis() - lastScrollTime >= SCROLL_SPEED) {
      lcd.setCursor(0, 1);

      // Create display window
      String displayText = "";
      for (int i = 0; i < 16; i++) {
        int charIndex = (scrollPosition + i) % (currentMessage.length() + 4); // +4 for spacing
        if (charIndex < currentMessage.length()) {
          displayText += currentMessage.charAt(charIndex);
        } else {
          displayText += " "; // Add spaces between loops
        }
      }

      lcd.print(displayText);

      scrollPosition++;
      if (scrollPosition >= currentMessage.length() + 4) {
        scrollPosition = 0; // Reset for continuous loop
      }

      lastScrollTime = millis();
    }
  }
}

void handleRoot() {
  String html = "<html><head><title>Arduino Message Display</title>";
  html += "<style>body{font-family:Arial;margin:40px;background:#f0f0f0;}";
  html += ".container{background:white;padding:30px;border-radius:10px;box-shadow:0 2px 10px rgba(0,0,0,0.1);}";
  html += "input[type='text']{width:300px;padding:10px;font-size:16px;border:2px solid #ddd;border-radius:5px;}";
  html += "input[type='submit']{background:#007bff;color:white;padding:12px 24px;font-size:16px;border:none;border-radius:5px;cursor:pointer;margin-left:10px;}";
  html += "input[type='submit']:hover{background:#0056b3;}</style></head>";
  html += "<body><div class='container'>";
  html += "<h1>🕐 Arduino Message Display</h1>";
  html += "<form action='/message' method='POST'>";
  html += "<label>Message: </label><input type='text' name='msg' maxlength='200' placeholder='Enter your message here...'>";
  html += "<input type='submit' value='Send Message'>";
  html += "</form>";
  html += "<div style='margin-top:20px;padding:15px;background:#e9ecef;border-radius:5px;'>";
  html += "<strong>Current status:</strong> ";
  if (showingMessage) {
    html += "📢 Showing message: \"" + currentMessage + "\"";
  } else {
    html += "🕐 Showing time and date";
  }
  html += "</div>";
  html += "<div style='margin-top:15px;font-size:14px;color:#666;'>";
  html += "<strong>Button Controls:</strong><br>";
  html += "• Short press: Toggle screen backlight<br>";
  html += "• Long press (1+ seconds): Clear current message";
  html += "</div>";
  html += "</div></body></html>";

  server.send(200, "text/html", html);
}

void handleMessage() {
  if (server.hasArg("msg")) {
    String newMessage = server.arg("msg");
    newMessage.trim(); // Remove leading/trailing spaces

    if (newMessage.length() > 0) {
      currentMessage = newMessage;
      newMessageFlashing = true;
      flashStartTime = millis();
      flashCount = 0;

      Serial.println("New message received: " + currentMessage);

      server.send(200, "text/html",
        "<html><head><style>body{font-family:Arial;margin:40px;background:#f0f0f0;}</style></head>"
        "<body><div style='background:white;padding:30px;border-radius:10px;text-align:center;'>"
        "<h1>✅ Message Sent Successfully!</h1>"
        "<p><strong>Message:</strong> " + currentMessage + "</p>"
        "<p>Your Arduino is now flashing and will display the message.</p>"
        "<a href='/' style='background:#007bff;color:white;padding:10px 20px;text-decoration:none;border-radius:5px;'>Send Another Message</a>"
        "</div></body></html>");
    } else {
      server.send(400, "text/html",
        "<html><body><h1>❌ Error: Empty message</h1><a href='/'>Go Back</a></body></html>");
    }
  } else {
    server.send(400, "text/html",
      "<html><body><h1>❌ Error: No message provided</h1><a href='/'>Go Back</a></body></html>");
  }
}