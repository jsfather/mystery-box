#include <WiFiS3.h>
#include <WiFiServer.h>
#include <WiFiClient.h>
#include <LiquidCrystal_I2C.h>
#include <NTPClient.h>
#include <WiFiUdp.h>
#include "secrets.h"

// LCD setup (address 0x27 is most common, try 0x3F if it doesn't work)
LiquidCrystal_I2C lcd(0x27, 16, 2);

// WiFi server on port 80
WiFiServer server(80);

// NTP Client setup for Tehran timezone (UTC+3:30 = 12600 seconds)
WiFiUDP ntpUDP;
NTPClient timeClient(ntpUDP, "time.nist.gov", 12600, 60000);  // Tehran timezone offset: +3:30 hours

// Alternative NTP servers to try if primary fails
const char* ntpServers[] = {
  "time.nist.gov",
  "pool.ntp.org",
  "time.google.com",
  "time.cloudflare.com",
  "0.pool.ntp.org"
};
const int numNtpServers = sizeof(ntpServers) / sizeof(ntpServers[0]);
int currentNtpServer = 0;

// Button configuration
const int BUTTON_PIN = 2;  // Change this to your button pin
bool lastButtonState = HIGH;
bool currentButtonState = HIGH;
unsigned long buttonPressTime = 0;
unsigned long buttonReleaseTime = 0;
const unsigned long LONG_PRESS_TIME = 1000;  // 1 second for long press
const unsigned long DEBOUNCE_TIME = 50;      // 50ms debounce

// Message system variables
String currentMessage = "";
bool showingMessage = false;
// New message flashing functionality
bool newMessageFlashing = false;
unsigned long flashStartTime = 0;
int flashCount = 0;
const int TOTAL_FLASHES = 10;              // 5 on/off cycles (5 blinks)
const unsigned long FLASH_INTERVAL = 700;  // 700ms per flash

// Scrolling variables
int scrollPosition = 0;
unsigned long lastScrollTime = 0;
const unsigned long SCROLL_SPEED = 300;  // milliseconds between scroll steps
bool scrollingMessage = false;

