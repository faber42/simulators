# Bingolett-Simulator

Simulation eines Bingolett-Wandspielautomaten von 1959, wie er in deutschen
Gaststätten hing. Die Funktionsweise wurde mit dem Besitzer eines
Originalgeräts abgestimmt — die folgenden Details sind verbindlich.

## Spielablauf

1. **Münzeinwurf (10 Pfennig)** startet das Spiel: Der Automat gibt die Kugel
   aus dem mittigen Kugelhalter frei (kleines Loch unter dem O von
   BINGOLETT). Sie fällt auf die Bahn und rollt vor das Schlagwerk unten
   rechts. Während des Spiels leuchtet im Karo des Emblems **„SPIEL FREI“**.
2. **Drei Durchgänge derselben Kugel:** Das Schlagwerk schleudert die Kugel
   in die Kreisbahn. Sie läuft **im Uhrzeigersinn** — unten nach links, die
   linke Seite hinauf (Dauer < 1 s) — und verlässt die Bahn oben links durch
   eine **Einweg-Klammer**: Danach kann sie nicht auf die Bahn zurück, nur
   ins Nadelfeld.
3. Im **Nadelfeld** (3 Reihen mit 12 / 13 / 14 Nadeln) prallt die Kugel
   2–3 s umher und fällt in eine der **14 Zahlentaschen**. Reihenfolge der
   Taschenziffern von links nach rechts:
   **4 1 3 2 4 3 1 4 2 4 3 1 2 4**
4. Nach dem Taschentreffer wartet der Automat ca. **3 Sekunden**
   (Programmwerk schaltet hörbar weiter) und gibt die Kugel für den nächsten
   Wurf wieder vor das Schlagwerk frei. Nach dem **dritten** Wurf bleibt sie
   im mittigen Halter, bis die nächste Münze fällt.
5. **Zu schwacher Wurf:** Erreicht die Kugel die Klammer nicht, rollt sie
   die Bahn zurück ans Schlagwerk — der Durchgang zählt **nicht**, der Wurf
   wird wiederholt.
6. Es gibt **keine Zeitbegrenzung**: Lässt sich der Spieler Zeit, wartet der
   Automat. (Die „Spieldauer 15 Sek.“ auf der Tafel ist nur eine Schätzung
   für ein zügiges Spiel.)

## Zahlenfeld und Leuchtlogik

7 Säulen à 3 Ziffern, darunter das Betragsfeld:

| Säule  | 1·2·3 | 3·3·3 | 4·4·4 | 1·1·1 | 2·2·2 | 2·3·4 | 1·3·4 |
|--------|-------|-------|-------|-------|-------|-------|-------|
| Gewinn | 10 Pf | 20 Pf | 40 Pf | **1 DM** | 80 Pf | 20 Pf | 10 Pf |

- **Reine Säulen** (gleiche Ziffern): füllen sich **von oben nach unten** —
  die *n*-te gefallene passende Ziffer zündet die *n*-te Zelle, egal in
  welchem Wurf. Gewinn also nur, wenn dieselbe Ziffer dreimal fällt.
- **Gemischte Säulen**: Jede Zelle leuchtet, sobald ihre Ziffer fällt —
  **Reihenfolge egal**. Gewinn, wenn die drei Würfe genau die drei Ziffern
  der Säule ergeben.
- Leuchten nach dem 3. Durchgang in einer Säule alle 3 Zahlen, zündet das
  Betragsfeld darunter und der Betrag wird in 10-Pf-Stücken in die Schale
  ausgezahlt. (Mathematisch kann nie mehr als eine Säule gleichzeitig
  vollständig sein.)
- Die Lampen des letzten Spiels bleiben stehen, bis die nächste Münze fällt.

## Technik

- Reine 2D-Physik ohne Fremdbibliotheken:
  - Die **Kreisbahn** ist ein 1D-Pfad (Bogenlängen-Parametrisierung) mit
    Hangabtrieb, Rollreibung und quadratischem Widerstand. Die
    Schlagstärke bestimmt die Restgeschwindigkeit an der Klammer und damit
    die Flugweite über dem Nadelfeld — das Geschicklichkeitselement.
  - Die **freie Kugel** fliegt ballistisch und kollidiert mit Nadeln
    (Kreise), Stegen (Kapseln), Dichtungskeilen und der Ringwand.
- Fester Physik-Zeitschritt (240 Hz) mit Akkumulator — läuft auf 60-, 120-
  und 144-Hz-Displays identisch.
- Geräusche (Relais, Schlagwerk, Nadeln, Programmwerk, Münzen) werden mit
  WebAudio synthetisiert, keine Audiodateien.
- Debug-Haken in der Konsole: `__bingo.insertCoin()`,
  `__bingo.forceLaunch(kraft)`, `__bingo.fastForward(sekunden)`.
