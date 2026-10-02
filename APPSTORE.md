# App Store Connect – Texte & Angaben

## App-Informationen

| Feld | Wert |
|---|---|
| Name | **GRIT – Workout Timer** (Alternative, falls vergeben: GRIT Interval Timer) |
| Untertitel (DE) | Tabata, EMOM, AMRAP & Intervalle |
| Subtitle (EN) | Tabata, EMOM, AMRAP & Intervals |
| Kategorie | Gesundheit und Fitness (Health & Fitness) |
| Altersfreigabe | 4+ (keine sensiblen Inhalte) |
| Preis | Gratis-Download, 3 Tage Test, dann In-App-Kauf **CHF 10.00** einmalig |
| Bundle-ID | com.cmventures.grit |
| Datenschutz-URL | (öffentliche URL von `docs/privacy.html`) |
| Support-URL | kann dieselbe Seite sein |

## In-App-Kauf anlegen (App Store Connect → deine App → Monetarisierung → In-App-Käufe)

| Feld | Wert |
|---|---|
| Typ | **Nicht-verbrauchbar** (Non-Consumable) |
| Referenzname | GRIT Vollversion |
| Produkt-ID | **`com.cmventures.grit.full`** (muss genau so heißen, steht so im Code) |
| Preis | CHF 10.00 (Apple rechnet die anderen Länder automatisch um) |
| Familienfreigabe | **Ein** |
| Anzeigename / Beschreibung DE | GRIT Vollversion / Alle Timer ohne Einschränkung – einmalig, kein Abo. |
| Display name / description EN | GRIT Full Version / All timers without limits – one-time, no subscription. |
| Screenshot für die Prüfung | Screenshot der Bezahlseite |

Wichtig: Beim **ersten** Einreichen muss der In-App-Kauf **zusammen mit der App-Version** zur Prüfung (in der Version unter „In-App-Käufe“ hinzufügen).

Vorher einmalig: **Geschäftliches → Vereinbarung für kostenpflichtige Apps** akzeptieren, Bankkonto und Steuerformulare hinterlegen.

## Gratis-Codes für Kollegen (Angebotscodes)

1. App Store Connect → deine App → In-App-Kauf **GRIT Vollversion** → **Angebotscodes** → Neuer Code.
2. Angebot: **kostenlos**, Anzahl Codes (z. B. 20), Ablaufdatum festlegen.
3. Codes herunterladen und per WhatsApp verschicken.
4. Kollegen: in GRIT → Bezahlseite oder Einstellungen → **„Code einlösen“**. Alternativ App Store → Profilbild → „Geschenkkarte oder Code einlösen“.

Jeder Code funktioniert nur einmal. Hinweis: Angebotscodes für einmalige Käufe sind bei Apple relativ neu. Mögliche Mindest-iOS-Version und aktuelle Limits beim Erstellen in App Store Connect prüfen.

## Beschreibung (DE)

```
GRIT ist der Workout-Timer ohne Schnickschnack: gross, laut, klar – gemacht fürs Gym.

TIMER
• Tabata – Arbeit/Pause, Runden, Sätze, Satzpause, Cool-down
• Runden – EMOM, E2MOM, feste Runden mit Pause
• Intervalle – eigene Abläufe: Intervall + Pause, Wiederholungen, eigene Namen und Farben
• AMRAP – Zeitlimit, Runden per Tipp zählen
• For Time – mit Time Cap und Rundenzähler
• Countdown und Stoppuhr mit Rundenzeiten

IM TRAINING
• Ganzer Bildschirm in der Phasenfarbe – aus Metern erkennbar
• Riesige Ziffern, 3-2-1-Countdown mit Ton und Vibration
• Sprachansagen: „Los“, „Pause“, „Letzte Runde“, Übungsnamen
• Deine Musik läuft weiter – die Töne kommen einfach dazu
• Funktioniert bei gesperrtem Bildschirm und mit Stumm-Schalter
• Bildschirm bleibt während des Trainings an
• Sperrmodus gegen versehentliches Tippen

PREIS
• 3 Tage alles gratis testen
• Danach einmalig CHF 10 – kein Abo, mit Familienfreigabe

DATENSCHUTZ
• Kein Konto, kein Login, keine Werbung, kein Tracking
• Keine Internetverbindung nötig – alles bleibt auf deinem iPhone
• Alle Daten jederzeit mit einem Tipp löschbar

Sprachen: Deutsch, English, Français, Italiano, Español, Português
```