void setup() {
  Serial.begin(115200);
  delay(2000);  // Give time for serial monitor to open

  Serial.println("=== Arduino Uno R4 WiFi Message Display ===");
  Serial.println("Initializing...");

  // Initialize button pin
  pinMode(BUTTON_PIN, INPUT_PULLUP);

  // Initialize LCD
  lcd.init();
  lcd.backlight();
  lcd.clear();
  lcd.setCursor(0, 0);
  lcd.print("Starting up...");

  // Check WiFi module
  if (WiFi.status() == WL_NO_MODULE) {
    Serial.println("Communication with WiFi module failed!");
    lcd.clear();
    lcd.setCursor(0, 0);
    lcd.print("WiFi Error!");
    lcd.setCursor(0, 1);
    lcd.print("Module failed");
    while (true)
      ;
  }

  String fv = WiFi.firmwareVersion();
  Serial.print("WiFi firmware version: ");
  Serial.println(fv);

  // Print network credentials (for debugging)
  Serial.print("SSID: ");
  Serial.println(ssid);
  Serial.print("Password length: ");
  Serial.println(strlen(password));

  // Connect to WiFi with better debugging
  Serial.print("Connecting to WiFi network: ");
  Serial.println(ssid);

  // Configure static IP and DNS servers
  IPAddress local_IP(192, 168, 1, 127);
  IPAddress gateway(192, 168, 1, 1);   // Your router's gateway
  IPAddress subnet(255, 255, 255, 0);  // Common subnet mask
  IPAddress primaryDNS(8, 8, 8, 8);    // Google DNS
  IPAddress secondaryDNS(1, 1, 1, 1);  // Cloudflare DNS

  // Configure network settings with DNS
  WiFi.config(local_IP, primaryDNS, gateway, subnet);

  WiFi.begin(ssid, password);
  lcd.setCursor(0, 1);
  lcd.print("Connecting WiFi");

  int attempts = 0;
  while (WiFi.status() != WL_CONNECTED && attempts < 30) {
    delay(1000);
    attempts++;
    Serial.print("Attempt ");
    Serial.print(attempts);
    Serial.print(" - WiFi Status: ");
    Serial.println(WiFi.status());

    // Update LCD with attempt count
    lcd.setCursor(0, 1);
    lcd.print("WiFi Attempt ");
    lcd.print(attempts);
    lcd.print("  ");  // Clear any extra characters

    // Try to reconnect every 10 attempts
    if (attempts % 10 == 0) {
      Serial.println("Retrying WiFi connection...");
      WiFi.disconnect();
      delay(1000);
      WiFi.begin(ssid, password);
    }
  }

  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("Failed to connect to WiFi!");
    lcd.clear();
    lcd.setCursor(0, 0);
    lcd.print("WiFi Failed!");
    lcd.setCursor(0, 1);
    lcd.print("Check settings");
    while (1)
      ;  // Stop here
  }

  Serial.println("WiFi connected!");
  Serial.println("IP address: ");
  Serial.println(WiFi.localIP());

  // Update LCD to show WiFi success
  lcd.clear();
  lcd.setCursor(0, 0);
  lcd.print("WiFi Connected!");
  lcd.setCursor(0, 1);
  lcd.print(WiFi.localIP());
  delay(2000);

  // Initialize NTP client with better error handling
  timeClient.begin();
  Serial.println("Syncing time with NTP server...");

  // Update LCD to show NTP sync status
  lcd.clear();
  lcd.setCursor(0, 0);
  lcd.print("Syncing Time...");

  // Try multiple NTP servers if needed
  bool timeSync = false;
  for (int serverIndex = 0; serverIndex < numNtpServers && !timeSync; serverIndex++) {
    Serial.print("Trying NTP server: ");
    Serial.println(ntpServers[serverIndex]);

    // Update LCD with current server
    lcd.setCursor(0, 1);
    lcd.print("                ");  // Clear line
    lcd.setCursor(0, 1);
    lcd.print("Server ");
    lcd.print(serverIndex + 1);
    lcd.print("/");
    lcd.print(numNtpServers);

    // Reinitialize with new server
    timeClient.end();
    timeClient = NTPClient(ntpUDP, ntpServers[serverIndex], 12600, 60000);
    timeClient.begin();

    // Try to sync multiple times with current server
    for (int attempt = 0; attempt < 5 && !timeSync; attempt++) {
      Serial.print("Sync attempt ");
      Serial.print(attempt + 1);
      Serial.print(" with ");
      Serial.println(ntpServers[serverIndex]);

      // Update LCD with attempt number
      lcd.setCursor(8, 1);
      lcd.print(" Try ");
      lcd.print(attempt + 1);

      if (timeClient.update()) {
        unsigned long epochTime = timeClient.getEpochTime();
        if (epochTime > 946684800) {  // Check if time is after year 2000
          timeSync = true;
          currentNtpServer = serverIndex;
          Serial.println("Time synchronized successfully!");
          Serial.print("Current Tehran time: ");
          Serial.println(timeClient.getFormattedTime());
          Serial.print("Epoch time: ");
          Serial.println(epochTime);

          // Update LCD with success
          lcd.clear();
          lcd.setCursor(0, 0);
          lcd.print("Time Sync OK!");
          lcd.setCursor(0, 1);
          lcd.print(timeClient.getFormattedTime());
          delay(2000);
          break;
        }
      }
      delay(2000);  // Wait 2 seconds between attempts
    }
  }

  if (!timeSync) {
    Serial.println("Failed to sync time with any NTP server!");
    lcd.clear();
    lcd.setCursor(0, 0);
    lcd.print("Time Sync Failed");
    lcd.setCursor(0, 1);
    lcd.print("Check Internet");
    delay(3000);
    // Don't halt - continue with default time
  }

  // Start web server
  server.begin();
  Serial.println("Web server started");

  // Final status display
  lcd.clear();
  lcd.setCursor(0, 0);
  lcd.print("Ready!");
  lcd.setCursor(0, 1);
  lcd.print(WiFi.localIP());
  delay(3000);
}

