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
   der Kammer und streift ihn in den separaten Tresterbehälter ab.
7. Die leere Kammer fährt in ihre Grundstellung zurück.

Der Espresso-Modus überspringt Milchbereitung und den Wechsel vom Dampf-
zum Brühmodus. Ein Latte-Durchlauf dauert 110 Demo-Sekunden, Espresso 84.

## Bedienung

| Bedienelement | Wirkung |
|---|---|
| Kaffee zubereiten / Pause | Starten, pausieren und fortsetzen |
| ↺ | Leere Tasse und Anfangszustand wiederherstellen |
| Getränk | Latte macchiato oder Espresso wählen; setzt den Ablauf zurück |
| Tempo | 0,5×, 1×, 2× oder 4× |
| Zeitleiste / sechs Kapitel | Beliebigen Zeitpunkt oder Schritt ansehen |
| Gesamtansicht / Brühgruppe / Milchsystem / Wasserweg | Kamera ausrichten |
| Ziehen / Mausrad | Rundherum drehen / zoomen |
| Durchblick | Gehäuse von allen Seiten durchsichtig oder geschlossen zeigen |
| Bauteile | Anklickbare Erklärungen im 3D-Bild ein- oder ausblenden |
| Brühgruppe heraus | Serviceansicht mit getrennter Brühgruppe und Antrieb; pausiert den Ablauf |
| i | Modellgrenzen und Quellen |
| Leertaste / R / 1–4 | Pause / Reset / Kameraansichten |

Beim Start wird die Schnittansicht eingeschaltet; sie kann auch während
des Laufs ausgeschaltet werden. Beim Fortsetzen wird eine herausgezogene
Brühgruppe wieder eingesetzt. Die Serviceansicht ist eine didaktische
Trennung der Baugruppen und keine Anleitung, die echte Maschine im Betrieb
zu öffnen. Tastenkürzel respektieren fokussierte Bedienelemente und Dialoge.
Heller und dunkler Modus folgen der Systemeinstellung.

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

## Technik und Prüfung

- `cycle.mjs`: deterministisches, zeitabhängiges Ablaufmodell ohne WebGL.
- `scene.js`: prozedurale Geometrien, Kamerasteuerung und Flussanimationen.
- `app.js`, `index.html`, `style.css`: Bedienung und deutsche Erklärungen.
- `node --test coffeesim/cycle.test.mjs`: Ablauf, Grenzen, Pause, Mengen,
  Espresso und konsistentes Vor-/Zurückspringen.
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
