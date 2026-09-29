# Zeitschaltuhr – Workout Timer

Workout-Timer als Web-App (PWA) für Handy, Tablet und Desktop. Keine Abhängigkeiten, kein Build: reines HTML/CSS/JS, läuft direkt auf Vercel.

## Modi

| Modus | Wofür |
|---|---|
| **Tabata** | Arbeit/Pause im Wechsel, Runden × Sätze, Satzpause, Cool-down |
| **Runden** | EMOM, E2MOM, feste Runden mit optionaler Pause |
| **Stoppuhr** | Zählt hoch, Rundenzeiten per Tipp |
| **Intervalle** | Eigene Abläufe: Blöcke mit Wiederholungen, Übungen mit Name, Dauer, Farbe |
| **Countdown** | Einfacher Timer |
| **AMRAP** | Zeitlimit, Runden per Tipp zählen |
| **For Time** | Zählt hoch mit Time Cap, Runden zählen, „Fertig“ drücken |

## Features

- **Bildschirm bleibt an**: Screen Wake Lock API (iOS 16.4+, Android), Fallback per NoSleep.js. Wird nach App-Wechsel automatisch neu geholt.
- **Exakte Zeit**: Die Zeit wird aus Zeitstempeln berechnet, nicht aus Ticks. Nach dem Sperren des Handys stimmt der Timer weiterhin.
- Signaltöne (3-2-1, Start, Pause, Halbzeit, Ende), deutsche Sprachansage, Vibration
- Favoriten, Presets, Verlauf, Workouts per Link teilen
- Sperrmodus gegen versehentliches Tippen (Schloss gedrückt halten zum Entsperren)
- Hoch- und Querformat, offline nutzbar, installierbar („Zum Home-Bildschirm“)
- Tastatur: Leertaste = Pause, ←/→ = Abschnitt zurück/weiter

## Deploy auf Vercel

1. vercel.com → **Add New… → Project** → dieses Repo importieren
2. Framework Preset: **Other**, Build Command leer, Output Directory leer (Root)
3. **Deploy**

Jeder Push auf `main` deployt automatisch.

## Lokal starten

```bash
npx serve .
# oder
python3 -m http.server 8000
```

## Struktur

```
index.html            App-Shell
styles.css            Design
js/main.js            UI: Home, Editor, Lauf-Screen, Sheets
js/modes.js           Modi + Compiler (Konfiguration → Abschnitte)
js/engine.js          Timer-Engine (zeitstempelbasiert)
js/audio.js           Töne, Sprache, Vibration
js/wakelock.js        Bildschirm anlassen
js/store.js           Einstellungen, Favoriten, Verlauf (localStorage)
sw.js                 Offline-Cache
```
