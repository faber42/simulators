# Fernsprechamt

Eine elektromechanische Vermittlung mit sechsstelligen Rufnummern. Vom eigenen
Bakelitapparat über den Anrufsucher und vier Gruppenwähler zum Leitungswähler
und schließlich zum Zielapparat oder zum Tonbandgerät. Drei Kameras zeigen gleichzeitig den eigenen
Apparat, den gerade arbeitenden Wähler und den Wählersaal mit 90 festen örtlichen Nummernbereichen.

Start aus dem Repository: `npm start`, dann <http://localhost:3000/telefonsim/>.
Kein Build, kein CDN, keine Installation zusätzlicher Abhängigkeiten.

## Bedienung

- Hörer in Kamera 01 anklicken oder „Hörer abheben“ drücken.
- Ein Fingerloch anklicken (automatisches Aufziehen) oder im Uhrzeigersinn bis
  zum Anschlag ziehen und loslassen. Ein abgebrochener Zug wählt keine Ziffer.
- Alternativ die Nummerntastatur, Tasten 0–9 oder das Eingabefeld benutzen.
  Die Direkteingabe hebt auch den Hörer ab und wählt die Nummer vollständig
  als einzelne Impulsfolgen. Eine führende 0 schaltet nach dem I. GW zum
  Fernamt außerhalb der Darstellung; weitere vorgemerkte Ziffern werden nicht
  mehr im Ortsamt gewählt. Auch die Direkteingabe „0“ ist dafür möglich.
- Im Telefonbuch einen Eintrag auswählen und „Wählen“ drücken.
- Normale Teilnehmer: den Zielhörer in Kamera 02 anklicken oder den dortigen
  Abheben-Button drücken. Die Ansagedienste nehmen automatisch ab und führen
  zu zwei Tonbandgeräten rechts neben Bereich 11: Band 01 für die
  Zeitansage, Band 02 für Kinoprogramm und Wetterdienst. Die Kamera schwenkt
  zum richtigen Gerät; der Leitungsweg endet an dessen Anschlussbuchse.
- Die Bandspulen, das Band und der Pegelzeiger bewegen sich während der
  Wiedergabe. Der Bandzähler läuft mit der Simulationszeit. Das angewählte
  Gerät läuft in einer dargestellten Endlosschleife bis zum Auflegen des
  Anrufers. Pause hält auch den Bandtransport an. Der Zielapparat bleibt bei
  Ansagen unberührt; Auflegen stoppt das Band sofort.
- Kamera 02 zeigt in Ruhelage bereits den Anrufsucher.
- Eigenen Hörer auflegen (oder Escape): Kamera 02 fährt auf den erreichten
  Nummernblock (z. B. 23xxxx) heraus. Alle belegten Wähler drehen gleichzeitig
  aus der Kontaktbank, fallen ab und stellen zurück. Eine gemeinsame Anzeige
  zeigt auch die außerhalb dieses Blocks liegenden Zugangswähler. Danach
  kehrt die Kamera zum Anrufsucher zurück. Bei frühem Auflegen zeigt sie den
  bereits erreichten Gruppenzugang, ohne noch ungewählte Bereiche anzufahren.
  Die Kamerapause vor dem Auslösen dient nur der anschaulichen Darstellung.
- Legt zuerst der Zielteilnehmer auf, bleibt der eigene Hörer abgehoben;
  die Verbindung wird erst mit dem eigenen Auflegen freigegeben.
- Leertaste / Pause hält den Ablauf an. Tempo: 0,5×, 1×, 2×, 4×.
- Kamera 3 erweitert den Ausschnitt mit dem tatsächlich geschalteten Weg.
  „Ganzes Amt“ zeigt alle 90 örtlichen Bereiche. „Verbindungsweg“ folgt wieder der
  Ausdehnung des laufenden Anrufs. Beim Auslösen bleibt der große Ausschnitt
  bestehen, bis alle Wähler frei sind; der interne Leitungsweg erlischt gemeinsam.
