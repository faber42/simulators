# CoffeeLab · Ein Kaffee. Von innen.

Eine frei drehbare Three.js-Simulation eines Kaffeevollautomaten, äußerlich
angelehnt an die Philips 5400 Series mit vorderem LatteGo-Milchbehälter.
Sie verwendet wie DishLab die lokale Three.js-Bibliothek aus `pinsim/`.

## Starten

Im Repository `npm start` ausführen und
[localhost:3000/coffeesim/](http://localhost:3000/coffeesim/) öffnen.
Eine Karte auf der Projektstartseite führt ebenfalls zur Simulation.
Es gibt keinen Build-Schritt und keine zusätzlichen Abhängigkeiten oder CDN-Aufrufe.

## Der Weg in die Tasse

1. Das separate Keramikmahlwerk mahlt Bohnen aus dem oberen Behälter.
   Kaffeemehl fällt in die offene Kammer der Brühgruppe.
2. Der im Gehäuse sitzende Motor bewegt über ein Getriebe und eine Kupplung
   die Brühgruppe. Die Kammer schließt gegen den Brühkolben und verdichtet
   das Kaffeemehl.
3. Beim Latte macchiato wird zunächst Dampf erzeugt. LatteGo saugt Milch
   durch den Kanal zwischen seinen zwei Behälterteilen an. Dampf erwärmt
   die Milch, beigemischte Luft bildet Schaum. Beides fließt durch den
   eigenen Milchauslass ins Glas.
4. Das Gerät wechselt vom Dampfmodus zur niedrigeren Brühtemperatur.
   Ein kurzer Wasserstoß benetzt das Kaffeemehl. Während der anschließenden
   Quellpause ruht die Pumpe.
5. Die Pumpe drückt heißes Wasser von unten durch den verdichteten,
   feuchten Kaffee nach oben. Der Extrakt läuft durch das obere Sieb
   und den Kaffeeauslauf in die Tasse.
6. Die Pumpe stoppt, der Druck wird abgebaut. Restwasser geht zur
   Tropfschale. Danach öffnet die Mechanik, hebt den verbrauchten Puck aus
   der Kammer. Das untere Sieb hebt ihn über den Becherrand; ein U-förmiger
   Drahtbügel fährt über die Siebfläche und streift ihn nach hinten ab.
   Erst nach dem vollständigen Abstreifen fällt er in den Tresterbehälter.
7. Die leere Kammer fährt in ihre Grundstellung zurück.

Der Espresso-Modus überspringt Milchbereitung und den Wechsel vom Dampf-
zum Brühmodus. Ein Latte-Durchlauf dauert 110 Demo-Sekunden, Espresso 84.

## Bedienung

| Bedienelement | Wirkung |
|---|---|
| Kaffee zubereiten / Pause | Starten, pausieren und fortsetzen |
| ↺ / Zurücksetzen | Tank füllen, Tresterbehälter leeren und Ablauf neu beginnen |
| Getränk | Latte macchiato oder Espresso wählen; Restwasser und gesammelte Pucks bleiben erhalten |
| Tempo | 0,5×, 1×, 2× oder 4× |
| Zeitleiste / sechs Kapitel | Beliebigen Zeitpunkt oder Schritt ansehen |
| Gesamtansicht / Brühgruppe / Milchsystem / Wasserweg | Kamera ausrichten |
| Ziehen / Mausrad | Rundherum drehen / zoomen |
| Durchblick | Gehäuse von allen Seiten durchsichtig oder geschlossen zeigen |
| Bauteile | Anklickbare Erklärungen im 3D-Bild ein- oder ausblenden |
| Brühgruppe heraus | Pausiert; zieht den rechten Tank vor und die Brühgruppe nach rechts vom fest eingebauten Antrieb ab |
| Einzelschritte in der Brühgruppenansicht | Kammer fahren, Verdichten, Puck anheben oder Abstreifen mit 0,5× abspielen; hält am Schrittende an |
| i | Modellgrenzen und Quellen |
| Leertaste / R / 1–4 | Pause / Reset / Kameraansichten |

Beim Start wird die Schnittansicht eingeschaltet; sie kann auch während
des Laufs ausgeschaltet werden. Beim Fortsetzen wird eine herausgezogene
Brühgruppe wieder eingesetzt. Die Serviceansicht ist eine didaktische
Trennung der Baugruppen und keine Anleitung, die echte Maschine im Betrieb
zu öffnen. Tastenkürzel respektieren fokussierte Bedienelemente und Dialoge.
Heller und dunkler Modus folgen der Systemeinstellung.

Der ausdrücklich gekennzeichnete **Demo-Tank fasst 300 ml**, damit der
sinkende Wasserstand nach wenigen Bezügen sichtbar wird. Das ist nicht die
Tankkapazität des realen Geräts. Dampf entnimmt weniger Wasser pro Sekunde
als die Kaffeeextraktion; Vorbrühen und Temperaturwechsel verbrauchen
ebenfalls Wasser. Ein Espresso benötigt im Modell 56 ml, ein Latte 102 ml.
Bei leerem Tank hält die Maschine am erreichten Zeitpunkt an. Erst
„Zurücksetzen“ gibt einen neuen Durchlauf frei.

„Noch einen Kaffee“ behält den Restwasserstand und die feuchten Pucks im
Tresterbehälter bei. Jeder neue Puck fällt auf den vorhandenen Stapel.
Zurückspulen füllt kein Wasser nach, entfernt keine Pucks und zählt beim
erneuten Abspielen desselben Abschnitts weder Wasser noch Pucks doppelt.
Diese Vorräte gelten für die geöffnete Sitzung; ein Neuladen der Seite
startet die Simulation neu.

## Fachliche Einordnung

Die herausnehmbare Brühgruppe enthält **weder einen eigenen Antriebsmotor
noch die Wasserheizung**. Mahlwerk, Gehäusemotor, Pumpe und Heizung sind
separate Baugruppen. Philips nennt für das Aroma-Extract-System 90–98 °C
Brühwassertemperatur. Kaffee wird mit heißem flüssigem Wasser gebrüht;
der Dampfbetrieb ist für das Milchsystem vorgesehen.

Die Anzeige „Heizung“ ist eine illustrative Heizertemperatur, nicht die
Temperatur des Getränks in der Tasse. 130 °C im Dampfmodus, 93 °C im
Brühmodus und etwa 9 bar bei der Extraktion sind Modellwerte. Die
Pumpenspezifikation von 15 bar ist kein fester Brühdruck am Kaffeepuck.

Geometrien, Leitungsverlauf, Getriebe, Kolbenbewegung, Wassermengen und
Zeiten sind didaktisch vereinfacht. Die Bauteile sind teilweise räumlich
auseinandergezogen, damit die Wege sichtbar werden. Reihenfolge und
Überlappung einzelner Vorgänge hängen beim echten Gerät von Rezept und
Einstellungen ab; dies ist keine maßgetreue CAD-Rekonstruktion oder
Strömungssimulation. Teilchen stehen für Flussrichtungen; Wasserdampf ist
in Wirklichkeit unsichtbar. Schaumvolumen enthält Luft und entspricht
nicht derselben Menge entnommener Milch. Reinigungs- und Einschaltspülungen
werden nicht modelliert.

Die Brühgruppe orientiert sich an den kantigen Seitenwangen, dem eckigen
Einfülltrichter, dem oberen Kolben mit rotem Dichtring und den gelben
Bedienelementen der Referenzfotos. Der sichtbare Kraftweg führt vom
Gehäusemotor über Schnecke, Getriebe und Kupplung zu Kurbel und Gelenkhebeln.
Führungen und Gestänge sind zur Erklärung vereinfacht. Der Drahtbügel wartet,
bis das untere Sieb den Puck freigegeben hat; nach dem Abstreifen kehren
Sieb und Bügel in ihre Grundstellung zurück.

Von der Gerätefront aus gesehen sitzt der Wassertank rechts. Brühgruppe und
Antrieb sind als zusammengehöriges Paar gespiegelt: Der Motor bleibt links,
die Gruppe wird nach rechts entnommen. Kammer, Bügel und seine Führungen
liegen während des gesamten Brühzyklus hinter der geschlossenen Front.
Mahltrichter, Tresterbehälter, Anschlüsse und Kameras folgen dieser Anordnung.
In der Serviceansicht fährt zuerst der Tank nach vorne aus dem Entnahmeweg;
beim Einsetzen läuft die Reihenfolge umgekehrt.

## Technik und Prüfung

- `cycle.mjs`: deterministisches, zeitabhängiges Ablaufmodell ohne WebGL.
- `session.mjs`: dauerhafter Wasservorrat und Puckzähler, Tankstopp und Reset.
- `brew-mechanics.mjs`: Kammer, Verdichtung, unterer Kolben, Drahtbügel und
  Puckbahn als jederzeit vor- und zurückspulbares Bewegungsmodell.
- `layout.mjs`: Einbaupositionen, Spiegelung und Reihenfolge der Entnahme.
- `scene.js`: prozedurale Geometrien, Kamerasteuerung und Flussanimationen.
- `app.js`, `index.html`, `style.css`: Bedienung und deutsche Erklärungen.
- `node --test coffeesim/*.test.mjs`:
  Ablauf, Grenzen, Pause, Mengen, Espresso, konsistentes Vor-/Zurückspringen,
  Siebkontakt, Bügelkontakt, Randfreiheit, Reichweite der Gelenkhebel sowie
  Gehäusefreiraum und die rechte Entnahme anhand der tatsächlichen 3D-Geometrie,
  mehrere Bezüge bis zum Tankstopp, Ressourcenerhalt beim Zurückspulen sowie
  Stapelhöhen, Kollisionsfreiheit und Übergang vom fallenden zum abgelegten Puck.
- Browserdiagnose: `COFFEESIM.snapshot()`, `seek(sekunden)`, `play()`,
  `pause()`, `reset()` und `view('overview'|'brew'|'milk'|'water')`.

## Quellen

- [Philips 5400 Series: Produktdatenblatt EP5447](https://www.documents.philips.com/assets/20220207/b59bacc1f77f41b48f54ae350118d1e2.pdf):
  herausnehmbare Brühgruppe, Keramikmahlwerk, Vorbrühfunktion, 90–98 °C,
  Behälterkapazitäten und Pumpenspezifikation.
- [Philips-Servicehandbuch EP4300/5400, Version 1.1, April 2023](https://www.atarserviss.lv/image/files/Philips/Philips%205400/EP5447-90-1.pdf)
  (Philips-Dokument beim Serviceanbieter): Getriebe und äußerer
  Brühgruppenantrieb auf S. 13, eigenes Mahlwerk auf S. 14,
  LatteGo-Mischprinzip auf S. 11 und 15, separate Heizung auf S. 22.
- [Philips Support: Brühgruppe einsetzen](https://www.usa.philips.com/c-t/XC000004216/i-cannot-insert-the-brew-group-into-my-philips-espresso-machine):
  Grundstellung der Gruppe und Zahnrad im Maschinengehäuse.
- [Philips: Tresterbehälter CP0985](https://www.philips.co.uk/c-p/CP0985_01/coffee-grounds-container):
  separater Auffangbehälter für gebrauchte Kaffeepucks, passend zur EP5400-Serie.
- [Dokumentierte Zerlegung einer Saeco-Brühgruppe](https://www.ifixit.com/Guide/Replacing+the+gasket-seal+of+the+brewing+unit+of+Saeco+XSmall/122345):
  Schritt 2–3 zeigen Kaffeeauslass, Cremaventil und oberen Kolben dieser Bauart.

Die vom Nutzer bereitgestellten Produktbilder dienen als visuelle Referenz.
Die Szene erzeugt alle Formen selbst und bindet diese Fotos nicht ein.
