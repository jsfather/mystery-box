# Deploy on Dokploy — automatic certificates

Dokploy’s existing Traefik proxy issues and renews certificates for both connections:

| Purpose | Hostname | Public connection | Internal destination |
| --- | --- | --- | --- |
| Dashboard / iPhone PWA | `clock.example.com` | HTTPS, port 443 | `app:3000` |
| Arduino | `mqtt.example.com` | MQTT over TLS, port 443 | `broker:1883` |

Use **two different hostnames**, pointing to the same server. Traefik uses the hostname in the TLS handshake (SNI) to select the MQTT TCP router; other domains continue through the normal HTTPS routers. The Arduino keeps native MQTT. It does not need WebSockets or extra networking libraries.

There is **no `MQTT_CERT_DIR`, certificate folder, private-key mount, renewal hook, or public port 8883** in this deployment. Certificate storage and renewal belong to Dokploy’s Traefik, just like your other HTTPS projects. The MQTT router explicitly uses that same certificate resolver.

## 1. Select the Compose file

Connect this Git repository to a **Docker Compose** service in Dokploy and set its Compose path to:

```text
compose.dokploy.yaml
```

This is a complete deployment entry point. It inherits the shared services from `compose.yaml`, attaches the broker to Dokploy’s proxy network, and supplies the MQTT TLS routing labels. Keep both files and `broker/start.sh` in the Git checkout. Use Docker Compose, not Docker Stack/Swarm mode (`extends` is a Compose feature).

Set these environment variables in Dokploy:

```dotenv
ADMIN_USERNAME=husband
ADMIN_NAME=Your name
ADMIN_PASSWORD=<independent-random-password-at-least-16-characters>
PARTNER_USERNAME=wife
PARTNER_NAME=Her name
PARTNER_PASSWORD=<another-independent-password-at-least-16-characters>
MQTT_SERVER_PASSWORD=<different-random-password-at-least-16-characters>
MQTT_DEVICE_PASSWORD=<different-random-password-at-least-16-characters>
DEVICE_ID=uno-r4
APP_ORIGIN=https://clock.example.com
MQTT_DOMAIN=mqtt.example.com
```

Account variables initialize an empty database only; existing accounts are managed from **You & me**. `PARTNER_PASSWORD` may be omitted if you want to create her account from the UI. See [the shared setup guide](our-story.md).

Generate each password separately with `openssl rand -hex 24`. The device uses only the device password. The server account password stays on the server. Do not paste rendered Compose output containing interpolated secrets into a public issue or commit.

If you previously used the manual-certificate configuration, switch from `compose.yaml` + `compose.tls.yaml` to **`compose.dokploy.yaml`**, remove `MQTT_CERT_DIR`, add `MQTT_DOMAIN`, and update the firmware port from 8883 to 443. Keep the same Dokploy project and its `app-data` volume to preserve accounts, notes and settings. The old manual-certificate override has been removed.

## 2. Dashboard domain

Point `clock.example.com` at the server. In Dokploy **Domains**, add:

- Host: `clock.example.com`
- Service: **app**
- Container port: **3000**
- HTTPS / Let’s Encrypt: enabled
- HTTP → HTTPS redirect: enabled

`APP_ORIGIN` must match the browser origin exactly, with scheme and without a trailing slash. One trusted proxy hop is configured for Dokploy. Keep `/api/events` unbuffered; the server sends `X-Accel-Buffering: no`. No application HTTP host port needs publishing.

## 3. MQTT domain — managed automatically

Create the DNS record `mqtt.example.com` pointing to the same server. Set `MQTT_DOMAIN=mqtt.example.com` in Dokploy and deploy. **Do not add this hostname to Dokploy’s HTTP Domains tab.** Its TCP router and certificate request are already defined by the Compose labels.

The configuration uses stock Dokploy defaults:

```dotenv
DOKPLOY_NETWORK=dokploy-network
TRAEFIK_HTTPS_ENTRYPOINT=websecure
TRAEFIK_CERT_RESOLVER=letsencrypt
MQTT_ROUTER_NAME=mystery-box-mqtt
```

You normally do not need to set these. If your Dokploy proxy was customized, use its actual network, entrypoint and resolver names. If you deploy multiple copies behind one proxy, give each its own `MQTT_ROUTER_NAME` and MQTT hostname. Dokploy’s existing Traefik instance must be running; this project does not create a second proxy or certificate issuer.

Traefik terminates MQTT TLS on its existing TCP port **443** and forwards the decrypted MQTT stream to the private broker on port 1883. The broker retains password authentication and topic ACLs. Do not publish 1883 or add a host mapping for 443 to the app/broker; Traefik already owns the public port.

