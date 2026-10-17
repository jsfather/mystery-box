# Mystery Box

A server-driven desk clock for **Arduino UNO R4 WiFi + a 1602 I²C LCD**. Includes the Arduino sketch, a responsive control room, an authenticated API, a private MQTT broker, persistent SQLite storage, a hardware simulator, and Docker Compose files for Dokploy.

The server renders the date, time, message scrolling, and 12×8 matrix animation. The Arduino receives compact display frames over MQTT and uses its onboard RTC when the connection drops. No external RTC module is needed.

## What you can do

- Choose **Jalali/Persian or Gregorian** dates, three date orders, any IANA timezone, 12/24-hour time, and seconds.
- Switch the LCD backlight on/off without stopping the clock.
- Queue up to 20 timed messages. Short messages use both rows; messages longer than 32 characters scroll.
- Play heart, wave, and rain animations; scroll Latin text; draw and sequence up to 32 custom matrix frames.
- See the server’s intended output live, plus device heartbeat, signal strength, IP, firmware, and last frame reported.
- Keep settings and message windows across server restarts.

**Hardware limitation:** a typical HD44780 1602 display cannot render arbitrary Persian text, shaping, or Persian digits. Jalali dates use Latin digits, with `J` identifying the calendar (`G` for Gregorian). Messages accept printable ASCII. The dashboard itself supports Persian labels. Full Persian messaging needs a graphical OLED/TFT and a suitable font renderer; do not expect it from this LCD.

## Hardware wiring

Disconnect USB/power before wiring.

| LCD backpack | UNO R4 WiFi header |
| --- | --- |
| VCC | 5V |
| GND | GND |
| SDA | A4 / SDA |
| SCL | A5 / SCL |

Use the main UNO headers: the Qwiic connector is a separate **3.3V** I²C bus. Do not attach a typical 5V LCD backpack to Qwiic. The sketch uses `hd44780_I2Cexp`, which detects the common PCF8574 backpack address and pin mapping automatically. Adjust the LCD’s contrast potentiometer if the backlight is on but no text appears. Run the library’s `I2CexpDiag` example for wiring trouble.

The LED matrix is already on the UNO R4 WiFi. No wiring required. Use 2.4 GHz Wi-Fi.

## Run locally with Docker

1. Copy `.env.example` to `.env`.
2. Generate **three independent passwords**, each at least 16 characters, with `openssl rand -hex 24`. Set `ADMIN_PASSWORD`, `MQTT_SERVER_PASSWORD`, and `MQTT_DEVICE_PASSWORD`. For Compose, `MQTT_PASSWORD` in the example is unused; Compose wires the server account automatically.
3. Start:

   ```sh
   docker compose -f compose.yaml -f compose.local.yaml up --build -d
   ```

4. Open [localhost:3000](http://localhost:3000), sign in using `ADMIN_PASSWORD`.

By default HTTP and plaintext MQTT bind to loopback. To connect a physical board on a **trusted local network**, set `MQTT_BIND_ADDRESS` in `.env` to your computer’s LAN IP and restart Compose. Set the firmware’s `MQTT_HOST` to that LAN IP, `MQTT_TLS` to `0`, and `MQTT_PORT` to `1883`. Do not publish plaintext MQTT to the internet. For public deployment use the TLS setup in [docs/deployment.md](docs/deployment.md).

## Upload firmware

1. Install Arduino IDE and the current **Arduino UNO R4 Boards** package. Select **Arduino UNO R4 WiFi**.
2. Install these libraries with Library Manager:

   | Library | Author | Version target |
   | --- | --- | --- |
   | PubSubClient | Nick O’Leary | 2.8 |
   | ArduinoJson | Benoit Blanchon | 7.x |
   | hd44780 | Bill Perry | 1.3.2 |

   `WiFiS3`, `RTC`, and `Arduino_LED_Matrix` are included in the Renesas board core.

3. Open `firmware/mystery_box/mystery_box.ino`.
4. Copy `arduino_secrets.h.example` beside it as `arduino_secrets.h`. Fill in your Wi-Fi, broker hostname, device ID and **device** password. The MQTT username is `device`, not `server`. `DEVICE_ID` must match the server environment.
5. Production: use `MQTT_TLS 1`, port `8883`, and the broker’s certificate hostname. Update the UNO R4 WiFi connectivity firmware using Arduino IDE’s Firmware Updater. The default CA bundle is used unless you supply a PEM root CA through `MQTT_ROOT_CA`. Never disable certificate verification to fix a connection problem.
6. Upload. The board runs without a computer or Serial Monitor attached. Serial diagnostics use **115200 baud**.

For a private root certificate, replace the macro in your untracked secrets file with a raw string:

```cpp
#define MQTT_ROOT_CA R"PEM(-----BEGIN CERTIFICATE-----
YOUR_ROOT_CA_CONTENT
-----END CERTIFICATE-----
)PEM"
```

## Develop the application

Requires Node.js **24+** and an MQTT broker. SQLite uses Node’s built-in `node:sqlite`; no database service or native npm build step is required.

```sh
npm ci
```

For local development set `MQTT_PASSWORD` in `.env` equal to `MQTT_SERVER_PASSWORD`, then:

```sh
# Terminal 1: broker only (exposes loopback 1883)
docker compose -f compose.yaml -f compose.local.yaml up broker -d

# Terminal 2: backend, loads .env without shell evaluation
node --env-file=.env --import tsx --watch server/index.ts

# Terminal 3: dashboard at http://localhost:5173
npm run dev:web
```

Keep `APP_ORIGIN=http://localhost:5173` and `COOKIE_SECURE=false` in `.env` for this Vite workflow. `npm run dev` also runs the backend but expects environment variables to be supplied by the caller. Vite proxies `/api` including server-sent events to the backend.

```sh
npm run check           # TypeScript, production dashboard build, tests
npm run build
node --env-file=.env --import tsx server/index.ts
```

For the last command, when serving the built dashboard at port 3000, change `APP_ORIGIN` to `http://localhost:3000`.

### No board connected yet?

```sh
node --env-file=.env --import tsx scripts/simulate.ts
```

The simulator authenticates with the **device** account, subscribes to real MQTT frames, prints the LCD, and publishes heartbeats. It is not a substitute for electrical or on-device testing. Stop it before powering the real board; otherwise its telemetry would share the same device topic. To use a public TLS broker, set `SIMULATOR_MQTT_URL=mqtts://mqtt.example.com:8883`.

## Deployment and architecture

- [Dokploy, TLS certificates, persistent data and backups](docs/deployment.md)
- [Architecture, MQTT protocol, outage behavior and research](docs/architecture.md)

This is a single-device, single-server application. Run **one app replica** against its SQLite volume and one configured device. Add per-device identities, storage, and broker ACLs before using it for a fleet.

## Verification

`npm run check` checks TypeScript, the production frontend build and 13 automated tests. `npm run test:integration` additionally checks real MQTT traffic against an **isolated disposable** stack; supply `TEST_ENV_FILE`, `TEST_HTTP_URL` and `TEST_MQTT_URL` when using addresses other than the verification defaults in that script. Never run it against your physical board or production data: it changes settings and sends messages.

Docker image build, local Compose startup, browser sign-in/message controls, native MQTT frame delivery, topic ACLs, invalid-password rejection, last-will status and TLS certificate acceptance/rejection were checked locally. The actual UNO/LCD have not been connected here. Local Arduino compilation was blocked by HTTP 403 responses from Arduino’s package download service. A firmware compile job is included in `.github/workflows/ci.yml`; run it or compile in Arduino IDE before uploading.
