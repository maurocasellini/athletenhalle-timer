# GRIT – Workout Timer (iOS-App)

Workout-Timer als iPhone-App: Tabata, Runden/EMOM, Stoppuhr, Intervalle, Countdown, AMRAP, For Time.
6 Sprachen (DE, EN, FR, IT, ES, PT), kein Login, kein Server, keine Datenerhebung – alles bleibt lokal auf dem Gerät.

## Was die App nativ kann

| Funktion | Wie |
|---|---|
| Töne und Ansagen bei **gesperrtem Bildschirm** | Background-Audio (`UIBackgroundModes: audio`) + nativer Ton-Fahrplan in `WorkoutAudio.swift` |
| **Musik läuft weiter** (Spotify, Apple Music …) | Audio-Session `.playback` + `.mixWithOthers` |
| Ton **auch bei Stumm-Schalter** | Kategorie `.playback` ignoriert den Schalter, die Lautstärke regeln die Seitentasten |
| Bildschirm bleibt an | `isIdleTimerDisabled` |
| Vibration bei 3-2-1 / Ende | `UIImpactFeedbackGenerator` |
| Alle Daten löschen | Einstellungen → „Alle Daten löschen“ (löscht den gesamten lokalen Speicher) |

**Funktionsweise:** Die Oberfläche (`www/`) berechnet bei jeder Änderung (Start, Pause, Weiter, Zurück) alle restlichen Töne und Ansagen mit Uhrzeit und übergibt sie an das native Plugin. iOS spielt sie dann selbst ab, auch wenn die Web-Oberfläche im Hintergrund pausiert ist. Läuft kein Workout, gibt die App die Audio-Session frei und iOS darf sie schlafen legen.

## Struktur

```
www/                       Oberfläche (HTML/CSS/JS, kein Build nötig)
  js/native.js             Brücke zum iOS-Plugin
  js/main.js               UI, Editor, Timer-Screen, Ton-Fahrplan (buildCues)
ios/App/App/
  WorkoutAudio.swift       natives Plugin: Audio-Session, Töne, Sprache, Bildschirm an
  PrivacyInfo.xcprivacy    Datenschutz-Manifest (keine Daten, kein Tracking)
  Info.plist               Background-Audio, Sprachen, Dark Mode
capacitor.config.json      App-ID, Name
docs/privacy.html          Datenschutzerklärung (für App Store Connect)
APPSTORE.md                Store-Texte, Datenschutz-Angaben, Review-Notiz
```

## Bauen auf dem Mac

**Voraussetzungen:** Mac mit **Xcode 16+**, **Node.js 20+** (`brew install node`), Apple-Developer-Account.

```bash
git clone -b app https://github.com/maurocasellini/athletenhalle-timer.git grit
cd grit
npm install
npx cap sync ios        # kopiert www/ in das iOS-Projekt
npx cap open ios        # öffnet Xcode
```

In Xcode:
1. Links **App** (blaues Icon) → Target **App** → Tab **Signing & Capabilities**
2. **Team** auswählen (dein Developer-Account). Bundle-ID ist `com.maurocasellini.grit`; bei Bedarf ändern (auch in `capacitor.config.json`).
3. Prüfen, dass unter Capabilities **Background Modes → Audio** aktiv ist (steht bereits in der Info.plist; falls Xcode es nicht anzeigt: „+ Capability“ → Background Modes → Audio anhaken).
4. iPhone per Kabel anschließen, oben als Ziel wählen → **▶ Run**.
   Beim ersten Mal auf dem iPhone: Einstellungen → Datenschutz & Sicherheit → Entwicklermodus an.

Nach jeder Änderung in `www/`: `npx cap sync ios`, dann in Xcode erneut ▶.

## Testen (wichtig vor dem Upload)

- [ ] Spotify starten, dann GRIT → Tabata starten: Musik läuft weiter, die Beeps kommen dazu
- [ ] Stumm-Schalter an: Töne kommen trotzdem
- [ ] Während des Timers Seitentaste drücken (Bildschirm sperren): 3-2-1, „Pause“, „Los“ kommen weiter pünktlich
- [ ] Entsperren: Anzeige springt an die richtige Stelle
- [ ] Anruf oder Siri während des Timers: danach geht es weiter
- [ ] Einstellungen → Alle Daten löschen → App neu öffnen: alles auf Standard

## In den App Store

1. **App Store Connect** → Meine Apps → **+** → Neue App: Name „GRIT – Workout Timer“, Bundle-ID wählen, SKU z. B. `grit-timer`.
   Ist der Name schon vergeben: z. B. „GRIT Interval Timer“. Der Name auf dem Home-Bildschirm bleibt „GRIT“.
2. Xcode: Ziel **Any iOS Device (arm64)** → Menü **Product → Archive** → **Distribute App → App Store Connect → Upload**.
3. In App Store Connect: TestFlight zum Testen oder direkt Version anlegen und Build auswählen.
4. Texte, Datenschutz-Angaben und Review-Notiz aus **APPSTORE.md** übernehmen.
5. Datenschutzerklärung-URL: `docs/privacy.html` irgendwo öffentlich hosten (z. B. GitHub Pages oder Vercel). In der Datei vorher `KONTAKT@EXAMPLE.COM` durch deine Kontaktadresse ersetzen.
6. Screenshots (6,9″ iPhone): im Simulator „iPhone 16 Pro Max“ ⌘S drücken.
7. **Zur Prüfung einreichen.**

## Im Browser entwickeln

```bash
npm run serve   # http://localhost:8000 – ohne iOS laufen Töne über Web Audio
```
