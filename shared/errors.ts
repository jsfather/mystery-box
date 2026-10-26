export const deviceErrors = [
  {
    code: "E1",
    meaning: "LCD initialization or write failed",
    remedy:
      "Check the LCD power, SDA/A4 and SCL/A5 wiring. Run I2CexpDiag, then restart the box.",
  },
  {
    code: "E2",
    meaning: "RTC initialization or time sync failed",
    remedy:
      "Restart the board and check the UNO R4 board package. Network time may still work.",
  },
  {
    code: "E3",
    meaning: "MQTT buffer allocation failed",
    remedy:
      "Restart the board. If it repeats, reflash the firmware and check available memory.",
  },
  {
    code: "E4",
    meaning: "Wi-Fi disconnected",
    remedy:
      "Check router power, signal and Wi-Fi credentials. The box retries automatically.",
  },
  {
    code: "E5",
    meaning: "Broker connection or subscription failed",
    remedy:
      "Check broker availability, hostname, port, TLS certificate and device credentials. The box retries automatically.",
  },
  {
    code: "E6",
    meaning: "Display updates have stopped",
    remedy:
      "No valid display frame for five seconds. Check that the server is running and uses the same device ID. Local time continues.",
  },
  {
    code: "E7",
    meaning: "Invalid display command",
    remedy:
      "The box rejected an invalid or oversized display payload. Check server and firmware versions. A valid frame clears this code.",
  },
  {
    code: "E8",
    meaning: "Invalid matrix program",
    remedy:
      "The box rejected a matrix program. Save the matrix settings again and check firmware compatibility. A valid program clears this code.",
  },
] as const;
export function errorLabel(code: unknown) {
  return (
    deviceErrors.find((entry) => entry.code === code)?.meaning ?? "Unknown device error"
  );
}