void loop() {
  handleWebServer();
  handleButton();

  // Update time client periodically with better error handling
  static unsigned long lastNTPUpdate = 0;
  if (millis() - lastNTPUpdate > 300000) {  // Update every 5 minutes
    Serial.println("Attempting to update time...");

    bool updateSuccess = false;
    // Try current server first
    if (timeClient.update()) {
      unsigned long epochTime = timeClient.getEpochTime();
      if (epochTime > 946684800) {  // Check if time is reasonable (after year 2000)
        updateSuccess = true;
        Serial.println("Time updated successfully");
        Serial.print("Current Tehran time: ");
        Serial.println(timeClient.getFormattedTime());
      }
    }

    // If current server fails, try others
    if (!updateSuccess) {
      Serial.println("Primary NTP server failed, trying alternatives...");
      for (int i = 0; i < numNtpServers && !updateSuccess; i++) {
        if (i == currentNtpServer) continue;  // Skip current server

        Serial.print("Trying backup server: ");
        Serial.println(ntpServers[i]);

        timeClient.end();
        timeClient = NTPClient(ntpUDP, ntpServers[i], 12600, 60000);
        timeClient.begin();

        if (timeClient.update()) {
          unsigned long epochTime = timeClient.getEpochTime();
          if (epochTime > 946684800) {
            updateSuccess = true;
            currentNtpServer = i;
            Serial.println("Time updated with backup server");
            break;
          }
        }
        delay(1000);
      }
    }

    if (!updateSuccess) {
      Serial.println("Failed to update time from any server");
    }

    lastNTPUpdate = millis();
  }

  // Handle new message flashing
  if (newMessageFlashing) {
    handleNewMessageFlash();
  } else if (showingMessage) {
    displayMessage();
  } else {
    displayTimeAndDate();
  }

  delay(50);  // Small delay for responsiveness
}

void handleWebServer() {
  WiFiClient client = server.available();
  if (client) {
    Serial.println("New client connected");
    String currentLine = "";
    String httpRequest = "";
    bool isPostRequest = false;
    int contentLength = 0;

    while (client.connected()) {
      if (client.available()) {
        char c = client.read();
        httpRequest += c;

        if (c == '\n') {
          // Check if this is a POST request
          if (currentLine.startsWith("POST /message")) {
            isPostRequest = true;
          }

          // Check for GET request to clear message
          if (currentLine.startsWith("GET /cleartime")) {
            handleClearTimeRequest(client);
            client.stop();
            return;
          }

          // Check for Content-Length header
          if (currentLine.startsWith("Content-Length: ")) {
            contentLength = currentLine.substring(16).toInt();
            Serial.println("Content-Length: " + String(contentLength));
          }

          if (currentLine.length() == 0) {
            // End of HTTP request headers

            // If it's a POST request, read the body
            if (isPostRequest && contentLength > 0) {
              Serial.println("Reading POST body...");
              String postBody = "";
              int bytesRead = 0;
              unsigned long startTime = millis();

              while (bytesRead < contentLength && (millis() - startTime) < 5000) {
                if (client.available()) {
                  char c = client.read();
                  postBody += c;
                  bytesRead++;
                }
              }

              httpRequest += postBody;
              Serial.println("POST body read: " + String(bytesRead) + " bytes");
            }

            if (isPostRequest) {
              handleMessagePost(client, httpRequest);
            } else {
              handleRootPage(client);
            }
            break;
          } else {
            currentLine = "";
          }
        } else if (c != '\r') {
          currentLine += c;
        }
      }
    }

    delay(100);  // Give the web browser time to receive the data
    client.stop();
    Serial.println("Client disconnected");
  }
}

void handleRootPage(WiFiClient client) {
  // Send HTTP response header
  client.println("HTTP/1.1 200 OK");
  client.println("Content-Type: text/html");
  client.println("Connection: close");
  client.println();

  // Send HTML page
  client.println("<html><head><title>Mystery Box</title>");
  client.println("<style>body{font-family:Arial;margin:40px;background:#f0f0f0;}");
  client.println(".container{background:white;padding:30px;border-radius:10px;box-shadow:0 2px 10px rgba(0,0,0,0.1);}");
  client.println("input[type='text']{width:300px;padding:10px;font-size:16px;border:2px solid #ddd;border-radius:5px;}");
  client.println(".btn{padding:12px 24px;font-size:16px;border:none;border-radius:5px;cursor:pointer;margin-left:10px;text-decoration:none;display:inline-block;}");
  client.println(".btn-primary{background:#007bff;color:white;}");
  client.println(".btn-primary:hover{background:#0056b3;}");
  client.println(".btn-secondary{background:#6c757d;color:white;}");
  client.println(".btn-secondary:hover{background:#545b62;}");
  client.println(".button-group{margin-top:15px;}");
  client.println("</style></head>");
  client.println("<body><div class='container'>");
  client.println("<h1>Mystery Box UI</h1>");
  client.println("<form action='/message' method='POST'>");
  client.println("<label>Message: </label><input type='text' name='msg' maxlength='200' placeholder='Enter your message here...'>");
  client.println("<input type='submit' value='Send Message' class='btn btn-primary'>");
  client.println("</form>");

  // Add Back to Time button
  client.println("<div class='button-group'>");
  client.println("<a href='/cleartime' class='btn btn-secondary'>Back to Time Display</a>");
  client.println("</div>");

  client.println("<div style='margin-top:20px;padding:15px;background:#e9ecef;border-radius:5px;'>");
  client.println("<strong>Current status:</strong> ");
  if (showingMessage) {
    client.println("Showing message: \"" + currentMessage + "\"");
  } else {
    client.println("Showing Tehran time and date");
  }

  client.println("<br>");
  client.println("<strong>Current Tehran Time:</strong> " + timeClient.getFormattedTime() + "<br>");
  client.println("<strong>Web Controls:</strong><br>");
  client.println("Send Message: Display a new message on the LCD<br>");
  client.println("Back to Time Display: Clear message and return to time/date display");
  client.println("</div>");
  client.println("</div></body></html>");
}

