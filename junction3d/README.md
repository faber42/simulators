# Westfalendamm · Kreuzung in 3D

Eine neue, eigenständige 3D-Simulation der Kreuzung B1 / Westfalendamm mit
Voßkuhle und Semmerteichstraße in Dortmund. Die vorhandene Simulation in
`trafficsim/` bleibt unabhängig davon bestehen. Die Darstellung verwendet
Three.js wie die anderen 3D-Projekte in dieser Sammlung.

## Starten

Im Repository `npm start` ausführen und
<http://localhost:3000/junction3d/> öffnen. Es ist kein Build erforderlich.
Ein Browser mit WebGL-Unterstützung ist notwendig.

## Bedienung

- **Kameras:** Unten eine Perspektive wählen oder die Tasten **1–6** nutzen.
  Die Übersicht ist frei drehbar; bei den Mastkameras aktiviert **Freie Ansicht**
  die Bewegung. Mit gedrückter linker Maustaste drehen, mit dem Mausrad zoomen.
  Bei einer festen Kamera verändert das Mausrad den Blickwinkel.
- **Eigene Kamera:** Im Lageplan **+ Kamera** wählen, zuerst den Standort und
  anschließend das Blickziel anklicken. Höhe (3–40 m) und Blickwinkel (25–85°)
  in der Vorschau einstellen und **Kamera speichern** drücken. Weitere Klicks
  verändern das Blickziel. Alternativ im Lageplan mit den Pfeiltasten den
  Auswahlpunkt bewegen und mit **Enter** bestätigen; **Esc** bricht ab.
  Bis zu acht eigene Kameras bleiben im Browserspeicher je Standort erhalten.
  Das **×** an einer eigenen Kamera entfernt sie. Ist der Browserspeicher
  gesperrt, gelten die Kameras nur für die aktuelle Sitzung.
- **Verkehr:** **Pause** beziehungsweise die **Leertaste** hält die Simulation
  an. **1× / 2× / 4×** verändert den Zeitablauf. Der Regler
  **Verkehrsaufkommen** steuert neue Zufahrten; bei null fahren bereits
  vorhandene Fahrzeuge weiter. **Neustart** setzt Verkehr und Umlauf zurück.
- **Ampeln:** **Nächste Phase** beendet die aktuelle Grünphase vorzeitig.
  Gelb, Räumzeit und Rot-Gelb werden weiterhin durchlaufen; eine belegte
  Kreuzung muss vor der nächsten Freigabe geräumt werden.
- **Darstellung:** **Abendlicht / Tageslicht** wechselt die Beleuchtung,
  **⛶** öffnet das Vollbild. Während der Browser-Tab verborgen ist, pausiert
  die Simulationszeit automatisch.

Globale Tastenkürzel greifen außerhalb fokussierter Eingabefelder und Buttons.

## Standort und Modellannahmen

