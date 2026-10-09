# DishLab — Geschirrspüler in 3D

Ein einsehbarer Geschirrspüler mit Edelstahlrahmen, Drahtkörben und violettem
Geschirr, angelehnt an die Bildreferenz. Die frei drehbare Three.js-Szene nutzt
die im Pinsetter-Projekt lokal vorhandene 3D-Bibliothek.

## Starten

Im Repository `npm start` ausführen und
[localhost:3000/dishsim/](http://localhost:3000/dishsim/) öffnen.
Die Projektstartseite enthält ebenfalls eine Karte für den Simulator.

## Was der Spülgang zeigt

1. **Wasser einlassen und vorspülen:** Wenige Liter sammeln sich im Bodenbereich.
   Die Umwälzpumpe versorgt die Sprüharme; die Wasserstrahlen lösen erste
   Speisereste. Das Geschirr steht nicht in einer gefüllten Wanne.
2. **Schmutzwasser abpumpen:** Wasser und feine Schmutzanteile verlassen die
   Maschine. Das Sieb hält gröbere Speisereste zurück.
3. **Hauptwäsche mit Reiniger:** Frisches Wasser wird erwärmt, das Reinigerfach
   öffnet sich, der Tab löst sich auf. Warmes Wasser, Reiniger und wiederholte
   Strahltreffer entfernen die sichtbaren Beläge. Die Sprüharme drehen sich
   durch den Rückstoß ihrer schräg gerichteten Düsen.
4. **Wärme zurückgewinnen und zwischenspülen:** Die seitliche Wassertasche
   bevorratet sauberes Wasser. Wärme aus dem heißen Spülraum erwärmt diesen
   Vorrat durch die trennende Wand. Das vorgewärmte Wasser dient dem nächsten
   Spülschritt; Schmutzwasser und Frischwasser vermischen sich dabei nicht.
5. **Heiß klarspülen:** Frisches Wasser entfernt letzte Rückstände. Klarspüler
   unterstützt das Ablaufen des Wasserfilms; der heiße Spülgang erwärmt das
   Geschirr für die anschließende Trocknung.
6. **Abpumpen und kondensieren:** Kaltes Wasser in der Seitentasche kühlt die
   angrenzende Wand. Die im Geschirr gespeicherte Wärme lässt Wasser auf seiner
   Oberfläche verdunsten. Der Wasserdampf kondensiert an der kühleren Wand;
   Tropfen laufen zum Sumpf und werden abgeführt. Die Sprüharme stehen dabei.
7. **Sauber und trocken:** Das Keramikgeschirr ist sauber und trocken. Einige
   gröbere Reste bleiben im Sieb sichtbar: Das Sieb muss auch bei einer echten
   Maschine regelmäßig gereinigt werden.

## Bedienung

| Bedienelement | Wirkung |
|---|---|
| Start / Pause | Spülgang starten, anhalten und fortsetzen |
| Zurücksetzen (↺) | Anfangszustand mit schmutzigem Geschirr wiederherstellen |
| Tempo | Ablauf mit 1×, 2×, 4× oder 8× ansehen |
| Zeitleiste / Programmphasen | Zu einem beliebigen Zeitpunkt oder einer Phase des Spülgangs springen |
| Übersicht / Wassertasche / Sieb & Pumpe / Trocknung | Vorgegebene Kameraperspektive wählen |
| Ziehen im 3D-Bild | Kamera um die Maschine drehen |
| Mausrad | Kamera hinein- und herauszoomen |
| Schnittansicht | Durchsichtige Erklärung und geschlossenere Geräteansicht vergleichen |
| Bauteile | Bauteilbezeichnungen ein- und ausblenden |
| Information (i) | Hinweise zur dargestellten Bauart und zu den Modellwerten |
| Leertaste | Spülgang pausieren oder fortsetzen |
| `R` | Spülgang zurücksetzen |
| `1`–`4` | Übersicht, Wassertasche, Sieb & Pumpe oder Trocknung wählen |

Die Tastenkürzel funktionieren, wenn das 3D-Bild oder der Seitenhintergrund
den Fokus hat. Eingabefelder, Schaltflächen und der Infodialog behalten ihre
eigene Tastaturbedienung. Ein Klick auf eine Bauteilbeschriftung öffnet eine
Erklärung und die passende Kameraansicht.

## Modell und Grenzen

Dargestellt wird ein **beispielhafter Geschirrspüler mit seitlichem
Wärmetauscher und Kondensationstrocknung**. Nicht jedes Gerät besitzt diese
Wassertasche; andere Geräte nutzen etwa automatische Türöffnung, einen
Luftstrom oder Zeolith zur Unterstützung der Trocknung.

Ein kompletter Durchlauf dauert bei 1× ungefähr **3½ Minuten**. Zeitabläufe,
Temperaturen und Mengen sind didaktische Modellwerte, keine Messdaten eines
bestimmten Fabrikats. Echte Programme dauern wesentlich länger. Auch die
sichtbaren Wasserstrahlen, Schmutzteilchen und Kondensationsspuren sind für
die Erklärung vergrößert. Wasserdampf selbst ist unsichtbar.

Die offene Ansicht ist ein Schnittmodell: Im Betrieb wäre die Tür dicht
verschlossen. Die Animation berechnet keine Strömungsmechanik, Chemie oder
Tropfenkollisionen. Wasserführung, Pumpen, Reiniger, Temperaturen,
Verschmutzung und Trocknung folgen einem gemeinsamen, zeitabhängigen
Zustandsmodell. Dadurch bleibt auch ein Sprung auf der Zeitleiste konsistent.

Klarspüler senkt die Oberflächenspannung und hilft Wasser abzulaufen; er
ersetzt keinen Reiniger. Kunststoff speichert weniger Wärme und trocknet in
einer realen Maschine häufig schlechter als Keramik. Eine feuchte Innenwand
am Ende ist bei Kondensationstrocknung normal.

## Technik

- Statische HTML-/CSS-/JavaScript-Dateien, ohne Build-Schritt und ohne neue
  Paketabhängigkeiten.
- Three.js aus `../pinsim/three.module.min.js` mit dem danebenliegenden
  `three.core.min.js`; kein CDN-Aufruf nötig.
- Prozedural erzeugte Geometrien und Materialien.
- Zyklusmodell in `cycle.mjs`, unabhängig von WebGL.
- Diagnose in der Browserkonsole: `DISHSIM.snapshot()` liest den aktuellen
  Zustand; `DISHSIM.seek(170)` springt zu einer Demo-Sekunde. Außerdem stehen
  `DISHSIM.play()`, `DISHSIM.pause()` und `DISHSIM.reset()` zur Verfügung.
- Modellprüfungen im Repository mit `node --test dishsim/cycle.test.mjs`.

## Fachliche Quellen

- [Bosch: Tips to Maximize Drying](https://www.bosch-home.com/us/en/c/spotlight/bltcab88ca4f3027fe1) — heißes Klarspülen, Kondensation an der kühleren Innenwand und die Rolle des Klarspülers.
- [Bosch: Dishwasher Buying Guide](https://www.bosch-home.co.uk/experience-bosch/buying-guides/dishwasher-buying-guide) — Vorwärmung des Spülwassers im Wärmetauscher zur Verringerung von Temperatursprüngen.
- [BSH: Patentschrift US20120073608A1](https://patents.google.com/patent/US20120073608A1/en) — technischer Hintergrund zu einer thermisch an den Spülraum gekoppelten Wassertasche, Wärmerückgewinnung und kalter Befüllung zu Beginn der Trocknung.
- [Bosch: Gebrauchsanleitung, Hinweise zur Trocknung](https://media3.bosch-home.com/Documents/9001286237_B.pdf) — geringere Wärmespeicherung von Kunststoff und verbleibende Feuchte an der Innenwand.
