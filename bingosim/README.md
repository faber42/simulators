# Bingolett-Simulator

Simulation eines Bingolett-Wandspielautomaten von 1959, wie er in deutschen
Gaststätten hing. Die Funktionsweise wurde mit dem Besitzer eines
Originalgeräts abgestimmt — die folgenden Details sind verbindlich.

## Spielablauf

1. **Münzeinwurf (10 Pfennig):** Zuerst nullt der Automat das Zahlenfeld
   (siehe „Ruhezustand, KONTROLLE und Initialisierung“), dann gibt er die
   Kugel aus dem mittigen Kugelhalter frei (kleines Loch unter dem O von
   BINGOLETT). Sie fällt unten in die Kreisbahn, springt beim Aufkommen
   kurz auf und rollt mit Rechtsimpuls die leichte Schräge hinunter vor
   das Schlagwerk — **genau mit der Freigabe** leuchtet im Karo des
   Emblems **„SPIEL FREI“** auf. Solange der Automat die Kugel festhält,
   ist „SPIEL FREI“ dunkel.
2. **Drei Durchgänge derselben Kugel:** Gespannt wird das Schlagwerk, indem
   der Hebel **nach rechts** gedrückt wird — ganz rechts ist volle Kraft;
   beim Loslassen schnellt er nach links gegen die Kugel. Es schleudert sie
   über die Abschussrampe — eine **waagerechte Tangente** an die Kreisbahn:
   Die Kugel fliegt flach die Rampe entlang und folgt dann der Kreisbahn,
   ohne einen Hügel zu überwinden. Sie läuft **im Uhrzeigersinn** — unten
   nach links, die linke Seite hinauf (Dauer < 1 s) — und verlässt die Bahn
   oben links durch eine **Einweg-Klammer**: Danach kann sie nicht auf die
   Bahn zurück, nur ins Nadelfeld. Die Schlagkraft darf der Spieler schon
   aufbauen, während die freigegebene Kugel noch zum Schlagwerk rollt —
   ein zu früher Schlag geht ins Leere und wird einfach wiederholt.
3. Im **Nadelfeld** (3 Reihen mit 12 / 13 / 14 Nadeln) prallt die Kugel
   2–3 s umher und fällt in eine der **14 Zahlentaschen**. Reihenfolge der
   Taschenziffern von links nach rechts:
   **4 1 3 2 4 3 1 4 2 4 3 1 2 4**
   Gegenüber der Klammer, auf gleicher Höhe oben rechts, sitzt ein
   **Gumminoppen (Poller)**: Mit voller Kraft geschleuderte Kugeln, die an
   der Ringwand entlang bis zur Gegenseite flitzen, prallen an ihm
   chaotisch ins Nadelfeld zurück, statt vorhersagbar rechts in eine
   Tasche zu fallen.
4. Der Taschensensor sitzt **am Eingang der Tasche**, direkt unter der
   Ziffer: In dem Moment, in dem die Kugel die Zahl unterquert, **erlischt
   „SPIEL FREI“** und die Ziffer leuchtet im Zahlenfeld auf — noch bevor
   die Kugel den Taschenboden erreicht. Die Kugel fällt in den mittigen
   Halter, das Programmwerk schaltet hörbar weiter, dann wird sie für den
   nächsten Wurf wieder freigegeben — „SPIEL FREI“ geht mit der Freigabe
   wieder an. Die Haltezeit bestimmt der **Programmschalter**: Zwischen
   zwei Kugelfreigaben liegen **mindestens 9 Sekunden** (`TUNE.RELEASE_GAP`,
   am Original nachempfunden). Flitzt die Kugel schnell durch das
   Nadelfeld, hält der Automat sie entsprechend länger fest; hat der Wurf
   ohnehin länger gedauert (z. B. weil der Spieler trödelt), bekommt er
   sie nach der Mindesthaltezeit von ca. **1 Sekunde** (`TUNE.HOLD_MIN`)
   zügig wieder. Nach dem
   **dritten** Wurf bleibt die Kugel im mittigen Halter, bis die nächste
   Münze fällt.
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
  Betragsfeld darunter **im selben Moment wie die dritte Ziffer** — die
  Relais schalten den Gewinn direkt durch. Der Betrag wird in
  10-Pf-Stücken in die Schale ausgezahlt. (Mathematisch kann nie mehr als
  eine Säule gleichzeitig vollständig sein.)
- **Auszahlwerk:** Nach dem dritten Wurf fährt der Automat **immer**
  dieselbe Sequenz aus **10 Stufen im 300-ms-Takt** ab — auch bei einer
  Niete. Der schwere Münzhebel greift nur so oft wie nötig, und zwar am
  **Ende** der Sequenz: pro 10 Pf Gewinn eine laute „Kasching“-Stufe
  (Hebel drückt die unterste Münze aus der Münzsäule, die Säule rutscht
  klirrend nach, die Lampen flackern kurz). Die Stufen davor sind leises
  Leerlauf-Relaisklappern. 1 DM = 10× laut; 80 Pf = 2× leise, 8× laut;
  10 Pf = 9× leise, 1× laut; kein Gewinn = 10× leise.

## Ruhezustand, KONTROLLE und Initialisierung

- Nach dem Spiel **erlischt das gesamte Zahlenfeld**, aber die **Relais
  bleiben geschaltet**. Der rote **KONTROLLE**-Knopf legt das gehaltene
  Ergebnis wieder auf die Lampen, solange er gedrückt wird.
- **Initialisierung beim Münzeinwurf:** Um die Relais auf Null zu bringen,
  lässt der Automat das Programm zu Ende laufen — begleitet von einem
  Klappern wie bei einer alten mechanischen Schreibmaschine:
  1. Das Zahlenfeld leuchtet zunächst **unverändert** wieder auf.
  2. Im Abstand von ca. **300 ms** wird in jeder *angefangenen* reinen
     Säule die jeweils nächste Ziffer gezündet, bis diese Säulen voll
     sind. Bereits leuchtende Ziffern der gemischten Säulen **flackern**
     im gleichen Rhythmus mit (sie werden nicht aufgefüllt).
  3. Die Betragsfelder der so vervollständigten Säulen leuchten kurz auf
     (Beispiel: nach Würfen 1, 3, 4 also 20 Pf, 40 Pf und 1 DM).
  4. Alles erlischt — die Relais stehen auf Null, erst jetzt wird die
     Kugel freigegeben.

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
- Auto-Spielmodus (Knopf in der Seitenleiste): wirft 5 s nach Spielende
  selbst die nächste Münze ein und bedient das Schlagwerk mit zufälliger
  Haltedauer — zum Zuschauen und Vorführen.
- Debug-Haken in der Konsole: `__bingo.insertCoin()`,
  `__bingo.forceLaunch(kraft)`, `__bingo.fastForward(sekunden)`.