void handleClearTimeRequest(WiFiClient client) {
  // Clear the current message and return to time display
  showingMessage = false;
  currentMessage = "";
  scrollingMessage = false;
  scrollPosition = 0;
  newMessageFlashing = false;
  flashCount = 0;

  Serial.println("Message cleared via web interface - returning to time display");

  // Send response
  client.println("HTTP/1.1 200 OK");
  client.println("Content-Type: text/html");
  client.println("Connection: close");
  client.println();

  client.println("<html><head><style>body{font-family:Arial;margin:40px;background:#f0f0f0;}</style></head>");
  client.println("<body><div style='background:white;padding:30px;border-radius:10px;text-align:center;'>");
  client.println("<h1>Back to Time Display!</h1>");
  client.println("<p>Your Arduino is now showing the Tehran time and date.</p>");
  client.println("<a href='/' style='background:#007bff;color:white;padding:10px 20px;text-decoration:none;border-radius:5px;'>Return to Main Page</a>");
  client.println("</div></body></html>");
}

void handleMessagePost(WiFiClient client, String httpRequest) {
  // Debug: Print the entire HTTP request
  Serial.println("=== HTTP Request ===");
  Serial.println(httpRequest);
  Serial.println("=== End Request ===");

  // Extract message from POST data
  int bodyStart = httpRequest.indexOf("\r\n\r\n");
  if (bodyStart < 0) {
    Serial.println("No body found in request");
    return;
  }
  bodyStart += 4;
  String postData = httpRequest.substring(bodyStart);

  Serial.println("POST Data: '" + postData + "'");
  Serial.println("POST Data length: " + String(postData.length()));

  // Parse form data (msg=your_message)
  String newMessage = "";
  int msgStart = postData.indexOf("msg=");
  if (msgStart >= 0) {
    msgStart += 4;  // Skip "msg="
    int msgEnd = postData.indexOf("&", msgStart);
    if (msgEnd < 0) msgEnd = postData.length();

    newMessage = postData.substring(msgStart, msgEnd);
    Serial.println("Raw message: '" + newMessage + "'");

    newMessage = urlDecode(newMessage);
    Serial.println("Decoded message: '" + newMessage + "'");

    newMessage.trim();
    Serial.println("Trimmed message: '" + newMessage + "'");
  } else {
    Serial.println("No 'msg=' found in POST data");
  }

  // Send response
  client.println("HTTP/1.1 200 OK");
  client.println("Content-Type: text/html");
  client.println("Connection: close");
  client.println();

  if (newMessage.length() > 0) {
    currentMessage = newMessage;
    // New message flashing
    newMessageFlashing = true;
    flashStartTime = millis();
    flashCount = 0;

    Serial.println("New message received: " + currentMessage);

    client.println("<html><head><style>body{font-family:Arial;margin:40px;background:#f0f0f0;}</style></head>");
    client.println("<body><div style='background:white;padding:30px;border-radius:10px;text-align:center;'>");
    client.println("<h1>Message Sent Successfully!</h1>");
    client.println("<p><strong>Message:</strong> " + currentMessage + "</p>");
    client.println("<p>Your Arduino is now blinking 5 times and will display the message.</p>");
    client.println("<a href='/' style='background:#007bff;color:white;padding:10px 20px;text-decoration:none;border-radius:5px;'>Return to Main Page</a>");
    client.println("</div></body></html>");
  } else {
    client.println("<html><body><h1>Error: Empty message</h1><a href='/'>Go Back</a></body></html>");
  }
}

