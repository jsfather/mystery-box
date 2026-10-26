#!/bin/sh
set -eu
: "${MQTT_SERVER_PASSWORD:?Set MQTT_SERVER_PASSWORD}"
: "${MQTT_DEVICE_PASSWORD:?Set MQTT_DEVICE_PASSWORD}"
: "${DEVICE_ID:=uno-r4}"
case "$DEVICE_ID" in *[!a-zA-Z0-9_-]*|'') echo 'Invalid DEVICE_ID' >&2; exit 1;; esac
[ "${#DEVICE_ID}" -le 32 ] || exit 1
[ "${#MQTT_SERVER_PASSWORD}" -ge 16 ] && [ "${#MQTT_DEVICE_PASSWORD}" -ge 16 ] || { echo 'MQTT passwords must contain at least 16 characters' >&2; exit 1; }
umask 077
mkdir -p /mosquitto/generated
# Passwords remain environment variables; never enable shell tracing here.
mosquitto_passwd -b -c /mosquitto/generated/passwords server "$MQTT_SERVER_PASSWORD"
mosquitto_passwd -b /mosquitto/generated/passwords device "$MQTT_DEVICE_PASSWORD"
cat > /mosquitto/generated/acl <<ACL
user server
topic write mystery-box/$DEVICE_ID/frame
topic write mystery-box/$DEVICE_ID/matrix
topic write mystery-box/$DEVICE_ID/game
topic read mystery-box/$DEVICE_ID/game/state
topic read mystery-box/$DEVICE_ID/status
topic read mystery-box/$DEVICE_ID/hello
user device
topic read mystery-box/$DEVICE_ID/frame
topic read mystery-box/$DEVICE_ID/matrix
topic read mystery-box/$DEVICE_ID/game
topic write mystery-box/$DEVICE_ID/game/state
topic write mystery-box/$DEVICE_ID/status
topic write mystery-box/$DEVICE_ID/hello
ACL
cat > /mosquitto/generated/mosquitto.conf <<CONF
allow_anonymous false
password_file /mosquitto/generated/passwords
acl_file /mosquitto/generated/acl
persistence false
log_dest stdout
log_type error
log_type warning
message_size_limit 1280
max_queued_messages 1
max_inflight_messages 1
listener 1883
CONF
chown -R mosquitto:mosquitto /mosquitto/generated
exec mosquitto -c /mosquitto/generated/mosquitto.conf
