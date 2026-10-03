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

- **Kameras:** Unten eine Perspektive wählen oder die Tasten **1–7** nutzen.
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
  Gelb, Räumzeit und Rot-Gelb werden weiterhin durchlaufen. Die inneren Ampeln
  bleiben während des Nachlaufs grün, bis der bereits eingelassene Verkehr
  ausgefahren ist; erst anschließend wechseln auch sie über Gelb auf Rot.
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

Die Reihenfolge der Freigaben folgt der Beschreibung und den ergänzenden
markierten Ansichten des Nutzers:

1. **B1 geradeaus in beiden Richtungen.** Nach 7 Sekunden wird zusätzlich die
   eigene Linksabbiegerspur aus Osten freigegeben. Diese Fahrzeuge biegen in
   den Mittelbereich Richtung Süd ein und halten an dessen roter Ampel.
2. **Mittelbereich Richtung Süd zuerst.** Die wartenden B1-Linksabbieger fahren
   in die Semmerteichstraße aus. Nach 5 Sekunden erhält auch die Voßkuhle Grün,
   einschließlich ihrer Linksabbieger nach Osten. Geradeaus- und Linksabbieger
   aus der Voßkuhle passieren nacheinander die äußeren und inneren Ampeln.
3. **B1 wieder geradeaus in beiden Richtungen.** Nach 7 Sekunden wird die
   eigene Linksabbiegerspur aus Westen freigegeben. Diese Fahrzeuge biegen in
   den Mittelbereich Richtung Nord ein und warten an dessen roter Ampel.
4. **Mittelbereich Richtung Nord zuerst.** Die wartenden B1-Linksabbieger fahren
   in die Voßkuhle aus. Nach 5 Sekunden erhält auch die Semmerteichstraße Grün,
   einschließlich ihrer Linksabbieger nach Westen.

Die äußere B1-Linksabbiegerampel wird zusammen mit der Hauptstraße rot.
Nur die jeweilige Mittelampel bleibt anschließend gemeinsam mit der
Nebenstraße grün; die äußere B1-Zufahrt bleibt in dieser Zeit gesperrt.

`north` bezeichnet die **Herkunft** im Norden, also die Freigabe **nach Süden**.
`south` bezeichnet entsprechend die Herkunft im Süden. Die Gegenrichtung der
Nebenstraße bleibt jeweils gesperrt. Deren Rechtsabbieger benötigen nur die
äußere Ampel und sind derselben Freigabe zugeordnet. Die beiden innersten
B1-Spuren sind ausschließlich Linksabbiegerspuren; daneben bleiben je zwei
Geradeausspuren. B1-Rechtsabbieger sind in dieser Standortkonfiguration nicht
enthalten.

Jeder Wartebereich fasst höchstens zwei Fahrzeuge. B1-Linksabbieger und der
nachfolgende Geradeausverkehr aus der Nebenstraße benutzen denselben
Wartebereich und dieselbe Ausfahrtsspur. Eine volle Mitte sperrt weitere
Einfahrten an der äußeren Haltelinie, auch bei Grün. Ein reservierter Platz
wird erst frei, wenn das Fahrzeug die innere Haltelinie vollständig passiert
hat. Zwei kleine Inseln tragen die inneren Ampelmasten; dazwischen bleiben die
Stadtbahngleise frei.

Am Ende einer Nebenstraßenphase werden zuerst die äußeren Zufahrten
geschlossen. Die inneren Ampeln bleiben als **Nachlauf** grün, bis der bereits
eingelassene Verkehr ausgefahren ist, und wechseln danach ebenfalls über Gelb
auf Rot. Fahrzeuge, die während einer B1-Phase vollständig im Mittelbereich
warten, blockieren den Phasenwechsel dagegen nicht. Die Prüfungen unterscheiden
deshalb den ersten geräumten Konfliktabschnitt vom noch ausstehenden zweiten
Signalhalt.

Grünzeiten (32 / 22 / 32 / 22 Sekunden), Gelb (3 Sekunden), Räumzeit
(3 Sekunden), Rot-Gelb (1 Sekunde) sowie die Verzögerungen von 7 und 5 Sekunden
sind Demonstrationswerte, kein bestätigter Signalzeitenplan. Die tatsächliche
Phasendauer kann sich durch Räumung und Nachlauf verlängern.
Verkehrsaufkommen, Fahrbahnbreiten, Spuranordnung,
Gebäudehöhen und Geschwindigkeiten sind ebenfalls editierbare Annahmen.
Die beiden B1-Linksabbiegerspuren erhalten je 45 Fahrzeuge pro Stunde bei
Verkehrsfaktor 1. Die Nebenstraßen erhalten je 140 geradeaus fahrende und
90 links abbiegende Fahrzeuge pro Stunde; der Standardregler startet bei
Faktor 0,8. Diese Demonstrationszuflüsse berücksichtigen die kleine
Aufstellfläche und die kurze Nebenstraßenfreigabe. Bei erhöhtem
Verkehrsaufkommen darf bewusst Rückstau entstehen.
Stadtbahnanlagen, Gehwege und Umgebung sind Kulisse; ein eigener Stadtbahn-,
Fußgänger- oder Radverkehrsbetrieb ist nicht modelliert.
Auf den Nebenstraßen und B1-Abbiegespuren fahren Pkw und Lieferwagen. Die vereinfachten engen
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
| `routes` | Tatsächliche Fahrwege mit geordneten Signalhalten, Zufluss und Speicherkapazität. |
| `phases` | Freigaben mit `groups`, Grünzeit `duration`, gruppenweisen Verzögerungen `groupDelays` und optionalen Nachlaufgruppen `drainGroups`. |
| `timing` | Übergänge `yellow`, `allRed` und `redAmber`. |
| `conflictBounds` | Rechteck des zu räumenden Kreuzungsbereichs im Grundriss. |
| `islands` | Unbefahrbare Inseln als Grundrisspolygone `points`. |
| `signalGantries` | Masten mit `anchor`, `height` und den daran montierten Signalhalt-IDs `stopIds`. |
| `cameras` | Kameravorgaben mit Position, Blickziel und vertikalem Sichtwinkel `fov` in Grad. |
| `environment` | Gebäude, Baumzonen, Grünbereich, Gleise, Haltestelle und Tankstelle. |
| `seed` | Startwert für reproduzierbaren Zufallsverkehr. |
| `source` | Ortsreferenz und Hinweise zur Herkunft und Genauigkeit der Rekonstruktion. |