Die Straßenform, der breite Mittelstreifen mit Stadtbahngleisen, die Haltestelle
Voßkuhle, die schräg einmündende nördliche Zufahrt, der südöstliche Grünbereich
und die markanten Gebäude wurden anhand der fünf vom Nutzer bereitgestellten
Google-Maps- und Street-View-Ansichten räumlich angenähert. Als Ortsreferenz dient
der [Google-Maps-Link zur Kreuzung](https://www.google.de/maps/@51.5034529,7.4972166,17.99z/data=!5m1!1e1?entry=ttu).
Die Szene besteht aus eigener Geometrie; Google-Kartenkacheln oder Bildtexturen
werden nicht geladen. Sie ist eine anschauliche Rekonstruktion, kein vermessener
digitaler Zwilling. Die B1 wurde für das lokale Koordinatensystem begradigt.

Die Reihenfolge der Freigaben folgt der Beschreibung des Nutzers:

1. Hauptstraße: West → Ost und Ost → West gleichzeitig.
2. Nebenstraße aus der Voßkuhle: Richtung Süd, einschließlich links nach Ost.
3. Hauptstraße: erneut beide Richtungen.
4. Nebenstraße aus der Semmerteichstraße: Richtung Nord, einschließlich links nach West.

`north` bezeichnet die **Herkunft** im Norden, also die Freigabe **nach Süden**.
`south` bezeichnet entsprechend die Herkunft im Süden. Die Gegenrichtung der
Nebenstraße bleibt jeweils gesperrt. Rechtsabbieger sind derselben Freigabe
zugeordnet. Abbieger von der B1 sind in dieser ersten Standortkonfiguration
nicht enthalten.

Grünzeiten (32 / 22 / 32 / 22 Sekunden), Gelb (3 Sekunden), Räumzeit
(3 Sekunden) und Rot-Gelb (1 Sekunde) sind Demonstrationswerte, kein bestätigter
Signalzeitenplan. Verkehrsaufkommen, Fahrbahnbreiten, Spuranordnung,
Gebäudehöhen und Geschwindigkeiten sind ebenfalls editierbare Annahmen.
Stadtbahnanlagen, Gehwege und Umgebung sind Kulisse; ein eigener Stadtbahn-,
Fußgänger- oder Radverkehrsbetrieb ist nicht modelliert.
Auf den Nebenstraßen fahren Pkw und Lieferwagen. Die vereinfachten engen
Fahrkurven bilden den zusätzlichen Platzbedarf ausschwenkender langer Busse
nicht ab; Busse bleiben deshalb auf den geraden B1-Routen.

## Aufbau

Standortdaten stehen in `locations/dortmund.mjs`. Das Modul exportiert
`dortmund` sowohl benannt als auch als Standardexport. Die Simulationslogik
arbeitet mit Routen, Signalgruppen und räumlichen Grenzen; sie benötigt keine
Dortmunder Straßennamen. Die Darstellung liest dieselben Daten für Fahrbahnen,
Umgebung, Signalpositionen und Kameras.

| Datei | Verantwortung |
| --- | --- |
| `app.mjs` | Bedienung, Simulationsuhr, Kameraauswahl und Lageplan. |
| `engine.mjs` | Fahrwege, Fahrzeuge, Abstandshaltung und Signalzustände ohne Browser- oder Three.js-Abhängigkeit. |
| `scene.mjs` | Three.js-Szene, Straßen, Fahrzeuge, Ampeln und Kameradarstellung. |
| `environment.mjs` | Wiederverwendbare Modellbausteine für Gebäude, Grün und Straßenausstattung. |
| `locations/dortmund.mjs` | Konkrete Ortsgeometrie und Betriebsparameter. |
| `engine.test.mjs` | Automatisierte Prüfungen der Fahr- und Signallogik. |

Die Engine-Prüfungen lassen sich vom Repository-Hauptverzeichnis mit
`node --test junction3d/engine.test.mjs` ausführen. Sie prüfen die Logik
unabhängig von der 3D-Darstellung.

Alle Längen sind Meter, Zeiten Sekunden und Geschwindigkeiten Meter pro
Sekunde. Im dreidimensionalen System gilt `+x = Osten`, `+y = oben`,
`+z = Süden`. Grundrisspunkte haben das Format `[x, z]`, Kamerapositionen und
Blickziele das Format `[x, y, z]`. Gebäude-Drehungen sind im Bogenmaß angegeben.

| Datenfeld | Aufgabe |
| --- | --- |
| `roads` | Sichtbare Straßen: Polylinie `points`, Breite `width`, Spurzahl `lanes`. |
| `routes` | Tatsächliche Fahrwege mit Haltepunkt, Zufluss und Signalzuordnung. |
| `phases` | Geordnete Freigaben: `groups` nennt erlaubte Signalgruppen, `duration` die Grünzeit. |
| `timing` | Übergänge `yellow`, `allRed` und `redAmber`. |
| `conflictBounds` | Rechteck des zu räumenden Kreuzungsbereichs im Grundriss. |
| `cameras` | Kameravorgaben mit Position, Blickziel und vertikalem Sichtwinkel `fov` in Grad. |
| `environment` | Gebäude, Baumzonen, Grünbereich, Gleise, Haltestelle und Tankstelle. |
| `seed` | Startwert für reproduzierbaren Zufallsverkehr. |
| `source` | Ortsreferenz und Hinweise zur Herkunft und Genauigkeit der Rekonstruktion. |

Eine Route beschreibt einen vollständigen Fahrweg von der Einfahrt bis zur
Ausfahrt des sichtbaren Gebiets. `stopLine` liegt auf diesem Weg. `group`
verbindet die Route mit dem Signalprogramm. `laneId` bezeichnet die gemeinsame
Zufahrtsspur; mehrere Routen aus derselben Spur müssen hier denselben Wert
verwenden. `exitId` bezeichnet eine gemeinsame Ausfahrtsspur. Routen mit gleicher
`exitId` müssen auf derselben Spur und **am exakt gleichen Endpunkt** enden,
damit die Abstandsregelung beim Zusammenführen konsistent bleibt. `rate`
definiert Fahrzeuge pro Stunde, `speed` die gewünschte Geschwindigkeit.
`turn` ist `straight`, `left` oder `right`.
Mit `vehicleKinds` kann eine Route auf eine Auswahl aus `car`, `van` und `bus`
beschränkt werden. Ohne diese Angabe verwendet sie den allgemeinen Fahrzeugmix.

Die Straßenflächen und Fahrwege sind absichtlich separate Daten: Eine breite
Straße allein erzeugt keine befahrbaren Spuren. Nach einer Geometrieänderung
müssen daher auch Routen, Haltepunkte und Kameras überprüft werden.

## Eine andere Kreuzung vorbereiten

1. `locations/dortmund.mjs` als neues Standortmodul kopieren und ID,
   Bezeichnung, Ortsreferenz und Koordinaten ersetzen.
2. Aus Luftbild und Straßenansichten einen lokalen Ursprung und die
   Meter-Skalierung festlegen. Fahrbahnen einschließlich Mittelstreifen,
   Verkehrsinseln und versetzter Einmündungen als `roads` eintragen.
3. Für jede erlaubte Fahrbeziehung eine Route mit passenden Ein- und
   Ausfahrtsspuren anlegen. Die Punkte müssen auf der Fahrbahn liegen;
   Kurven brauchen mehrere Leitpunkte. Haltepunkte vor dem Konfliktbereich
   setzen und genügend Auslauf bis zum Szenenrand vorsehen.
4. Fahrbeziehungen Signalgruppen zuordnen. Nur konfliktfreie Gruppen
   gemeinsam in einer Phase freigeben. `conflictBounds` so wählen, dass
   Fahrzeuge den gesamten gemeinsamen Kreuzungsbereich räumen müssen.
5. Zuflüsse und Geschwindigkeiten plausibel einstellen. Beobachtete oder
   bestätigte Werte von Annahmen in der Standortdokumentation unterscheiden.
6. Gebäude, Grünflächen, Baumzonen und optionale Anlagen konfigurieren;
   Objekte von den Fahrwegen fernhalten. Kamera-Masten außerhalb der
   Fahrbahnen mit Blickzielen im Kreuzungsbereich platzieren.
7. Den Standortimport in der Anwendung auf das neue Modul umstellen.
   Einen vollständigen Umlauf mit geringem und hohem Verkehrsaufkommen
   beobachten und aus jeder Kamera Haltepunkte, Abbieger, Rückstau und
   Phasenwechsel kontrollieren.

Ein Agent kann diese Anpassungen anhand einer neuen Kartenreferenz und
Beobachtungen vornehmen. Ein automatischer Google-Maps-Import ist nicht Teil
der Anwendung. Die allgemeine Simulationslogik muss für eine andere
Geometrie mit demselben Datenmodell nicht verändert werden.
