import os
import random
import time
from datetime import datetime, timezone

import requests
from dotenv import load_dotenv

load_dotenv()

API_KEY = os.getenv("FIREBASE_API_KEY", "").strip()
DATABASE_URL = os.getenv("FIREBASE_DATABASE_URL", "").rstrip("/")
DEVICE_ID = os.getenv("DEVICE_ID", "ev-sim-001")
SCENARIO = os.getenv("SCENARIO", "normal").lower()
CAPACITY_AH = float(os.getenv("BATTERY_CAPACITY_AH", "60"))
INTERVAL = max(1, float(os.getenv("INTERVAL_SECONDS", "2")))

if not API_KEY or not DATABASE_URL:
    raise SystemExit("Set FIREBASE_API_KEY and FIREBASE_DATABASE_URL in simulator/.env")
if SCENARIO not in {"normal", "hot", "low_voltage", "high_current"}:
    raise SystemExit("SCENARIO must be normal, hot, low_voltage, or high_current")

session = requests.Session()
id_token = None
refresh_token = None
token_expiry = 0


def authenticate():
    """Sign in with Firebase Anonymous Authentication using the Identity Toolkit REST API."""
    global id_token, refresh_token, token_expiry
    url = f"https://identitytoolkit.googleapis.com/v1/accounts:signUp?key={API_KEY}"
    response = session.post(url, json={"returnSecureToken": True}, timeout=15)
    if not response.ok:
        raise RuntimeError(f"Firebase anonymous sign-in failed ({response.status_code}): {response.text}")
    data = response.json()
    id_token = data["idToken"]
    refresh_token = data.get("refreshToken")
    token_expiry = time.time() + int(data.get("expiresIn", "3600")) - 60
    print("Authenticated anonymously with Firebase.")


def ensure_token():
    if not id_token or time.time() >= token_expiry:
        authenticate()


def write_json(path, payload, method="put"):
    ensure_token()
    url = f"{DATABASE_URL}/{path}.json"
    response = session.request(
        method.upper(), url, params={"auth": id_token}, json=payload, timeout=15
    )
    if response.status_code in (401, 403):
        authenticate()
        response = session.request(
            method.upper(), url, params={"auth": id_token}, json=payload, timeout=15
        )
    if not response.ok:
        raise RuntimeError(f"Realtime Database write failed ({response.status_code}): {response.text}")
    return response.json() if response.text else None


def make_reading(previous_soc):
    jitter = lambda amount: random.uniform(-amount, amount)
    voltage = 360 + jitter(8)
    current = 42 + jitter(12)
    temperature = 31 + jitter(4)

    if SCENARIO == "hot":
        temperature = 57 + jitter(5)
    elif SCENARIO == "low_voltage":
        voltage = 292 + jitter(9)
    elif SCENARIO == "high_current":
        current = 112 + jitter(18)

    soc = max(10.0, min(100.0, previous_soc - random.uniform(0.012, 0.032)))
    power = voltage * current / 1000.0
    alerts = []
    if temperature >= 50:
        alerts.append("High battery temperature")
    if voltage <= 310:
        alerts.append("Low battery voltage")
    if current >= 100:
        alerts.append("High current")

    return {
        "timestamp": int(time.time() * 1000),
        "timestampIso": datetime.now(timezone.utc).isoformat(),
        "deviceId": DEVICE_ID,
        "voltage": round(voltage, 1),
        "current": round(current, 1),
        "temperature": round(temperature, 1),
        "power": round(power, 2),
        "soc": round(soc, 1),
        "alerts": alerts,
        "scenario": SCENARIO,
        "simulated": True,
    }


def main():
    print(f"EV telemetry simulator starting: device={DEVICE_ID}, scenario={SCENARIO}")
    print("All telemetry values are simulated. Press Ctrl+C to stop.")
    soc = 78.0
    try:
        authenticate()
        while True:
            reading = make_reading(soc)
            soc = reading["soc"]
            # Store current state and append immutable history record.
            write_json("evMonitor/latest", reading, "put")
            write_json("evMonitor/readings", reading, "post")
            alert_text = ", ".join(reading["alerts"]) if reading["alerts"] else "none"
            print(
                f'{datetime.now().strftime("%H:%M:%S")} | '
                f'{reading["voltage"]} V | {reading["current"]} A | '
                f'{reading["temperature"]} °C | SOC {reading["soc"]}% | alerts: {alert_text}'
            )
            time.sleep(INTERVAL)
    except KeyboardInterrupt:
        print("\nSimulator stopped.")
    except requests.RequestException as exc:
        raise SystemExit(f"Network error while contacting Firebase: {exc}") from exc
    except RuntimeError as exc:
        raise SystemExit(str(exc)) from exc


if __name__ == "__main__":
    main()
