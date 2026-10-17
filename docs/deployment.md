# Deploy on Dokploy

The deployment has two services: `app` (dashboard/API, port 3000) and `broker` (Mosquitto). SQLite lives in a named `app-data` volume. MQTT port 1883 is internal; internet devices use TLS on 8883.

## 1. Create a Compose project

Connect this Git repository to a new **Docker Compose** service in Dokploy. Use `compose.yaml` together with `compose.tls.yaml`. If your Dokploy version accepts only one Compose path, generate the combined file locally and paste it into Dokploy’s Compose editor:

```sh
docker compose -f compose.yaml -f compose.tls.yaml config --no-interpolate
```

Do not commit the rendered configuration with interpolated secrets. The repository’s `broker/start.sh` must be present in the checkout; the base Compose file bind-mounts it.

Configure environment variables in Dokploy:

```dotenv
ADMIN_PASSWORD=<independent-random-password-at-least-16-characters>
MQTT_SERVER_PASSWORD=<different-random-password-at-least-16-characters>
MQTT_DEVICE_PASSWORD=<different-random-password-at-least-16-characters>
DEVICE_ID=uno-r4
APP_ORIGIN=https://clock.example.com
MQTT_CERT_DIR=/opt/mystery-box/certs
```

Generate each password separately with `openssl rand -hex 24`. Use the device password only in the firmware. Keep the server password on the server. The app deliberately refuses an insecure production origin/cookie configuration.

## 2. Dashboard domain

Point `clock.example.com` at your server. In Dokploy **Domains**, add the domain to service **app**, container port **3000**, enable HTTPS and redirect HTTP to HTTPS. The application listens on `0.0.0.0`. It does not need a host-published HTTP port. Do not route the domain to the broker.

`APP_ORIGIN` must exactly match the browser origin, with scheme and without a trailing slash. One trusted proxy hop is configured for Dokploy. If you add more proxies, review `TRUST_PROXY` rather than trusting arbitrary forwarded headers. Keep `/api/events` unbuffered: the app sends `X-Accel-Buffering: no`. The browser and API share the same origin.

## 3. MQTT TLS endpoint

Point `mqtt.example.com` at the same server. Permit **TCP 8883** in your firewall. An HTTP domain rule in Dokploy does **not** automatically configure a native MQTT TLS endpoint or provide certificates to Mosquitto. The override publishes 8883 directly and Mosquitto terminates TLS.

Provision a certificate for **mqtt.example.com** with your existing ACME/certificate tooling. A DNS-01 challenge avoids conflicts with Dokploy’s HTTP proxy. Put these files in `MQTT_CERT_DIR` on the Docker host:

```text
/opt/mystery-box/certs/fullchain.pem
/opt/mystery-box/certs/privkey.pem
```

Mount real files, not symlinks whose targets lie outside the mounted directory. Grant the Mosquitto container user (UID/GID **1883** in the selected image) read permission on the key and certificate and traversal permission on directories. For example, a root-owned directory group-readable by GID 1883 with mode 750 and a key mode 640. Do not make the private key world-readable. The broker exits with a clear error if certificates cannot be read.

Renew the certificate before expiry, copy renewed files atomically into this directory with the correct ownership, then restart/redeploy the **broker** so it reloads them. Configure a renewal hook in your certificate manager. The included Compose setup consumes certificates; it does not issue or renew them.

Firmware settings:

```cpp
#define MQTT_HOST "mqtt.example.com"
#define MQTT_PORT 8883
#define MQTT_TLS 1
#define MQTT_USERNAME "device"
#define MQTT_PASSWORD "your-device-password"
```

Use a public CA supported by the updated WiFiS3 connectivity firmware, or put your private root CA PEM in `MQTT_ROOT_CA`. The broker’s full chain must match the configured DNS hostname. Never expose port 1883 publicly.

Optional TLS diagnostic on your own machine:

```sh
openssl s_client -connect mqtt.example.com:8883 -servername mqtt.example.com -verify_return_error </dev/null
```

Keep the host time synchronized (e.g. chrony/systemd-timesyncd); the server’s system clock is the time authority.

## 4. Verify

- Visit the HTTPS dashboard and sign in.
- Confirm `GET /healthz` returns `{"ok":true}`. This means the HTTP process is alive; it deliberately does not claim hardware is online.
- The Connection page should report the broker as connected.
- Upload the firmware; the hardware becomes online after fresh telemetry.
- Send a message, switch the backlight, change timezone, and play an animation.
- Disconnect Wi-Fi: after about three seconds the LCD returns to its local RTC clock. Reconnect and confirm the current server view replaces it.

Browser preview is the server’s intended frame, **not a hardware screenshot or guaranteed receipt**. Telemetry reports a received frame sequence every 15 seconds. Status becomes offline after 45 seconds without a fresh heartbeat, or earlier when the broker sends the device’s last will.

## Persistent data and updates

Keep the `app-data` named volume across redeploys. It stores settings and the last 100 message records. Do not use `docker compose down -v` unless you intend to delete this data. Sessions are memory-only; a restart signs administrators out. Broker persistence is deliberately disabled: it has no business data, and retaining old animation/message frames would be wrong.

Back up SQLite through its backup API or stop the app before copying the entire data directory, including WAL files. A consistent copy of only a live `.sqlite` file is not guaranteed. Treat the backup as private: message text is stored unencrypted. Restore with the app stopped, preserving ownership for the Node user (UID 1000).

Deploy one app replica. Rolling two replicas simultaneously would create competing frame publishers and independent sessions. Use stop/start replacement for this single-device setup. MQTT clients reconnect automatically after broker or app restarts.

Rotate credentials by updating Dokploy environment variables, redeploying the broker/app, and updating the device secrets and sketch. Rotating only the device credential does not require changing the administrator password.

## References

- [Dokploy Compose domains and Traefik](https://docs.dokploy.com/docs/core/troubleshooting/domains)
- [Dokploy domain configuration](https://docs.dokploy.com/docs/core/domains)
- [Mosquitto configuration: TLS, passwords and topic ACLs](https://mosquitto.org/man/mosquitto-conf-5.html)