## Description (EN)

```
GRIT is the no-nonsense workout timer: big, loud, clear – built for the gym.

TIMERS
• Tabata – work/rest, rounds, sets, set rest, cool-down
• Rounds – EMOM, E2MOM, fixed rounds with rest
• Intervals – build your own: interval + rest, repeats, custom names and colours
• AMRAP – time limit, tap to count rounds
• For Time – with time cap and round counter
• Countdown and stopwatch with lap times

DURING YOUR WORKOUT
• The whole screen in the phase colour – readable from across the gym
• Huge digits, 3-2-1 countdown with sound and haptics
• Voice cues: "Go", "Rest", "Last round", exercise names
• Your music keeps playing – the beeps simply play on top
• Works with the screen locked and in silent mode
• Screen stays on while you train
• Lock mode against accidental taps

PRICE
• Try everything free for 3 days
• Then a one-time purchase – no subscription, Family Sharing included

PRIVACY
• No account, no login, no ads, no tracking
• No internet connection needed – everything stays on your iPhone
• Delete all data any time with one tap

Languages: English, Deutsch, Français, Italiano, Español, Português
```

## Keywords (max. 100 Zeichen)

- DE: `tabata,intervall,emom,amrap,hiit,crossfit,timer,workout,fitness,stoppuhr,training,countdown,gym`
- EN: `tabata,interval,emom,amrap,hiit,crossfit,timer,workout,fitness,stopwatch,training,countdown,gym`

## App-Datenschutz („Privacy Nutrition Label“)

App Store Connect → App-Datenschutz → **„Nein, wir erfassen keine Daten von dieser App“**.
(Stimmt so: keine Netzwerkzugriffe, keine Analytics, keine Drittanbieter-SDKs; Daten nur lokal.
Der Kauf läuft über Apples StoreKit und wird nicht an eigene Server gesendet, deshalb ist auch „Kaufhistorie“ nicht anzugeben.)

## Exportkonformität

Bereits in der Info.plist gesetzt: `ITSAppUsesNonExemptEncryption = NO`, also keine Nachfrage beim Upload.

## Notiz für das App-Review (App Review Information → Notes)

```
GRIT is an interval/workout timer. It uses the "audio" background mode to play audible
timer cues (beeps and spoken announcements such as "Rest", "Go", "Last round") at the
scheduled times while the screen is locked or the user is in another app (e.g. a music app).
Audio is mixed with other apps (AVAudioSession .playback + .mixWithOthers), so the user's
music keeps playing. The audio session is only active while a workout is running.

To test: open "Tabata", tap Start, lock the device – cues continue every few seconds.
No account or login is required. The app collects no data and makes no network requests.

Monetisation: all features are free for 3 days after first launch. After that, starting a
workout shows a paywall for a one-time non-consumable in-app purchase "GRIT Full Version"
(com.cmventures.grit.full, Family Sharing enabled). "Restore purchases" and "Redeem code"
are on the paywall and in Settings. To see the paywall immediately in review, it also opens
from the banner on the home screen and from Settings → GRIT Full Version.
```

## EU-Händlerstatus (Digital Services Act)

Da die App Geld kostet: **„Händler“** wählen und die Firmendaten (Adresse, Telefon, E-Mail) angeben. Diese werden in der EU im App Store angezeigt.
