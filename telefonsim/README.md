# Fernsprechamt

Eine elektromechanische Vermittlung mit sechsstelligen Rufnummern. Vom eigenen
Bakelitapparat über den Anrufsucher und vier Gruppenwähler zum Leitungswähler
und schließlich zum Zielapparat. Drei Kameras zeigen gleichzeitig den eigenen
Apparat, den gerade arbeitenden Wähler und den gesamten aktiven Schrank.

Start aus dem Repository: `npm start`, dann <http://localhost:3000/telefonsim/>.
Kein Build, kein CDN, keine Installation zusätzlicher Abhängigkeiten.

## Bedienung

- Hörer in Kamera 01 anklicken oder „Hörer abheben“ drücken.
- Ein Fingerloch anklicken (automatisches Aufziehen) oder im Uhrzeigersinn bis
  zum Anschlag ziehen und loslassen. Ein abgebrochener Zug wählt keine Ziffer.
- Alternativ die Nummerntastatur, Tasten 0–9 oder das Eingabefeld benutzen.
  Die Direkteingabe hebt auch den Hörer ab und wählt die Nummer vollständig
  als einzelne Impulsfolgen. Führende Nullen bleiben erhalten.
- Im Telefonbuch einen Eintrag auswählen und „Wählen“ drücken.
- Normale Teilnehmer: den Zielhörer in Kamera 02 anklicken oder den dortigen
  Abheben-Button drücken. Die Ansagedienste nehmen automatisch ab.
- Eigenen Hörer auflegen (oder Escape): alle belegten Wähler lösen aus,
  drehen aus der Kontaktbank, fallen ab und stellen zurück. Kamera 02 folgt
  der Rückstellung in bewusst verlangsamter Reihenfolge.
- Legt zuerst der Zielteilnehmer auf, bleibt der eigene Hörer abgehoben;
  die Verbindung wird erst mit dem eigenen Auflegen freigegeben.
- Leertaste / Pause hält den Ablauf an. Tempo: 0,5×, 1×, 2×, 4×.
- Ton ist optional und zunächst aus. Synthetische Schaltgeräusche und
  Amtstöne; keine Sprache. Ansagen erscheinen als Text.

## Schaltprinzip und Modellgrenzen

Der AS findet beim Abheben den Quellanschluss 010001 (innerhalb seiner
Hundertergruppe: Ebene 10, Kontakt 1). Die Gruppenwähler I–IV heben mit den
Impulsen der Ziffern 1–4. Anschließend suchen sie drehend einen freien Ausgang
im gewählten Bündel. Diese Drehschritte sind **keine weitere Rufnummernziffer**.
Beim LW bestimmt Ziffer 5 die Höhe und Ziffer 6 die Drehposition. 0 entspricht
immer zehn Impulsen. Die Rücklaufphase erzeugt bei Tempo 1× zehn Impulse pro
Sekunde; Kameraübergänge und Freisuche sind für die Beobachtung verlangsamt.

Der vollständige sechsstellige Nummernraum wird über einen Präfixbaum
adressiert: I. GW → 10 Gruppen II. GW → 100 Gruppen III. GW → 1.000 Gruppen
IV. GW → 10.000 Hundertergruppen mit Leitungswählern. Logische Wählerinstanzen
werden beim Erreichen eines Präfixes angelegt und wiederverwendet. So ändern
sich die Gruppen tatsächlich mit der gewählten Nummer. Alle Nummern erreichen
einen generischen Apparat, mit folgenden definierten Ausnahmen:

| Rufnummer | Anschluss |
|---|---|
| 010001 | eigener Anschluss, besetzt |
| 234567 | Feinmechanische Werkstatt |
| 618204 | Wohnzimmer |
| 405019 | Bahnhofsbüro |
| 119100 | Zeitansage (lokale Systemzeit) |
| 119200 | erfundenes Kinoprogramm als Text |
| 119300 | erfundene Wetteransage als Text, keine Wetterdaten |
| 234569 | dauerhaft besetzter Testanschluss |
| 000000 | nicht beschalteter Testanschluss |

Simuliert wird **ein Gespräch zur Zeit**, nicht die Verkehrslast eines
Millionenanschlussamts. Der Schrank ist ein dynamischer Ausschnitt mit sechs
Stufen und jeweils drei sichtbaren Wählern. Die benötigte Präfixgruppe wird in
diesem Ausschnitt dargestellt; die zwei anderen Geräte zeigen Reserven. Die
Freisuche verwendet reproduzierbare Beispielbelegungen in fremden Bündeln.
Die farbige Leitung ist eine didaktische Einblendung in der Übersicht.
Relais-Schaltungen, historische Ortsnetzregeln, Gebühren und die Sprachübertragung
werden nicht elektrisch nachgebildet. Das Modell orientiert sich an allgemeinen
Hebdrehwähler-Prinzipien und den bereitgestellten Bildern, nicht an einem exakten
Nachbau eines bestimmten deutschen Amtssystems.

Hintergrund: [Communications Museum Trust – Strowger switching](https://www.communicationsmuseum.org.uk/emuseum/phoneswitching/4.phphtml).

## Technik und Prüfung

- Lokales Three.js aus `../pinsim/three.module.min.js` und dessen Core-Modul.
- Ein WebGL-Renderer, eine gemeinsame 3D-Szene, drei Kameras via Viewport/Scissor.
- Kontaktbänke, Wählergestelle und Mechanik sind prozedurale 3D-Geometrie;
  wiederholte feste Teile werden mit InstancedMesh zusammengefasst.
- `engine.mjs` ist eine unabhängige, deterministische Zustandsmaschine.
  Alle Wahl-, Ruf- und Rückstellzeiten gehören zur Simulationszeit. Auflegen
  entfernt ausstehende Impulse und automatisches Abheben atomar.
- Die Zeitansage liest bewusst die lokale Uhr; sie aktualisiert sich nicht
  während einer Pause. Alle anderen Abläufe verwenden ausschließlich `step(dt)`.
- `window.TELEFONSIM.snapshot()` liefert einen Diagnosezustand ohne Mutation.
- Tests: `node --test telefonsim/engine.test.mjs`.

Die Anwendung benötigt WebGL 2 und wird über den gemeinsamen HTTP-Server
geladen. Ein Verlust des WebGL-Kontexts hält die Simulation an und zeigt einen
Hinweis zum Neuladen.