Public DNS and your existing ACME challenge path must work, just as for other Dokploy domains. With stock HTTP-01 validation, ports 80 and 443 must reach Dokploy. If using Cloudflare DNS, make the **MQTT hostname DNS-only (grey cloud)**: its ordinary HTTP proxy does not carry native MQTT. The dashboard may use your normal HTTP proxy setup. A dedicated non-HTTP proxy such as Spectrum would require separate configuration.

Firmware configuration:

```cpp
#define MQTT_HOST "mqtt.example.com"
#define MQTT_PORT 443
#define MQTT_TLS 1
#define MQTT_USERNAME "device"
#define MQTT_PASSWORD "your-device-password"
#define MQTT_ROOT_CA ""
```

Use the **hostname**, not a server IP, because TLS routing and certificate verification depend on it. Update the UNO R4 WiFi connectivity firmware so its CA trust bundle recognizes your public CA. Leaving `MQTT_ROOT_CA` empty uses the modem’s default trust bundle; this is independent of Dokploy managing the server certificate. Do not disable certificate verification.

The MQTT hostname is a native MQTT endpoint, not a webpage. For a TLS diagnostic:

```sh
openssl s_client -connect mqtt.example.com:443 -servername mqtt.example.com -verify_return_error </dev/null
```

For the simulator, set `SIMULATOR_MQTT_URL=mqtts://mqtt.example.com:443`. Keep the host’s system time synchronized with NTP.

## 4. Verify

- Visit the HTTPS dashboard and sign in.
- Confirm `GET /healthz` returns `{"ok":true}`. This means the HTTP process is alive; it deliberately does not claim hardware is online.
- The Connection page should report the broker as connected.
- Upload the firmware; the hardware becomes online after fresh telemetry.
- Send a message, switch the backlight, change timezone, and play an animation.
- Disconnect Wi-Fi: after about three seconds the LCD returns to its local RTC clock. Reconnect and confirm the current server view replaces it.

Browser preview is the server’s intended frame, **not a hardware screenshot or guaranteed receipt**. Telemetry reports a received frame sequence every 15 seconds. Status becomes offline after 45 seconds without a fresh heartbeat, or earlier when the broker sends the device’s last will.

## Persistent data and updates

Keep the `app-data` named volume across redeploys. It stores settings, the full message archive, accounts, hashed sessions, and the activity journal. Do not use `docker compose down -v` unless you intend to delete this data. Sessions are stored as token hashes, last up to 30 days, and survive restarts. Password resets, disabling an account, or signing out revoke the affected sessions. Broker persistence is deliberately disabled: it has no business data, and retaining old animation/message frames would be wrong.

Back up SQLite through its backup API or stop the app before copying the entire data directory, including WAL files. A consistent copy of only a live `.sqlite` file is not guaranteed. Treat the backup as private: message text, names and your special date are stored unencrypted. Passwords are scrypt hashes; sessions are token hashes. Restore with the app stopped, preserving ownership for the Node user (UID 1000).

Deploy one app replica. Rolling two replicas simultaneously would create competing frame publishers and separate in-memory rate limits. Use stop/start replacement for this single-device setup. MQTT clients reconnect automatically after broker or app restarts.

Rotate credentials by updating Dokploy environment variables, redeploying the broker/app, and updating the device secrets and sketch. Rotating only the device credential does not require changing the administrator password.

## Validation

The production build and 30 automated tests pass. Deployment checks resolve the Dokploy Compose file and verify the TCP routing labels, certificate resolver, private ports and configurable proxy names. An isolated Traefik test also verified dashboard HTTPS and native MQTT TLS on the same listener, including strict certificate verification and MQTT password rejection. That local test used disposable certificates; live Let’s Encrypt issuance requires your real DNS and Dokploy server and was not performed here.

## References

- [Dokploy Compose domain management](https://docs.dokploy.com/docs/core/docker-compose/domains)
- [Dokploy’s default network, entrypoint and certificate resolver](https://docs.dokploy.com/docs/core/docker-compose/example)
- [Traefik TCP TLS termination and automatic ACME certificates](https://doc.traefik.io/traefik/reference/routing-configuration/tcp/tls/)
- [Sharing an entrypoint between TCP and HTTP routers](https://doc.traefik.io/traefik/reference/routing-configuration/tcp/routing/router/)
- [Docker Compose service inheritance](https://docs.docker.com/compose/how-tos/multiple-compose-files/extends/)

The iPhone PWA uses the dashboard’s HTTPS domain. Do not add proxy rules that cache `/api/*`; private API responses use `Cache-Control: no-store`.