String urlDecode(String input) {
  String decoded = "";
  for (int i = 0; i < input.length(); i++) {
    if (input.charAt(i) == '+') {
      decoded += ' ';
    } else if (input.charAt(i) == '%' && i + 2 < input.length()) {
      String hex = input.substring(i + 1, i + 3);
      decoded += (char)strtol(hex.c_str(), NULL, 16);
      i += 2;
    } else {
      decoded += input.charAt(i);
    }
  }
  return decoded;
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
      }
    }
  }

  lastButtonState = currentButtonState;
}

void handleLongPress() {
  if (showingMessage) {
    showingMessage = false;
    currentMessage = "";
    scrollingMessage = false;
    scrollPosition = 0;
    newMessageFlashing = false;
    flashCount = 0;
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
      lcd.backlight();
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

      // Restore backlight
      lcd.backlight();

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
  if (millis() - lastUpdate < 1000) return;  // Update only once per second

  // Force time update if it hasn't been updated recently
  static unsigned long lastForceUpdate = 0;
  if (millis() - lastForceUpdate > 60000) {  // Force update every minute
    timeClient.update();
    lastForceUpdate = millis();
  }

  lcd.clear();

  // Get current epoch time
  unsigned long epochTime = timeClient.getEpochTime();

  // Check if we have valid time (after year 2000)
  if (epochTime < 946684800) {
    // No valid time, show error message
    lcd.setCursor(0, 0);
    lcd.print("Time Not Synced");
    lcd.setCursor(0, 1);
    lcd.print("Check Internet");
    lastUpdate = millis();
    return;
  }

  // Get current time using NTPClient's built-in functions
  String timeString = timeClient.getFormattedTime();

  // Calculate days since epoch
  unsigned long days = epochTime / 86400UL;

  // Calculate current date (simplified algorithm)
  int year = 1970;
  int month = 1;
  int day = 1;

  // Account for leap years
  while (days >= 365) {
    bool isLeapYear = (year % 4 == 0 && year % 100 != 0) || (year % 400 == 0);
    int daysInYear = isLeapYear ? 366 : 365;

    if (days >= daysInYear) {
      days -= daysInYear;
      year++;
    } else {
      break;
    }
  }

  // Days in each month
  int daysInMonth[] = { 31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31 };

  // Adjust February for leap year
  bool isLeapYear = (year % 4 == 0 && year % 100 != 0) || (year % 400 == 0);
  if (isLeapYear) {
    daysInMonth[1] = 29;
  }

  // Calculate month and day
  for (int i = 0; i < 12; i++) {
    if (days >= daysInMonth[i]) {
      days -= daysInMonth[i];
      month++;
    } else {
      break;
    }
  }
  day = days + 1;

  // Display time on top line (HH:MM:SS) - centered
  lcd.setCursor(4, 0);
  lcd.print(timeString);

  // Display date on bottom line (DD/MM/YYYY) - centered
  lcd.setCursor(3, 1);
  if (day < 10) lcd.print("0");
  lcd.print(day);
  lcd.print("/");
  if (month < 10) lcd.print("0");
  lcd.print(month);
  lcd.print("/");
  lcd.print(year);

  lastUpdate = millis();
}

void displayMessage() {
  static String lastDisplayedMessage = "";
  static bool lastScrollingState = false;
  static bool messageDisplayed = false;

  // Only clear screen if message changed or scrolling state changed
  if (currentMessage != lastDisplayedMessage || scrollingMessage != lastScrollingState) {
    lcd.clear();
    lcd.setCursor(0, 0);
    lcd.print("Message:");
    lastDisplayedMessage = currentMessage;
    lastScrollingState = scrollingMessage;
    messageDisplayed = false;
  }

  if (!scrollingMessage) {
    // Static message (16 characters or less) - display once
    if (!messageDisplayed) {
      lcd.setCursor(0, 1);
      lcd.print("                ");  // Clear line
      lcd.setCursor(0, 1);
      lcd.print(currentMessage);
      messageDisplayed = true;
    }
  } else {
    // Scrolling message
    if (millis() - lastScrollTime >= SCROLL_SPEED) {
      lcd.setCursor(0, 1);

      // Create display window
      String displayText = "";
      for (int i = 0; i < 16; i++) {
        int charIndex = (scrollPosition + i) % (currentMessage.length() + 4);  // +4 for spacing
        if (charIndex < currentMessage.length()) {
          displayText += currentMessage.charAt(charIndex);
        } else {
          displayText += " ";  // Add spaces between loops
        }
      }

      lcd.print(displayText);

      scrollPosition++;
      if (scrollPosition >= currentMessage.length() + 4) {
        scrollPosition = 0;  // Reset for continuous loop
      }

      lastScrollTime = millis();
    }
  }
}