Eine Route beschreibt einen vollständigen Fahrweg von der Einfahrt bis zur
Ausfahrt des sichtbaren Gebiets. `stops` enthält ihre Signalhalte in Fahrtrichtung.
Jeder Eintrag besitzt eine `id`, die Signalgruppe `group`, die Haltelinienposition
`point` und optional die Richtung des Signalpfeils `arrow`. Die bisherigen
Felder `stopLine` und `group` bleiben Alias des ersten Halts für einfache
Routen. `laneId` bezeichnet die gemeinsame
Zufahrtsspur; mehrere Routen aus derselben Spur müssen hier denselben Wert
verwenden. `exitId` bezeichnet eine gemeinsame Ausfahrtsspur. Routen mit gleicher
`exitId` müssen auf derselben Spur und **am exakt gleichen Endpunkt** enden,
damit die Abstandsregelung beim Zusammenführen konsistent bleibt. `rate`
definiert Fahrzeuge pro Stunde, `speed` die gewünschte Geschwindigkeit.
`turn` ist `straight`, `left` oder `right`.
Mit `vehicleKinds` kann eine Route auf eine Auswahl aus `car`, `van` und `bus`
beschränkt werden. Ohne diese Angabe verwendet sie den allgemeinen Fahrzeugmix.

`clearPoint` beschreibt, ab wo ein Fahrzeug den **zu diesem Signalhalt
gehörenden** Konfliktabschnitt geräumt hat. Entscheidend ist, dass auch das
Fahrzeugheck diesen Punkt überschritten hat. Ohne Angabe wird die Ausfahrt
aus `conflictBounds` verwendet. Für mehrstufige Routen muss der erste
`clearPoint` vor dem zweiten Signal liegen und auch hinter dem Heck des
letzten dort zulässig wartenden Fahrzeugs genügend Abstand lassen.

`storage: { id, capacity }` am ersten Halt reserviert Platz bis zum folgenden
Signalhalt. Identische `storage.id` bedeutet einen gemeinsamen Wartebereich,
auch wenn Fahrzeuge aus verschiedenen Straßen kommen. Eine Kapazität von zwei
setzt entsprechend lange nutzbare Aufstellflächen voraus. `mergePoint` markiert
den Beginn einer gemeinsamen Ausfahrtsspur; zusammenführende Routen müssen ab
dort dieselben Leitpunkte und dieselbe `exitId` verwenden. Wiederholte
Signalhalt-IDs stehen für denselben physischen Signalgeber und dürfen daher
nur dieselbe Position und Signalgruppe bezeichnen.

`phase.groupDelays` ordnet einer Signalgruppe die Verzögerung in Sekunden ab
Beginn der Grünphase zu; nicht aufgeführte Gruppen starten sofort. Gruppen in
`drainGroups` behalten nach dem Schließen der äußeren Zufahrten ihre Freigabe,
bis die bereits eingelassenen Fahrzeuge ausgefahren sind. Mit `uiNote` und
`ui.signalIndicators` können standortspezifische Erklärungen und Anzeigen
ergänzt werden, ohne Ortsnamen in der Anwendung festzuschreiben.

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
   Kurven brauchen mehrere Leitpunkte. Äußere und gegebenenfalls innere
   Haltepunkte eintragen. Für Zwischenhalte Speicher, zusammenführende Spuren
   und die jeweiligen `clearPoint`-Positionen abstimmen. Genügend Auslauf bis
   zum Szenenrand vorsehen und Fahrzeughüllen von Inseln fernhalten.
4. Fahrbeziehungen Signalgruppen zuordnen. Nur konfliktfreie Gruppen
   gemeinsam in einer Phase freigeben. `conflictBounds` so wählen, dass
   Fahrzeuge den gesamten gemeinsamen Kreuzungsbereich räumen müssen.
   Bei geteilten Kreuzungen zusätzlich die räumbaren Teilabschnitte,
   verzögerten Freigaben und nötigen Nachlaufgruppen konfigurieren.
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
