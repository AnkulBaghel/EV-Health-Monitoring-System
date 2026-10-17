# IoT-Based Real-Time EV Health Monitoring System (Simulation)

A student demonstration project using a Python telemetry simulator, Firebase Realtime Database, and a React dashboard with live charts and alerts.

**Important:** This project uses simulated data only. It is not a real battery-management system and must not be used to make safety decisions about an actual EV battery.

## Included features
- Live dashboard for voltage, current, power, temperature, and illustrative state of charge (SOC)
- Voltage/current/temperature trend charts
- Latest reading and recent history stored in Firebase Realtime Database
- Alerts for high temperature, low voltage, and high current
- Python simulator scenarios: `normal`, `hot`, `low_voltage`, `high_current`
- Browser-only demo mode if Firebase settings are missing

## 1. Firebase setup
1. In Firebase Console, open your project and ensure the registered Web App matches the supplied configuration.
2. In **Build → Realtime Database**, create a database if you have not already.
3. In **Build → Authentication → Sign-in method**, enable **Anonymous** sign-in.
4. In Realtime Database Rules, use the demo rules below only for a controlled student demo. These rules allow every authenticated user to read and write all data; tighten them before sharing or production use.

```json
{
  "rules": {
    ".read": "auth != null",
    ".write": "auth != null"
  }
}
```

The dashboard and simulator are configured with the Firebase project supplied for this build. The Firebase Web API key is a client identifier, not a password, but database access must be protected with Authentication and Security Rules. If the key was exposed in a public repository, review Firebase/Google Cloud API restrictions and usage.

## 2. Start the React dashboard (Windows PowerShell)
```powershell
cd dashboard
npm install
Copy-Item .env.example .env
npm run dev
```

Open the local URL printed by Vite, usually `http://localhost:5173`.

The `.env.example` already contains the supplied Firebase config. You can edit `.env` if needed. Restart Vite after changing environment variables.

## 3. Start the Python simulator (separate PowerShell terminal)
```powershell
cd simulator
py -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
Copy-Item .env.example .env
python simulator.py
```

The simulator uses Firebase Anonymous Authentication's REST endpoint, then writes:
- `evMonitor/readings` — push history
- `evMonitor/latest` — current simulated reading

If PowerShell blocks activation, run `Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass` in that terminal, then activate again.

## 4. Change the simulated condition
Edit `simulator/.env` and set one of:
```env
SCENARIO=normal
# SCENARIO=hot
# SCENARIO=low_voltage
# SCENARIO=high_current
```
Stop and restart the simulator to apply the scenario.

## Notes
- All values are simulated. SOC is a simple illustrative estimate, not a validated battery model.
- The `simulated: true` field is written to every reading.
- The included database rules are intentionally simple demo rules and are not production security rules.