- Vorne steht der Quellapparat, dahinter der Anrufsucher, dahinter der
  Amtszugang. Die Nummerngassen 1–9 liegen von links nach rechts. Der Abgang
  0 ist ein Wegweiser außerhalb des Saals und enthält keine örtlichen Wähler.
- Untergruppen folgen der Impulsreihenfolge 1–9, 0: n1xxxx steht vorne,
  n0xxxx hinten; auch die Gassen und Hundertergruppen verwenden diese Folge.
  Die Ziffer 0 bedeutet zehn Impulse, nicht die mechanische Ruhestellung.
  Diese räumliche Sortierung ist didaktisch und kein historischer Gestellplan.
- Zielapparate stehen außerhalb der rechten Saalgrenze. Die hellblaue
  Teilnehmerleitung führt vom letzten Leitungswähler über die Übergabestelle
  bis zum Telefon. Eine Telefonmarkierung und eine Anzeige „LW →
  Teilnehmerleitung → Zielnummer“ machen den letzten Abschnitt auch aus
  großer Entfernung sichtbar.
- Die Fahrten von Kamera 2 dauern bei Tempo 1× etwa 1,7 Sekunden. Wahl und
  Rückstellung warten auf die Kamera; die Impulsfrequenz bleibt unverändert.
- Ton ist optional und zunächst aus. Synthetische Schaltgeräusche und
  Amtstöne; keine Sprache. Ansagen erscheinen als Text.

## Schaltprinzip und Modellgrenzen

Der AS findet beim Abheben den Quellanschluss 210001 (innerhalb seiner
Hundertergruppe: Ebene 10, Kontakt 1). Die Gruppenwähler I–IV heben mit den
Impulsen der Ziffern 1–4. Anschließend suchen sie drehend einen freien Ausgang
im gewählten Bündel. Diese Drehschritte sind **keine weitere Rufnummernziffer**.
Beim LW bestimmt Ziffer 5 die Höhe und Ziffer 6 die Drehposition. 0 entspricht
immer zehn Impulsen. Die Rücklaufphase erzeugt bei Tempo 1× zehn Impulse pro
Sekunde; Kameraübergänge und Freisuche sind für die Beobachtung verlangsamt.

Die örtlichen sechsstelligen Nummern werden über einen Präfixbaum
adressiert: I. GW → 9 Gruppen II. GW → 90 Gruppen III. GW → 900 Gruppen
IV. GW → 9.000 Hundertergruppen mit Leitungswählern. Logische Wählerinstanzen
werden beim Erreichen eines Präfixes angelegt und wiederverwendet. So ändern
sich die Gruppen tatsächlich mit der gewählten Nummer. Ortsnummern erreichen
einen generischen Apparat, mit folgenden definierten Ausnahmen:

| Rufnummer | Anschluss |
|---|---|
| 210001 | eigener Anschluss, besetzt |
| 234567 | Feinmechanische Werkstatt |
| 618204 | Wohnzimmer |
| 405019 | Bahnhofsbüro |
| 119100 | Zeitansage (lokale Systemzeit), Tonband 01 |
| 119200 | Kinoprogramm (erfunden, als Text), Tonband 02 |
| 119300 | Wetterdienst (erfundene Textansage, keine Wetterdaten), Tonband 02 |
| 234569 | dauerhaft besetzter Testanschluss |
| 0 / 0… | Abgang zum Fernamt; weitere Vermittlung außerhalb des Modells |

Simuliert wird **ein Gespräch zur Zeit**, nicht die Verkehrslast eines
Großamts. Der Saal bildet den örtlichen Zielnummernraum 100000–999999 mit
festen Koordinaten ab: 90 Bereiche à 10.000 Rufnummern, je zehn Gassen mit
zehn Hundertergruppen. 234567 führt in Bereich 23xxxx, Gasse 234xxx, Gruppe
2345xx. Jede Hundertergruppe besitzt zehn Leitungswähler, insgesamt 90.000.
Hinzu kommen 10.000 Gruppenwähler (10 + 90 + 900 + 9.000) und ein
Zugangsgestell mit zehn Anrufsuchern für die Darstellung des Quellanschlusses.
Die Drehstellung des vorigen Gruppenwählers bestimmt den genutzten Platz
im nächsten Bündel; Präfix und Platz behalten über Anrufe hinweg ihre Identität.
Die Freisuche verwendet reproduzierbare Beispielbelegungen in fremden Bündeln.

