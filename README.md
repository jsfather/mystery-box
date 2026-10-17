# Mystery Box

A shared love clock and little messaging world for **Arduino UNO R4 WiFi + a 1602 I²C LCD**. Includes the Arduino sketch, a responsive control room, an authenticated API, a private MQTT broker, persistent SQLite storage, a hardware simulator, and Docker Compose files for Dokploy.

The server supplies calendar dates, settings, message scrolling and matrix frames over MQTT. The Arduino ticks its clock and love counter locally and animates a complete heart with a two-pulse rhythm, so network delays cannot replay seconds or heartbeats. Clock corrections are gradual, and both keep running during outages while powered. No external RTC module is needed.

## For the two of you

Start with [your shared story, accounts and iPhone installation](docs/our-story.md). Save the exact second your love began, give each of you a separate account, and keep every little note in your shared archive.

## What you can do

- Set your relationship’s exact starting date, time, seconds and timezone. Show elapsed days/hours/minutes/seconds on the dashboard and LCD, or alternate with the clock.
- Use separate accounts with equal settings and user-management access. Create/edit accounts, change/reset passwords, and disable access.
- Keep a searchable, sender-attributed message archive and persistent activity journal.
- Install the PWA on an iPhone Home Screen from Safari over HTTPS.
- Choose **Jalali/Persian or Gregorian** dates, three date orders, any IANA timezone, 12/24-hour time, and seconds.
- Switch the LCD backlight on/off without stopping the clock.
- Chat in a shared conversation with named, two-sided bubbles. Notes remain saved after their LCD display windows end.
- Queue up to 20 timed messages, shown for two minutes by default. Choose a full-screen message or live time above a scrolling message, and change the default duration in Preferences.
- Set story windows (for example, 30 seconds every 10 minutes), switch display modes from the dashboard, and choose days/time, total seconds, days, weeks, hours or a rotating counter.
- Follow the device theme automatically or choose light/dark appearance. Timezones use dropdowns throughout.
- Restore factory display settings with password confirmation, optionally erasing personal message and journal history while keeping accounts.
- Play heart, wave, and rain animations; scroll Latin text; draw and sequence up to 32 custom matrix frames.
- See the server’s intended output live, plus device heartbeat, signal strength, IP, firmware, and last frame reported.
- Keep settings, message history, accounts, sessions and activity across server restarts.

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

4. Open [localhost:3000](http://localhost:3000), sign in using `ADMIN_USERNAME` (default `husband`) and `ADMIN_PASSWORD`. Optionally set `PARTNER_PASSWORD` before the first launch to create both accounts, or create her account from **You & me**.

By default HTTP and plaintext MQTT bind to loopback. To connect a physical board on a **trusted local network**, set `MQTT_BIND_ADDRESS` in `.env` to your computer’s LAN IP and restart Compose. Set the firmware’s `MQTT_HOST` to that LAN IP, `MQTT_TLS` to `0`, and `MQTT_PORT` to `1883`. Do not publish plaintext MQTT to the internet. For public deployment use Dokploy’s automatic TLS setup in [docs/deployment.md](docs/deployment.md).

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
5. Production: use `MQTT_TLS 1`, port `443`, and the dedicated `MQTT_DOMAIN` hostname. Update the UNO R4 WiFi connectivity firmware using Arduino IDE’s Firmware Updater. The default CA bundle is used unless you supply a PEM root CA through `MQTT_ROOT_CA`. Never disable certificate verification to fix a connection problem.
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

The simulator authenticates with the MQTT **device** account, subscribes to real MQTT frames, prints the LCD, and publishes heartbeats. It is not a substitute for electrical or on-device testing. Stop it before powering the real board; otherwise its telemetry would share the same device topic. To use a public TLS broker, set `SIMULATOR_MQTT_URL=mqtts://mqtt.example.com:443`.

## Deployment and architecture

For Dokploy, select **`compose.dokploy.yaml`**. Add the dashboard domain to `app:3000`, and set a separate `MQTT_DOMAIN` (for example `mqtt.example.com`) pointing to the same server. The included Traefik TCP router reuses Dokploy’s automatic certificate resolver on port 443. You do not need a certificate directory or manual renewal. See the deployment guide below.


- [Dokploy automatic certificates, persistent data and backups](docs/deployment.md)
- [Architecture, MQTT protocol, outage behavior and research](docs/architecture.md)

This is a shared-owner, single-device, single-server application. Run **one app replica** against its SQLite volume and one configured device. Add per-device identities, storage, and broker ACLs before using it for a fleet.

## Verification

`npm run check` checks TypeScript, the production frontend build and the automated test suite. `npm run test:integration` additionally checks real MQTT traffic against an **isolated disposable** stack; supply `TEST_ENV_FILE`, `TEST_HTTP_URL` and `TEST_MQTT_URL` when using addresses other than the verification defaults in that script. Never run it against your physical board or production data: it changes settings and sends messages.

Docker image build, local Compose startup, browser sign-in/message controls, native MQTT frame delivery, topic ACLs, invalid-password rejection, last-will status, TLS certificate acceptance/rejection and Traefik sharing one TLS listener between HTTPS and MQTT were checked locally. The actual UNO/LCD have not been connected here. Local Arduino compilation was blocked by HTTP 403 responses from Arduino’s package download service. A firmware compile job is included in `.github/workflows/ci.yml`; run it or compile in Arduino IDE before uploading.

Version 1.1 adds the shared love clock, equal-owner accounts, permanent note history, the activity journal and the iPhone PWA. See [Our story](docs/our-story.md) for first setup and upgrade details. The automated suite currently has 36 tests; actual iPhone installation and firmware behavior still require the real devices.