**Zehn Wähler je Bündel sind eine ausdrücklich vereinfachte Modellannahme**,
keine historische Kapazitätsberechnung. Vollständige Anrufsucherfelder für
alle Quellanschlüsse und die Verkehrsdimensionierung eines Millionenamts
werden nicht dargestellt. Die räumliche Anordnung erläutert die Hierarchie,
nicht die Baugröße eines konkreten Amts. Ein Zielapparat wird als Vorführgerät
außerhalb des Saals gezeigt; Ansagen haben eigene feste
Tonbandstandorte in Bereich 11.
Die farbige Leitung ist eine didaktische Einblendung in der Übersicht.
Relais-Schaltungen, historische Ortsnetzregeln, Gebühren und die Sprachübertragung
werden nicht elektrisch nachgebildet. Das Modell orientiert sich an allgemeinen
Hebdrehwähler-Prinzipien und den bereitgestellten Bildern, nicht an einem exakten
Nachbau eines bestimmten deutschen Amtssystems.

Hintergrund: [Communications Museum Trust – Strowger switching](https://www.communicationsmuseum.org.uk/emuseum/phoneswitching/4.phphtml).
Zur 0 als zehn Impulse: [Communications Museum Trust – Automatic Switching](https://www.communicationsmuseum.org.uk/emuseum/phoneswitching/3.phphtml).
Zur führenden 0 als Verkehrsausscheidungsziffer:
[Bundesnetzagentur – Ortsnetze](https://www.bundesnetzagentur.de/DE/Fachthemen/Telekommunikation/Nummerierung/ONRufnr/start.html).
Das Modell vereinfacht historische Nummerierungs- und Fernwahlpläne.

## Technik und Prüfung

- Lokales Three.js aus `../pinsim/three.module.min.js` und dessen Core-Modul.
- Ein WebGL-Renderer, eine gemeinsame 3D-Szene, drei Kameras via Viewport/Scissor.
- Kontaktbänke, Wählergestelle und Mechanik sind prozedurale 3D-Geometrie;
  wiederholte feste Teile werden mit InstancedMesh zusammengefasst.
- `topology.mjs` definiert feste Wähler-, Gestell- und Bereichskoordinaten und
  die perspektivische Einpassung der Übersicht. `office-scene.js` zeichnet die
  gesamten Gestelle mit vereinfachten Kontaktfronten. Nahe Bereiche erhalten
  einzelne Wählerkörper, die aktiven Plätze ihre detaillierte Mechanik. Es
  bleiben höchstens acht Bereiche mit mittlerer Detailstufe im Speicher.
- `engine.mjs` ist eine unabhängige, deterministische Zustandsmaschine.
  Alle Wahl-, Ruf- und Rückstellzeiten gehören zur Simulationszeit. Auflegen
  entfernt ausstehende Impulse und automatisches Abheben atomar.
- Die Zeitansage liest bewusst die lokale Uhr; sie aktualisiert sich nicht
  während einer Pause. Alle anderen Abläufe verwenden ausschließlich `step(dt)`.
- `window.TELEFONSIM.snapshot()` liefert einen Diagnosezustand ohne Mutation.
- Tests: `node --test telefonsim/engine.test.mjs telefonsim/topology.test.mjs`.
  Geprüft werden Schaltablauf, Fernamtsabgang, Freigabe, Ansagen, alle 100.010
  eindeutigen Wählerplätze, Reihenfolge des Zugangs und der Nummerngassen,
  Teilnehmerleitung, Kamerawartezeiten und Bildgrenzen bei mehreren Seitenverhältnissen.

Die Anwendung benötigt WebGL 2 und wird über den gemeinsamen HTTP-Server
geladen. Ein Verlust des WebGL-Kontexts hält die Simulation an und zeigt einen
Hinweis zum Neuladen.
