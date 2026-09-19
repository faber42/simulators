# Metro — automatische U-Bahn

Eine stationäre Frontkamera in einem fiktiven, vollautomatischen Metronetz.
Die Simulation startet unmittelbar beim Öffnen, ohne Cockpit und ohne Bedienpult.

## Start

Im Projektverzeichnis `npm start` ausführen, dann `http://localhost:3000/metrosim/`
öffnen oder die neue Metro-Karte in der Simulatorenübersicht wählen.

## Ablauf

- Zu Beginn steht der Zug vor einem roten Signal. Nach 5,5 Sekunden erfolgt die
  Freigabe; 1,25 Sekunden später beschleunigt der Zug bis auf 60 km/h.
- Zwei weitere Signale liegen auf dem Weg zur ersten Station. Die Kamera folgt
  der Strecke mit sehr dezenter, geschwindigkeitsabhängiger Vibration.
- Der Zug bremst bis zum Halt neun Meter vor dem Bahnsteigende. Das Ausfahrsignal
  steht dahinter im Tunnel und bleibt während des Türzyklus rot.
- Türanzeige: 2 Sekunden Öffnen, 8 Sekunden offen, 2,8 Sekunden Schließen.
  Danach folgen Abfertigung, grünes Signal und die Weiterfahrt.
- Sechs Stationsvarianten wiederholen sich entlang einer endlos erzeugten
  Strecke: Rathaus, Museum, Westhafen, Opernplatz, Botanischer Garten und
  Zentralbahnhof. Farben, Krümmung, Bahnsteigseite und Zugänge variieren.
- Die Bahnsteige haben Säulen, Bänke, taktile Sicherheitsstreifen, abstrakte
  Werbeplakate, Stationsnamen und Anzeigen mit „Zug fährt ein“. Rolltreppen bzw.
  Aufzüge sind als räumliche Stationsausstattung modelliert.
- Fahrgäste haben bewegliche Köpfe, Arme und Beine. Einige warten, sehen aufs
  Telefon oder verlagern ihr Gewicht; andere gehen kurze Wege am Bahnsteig.

## Tastatur

| Taste | Funktion |
| --- | --- |
| Leertaste | Pause / weiter |
| F | Vollbild |
| H | Kamera- und Betriebsinformationen aus-/einblenden |

Die Türanzeige bleibt auch beim Ausblenden der übrigen Informationen sichtbar.
In einem verborgenen Browser-Tab pausiert die Simulationszeit automatisch.

## Technik

- Three.js aus `../pinsim/three.module.min.js`; dieselbe lokal beiliegende Version
  wie beim Pinsetter. Kein CDN, Download oder zusätzlicher Build nötig.
- Vollständige 3D-Geometrie; deterministische Fahrdynamik mit 60-Hz-Zeitschritt.
- Prozedurale Canvas-Texturen, raue Betonoberflächen, Kachelwände, metallische
  Schienen, Punktlichter und Zugbeleuchtung.
- HDR-Renderziel, Bloom, tiefenbasierte Kontaktschatten, Belichtungsanpassung,
  dezente Vignette, Linsenverzeichnung und Sensorkorn.
- 24-Meter-Abschnitte werden fortlaufend erzeugt und wieder freigegeben. Geometrie
  wird nach Material zusammengefasst; Leuchten und Texturen bleiben begrenzt.
  Die Geometriekoordinaten sind lokal zum Abschnitt, damit auch lange Fahrten
  nicht durch große GPU-Koordinaten instabil werden.
- Die Szene ist eine prozedurale Echtzeitdarstellung. Insbesondere die Fahrgäste
  sind vereinfachte, animierte 3D-Modelle, keine gescannten Menschen.

## Prüfung und Diagnose

`node --test metrosim/route.test.mjs` prüft Freigabe, Bremsen, Türverriegelung,
Pause, Stationsübergänge und eine Stunde durchgehenden Betrieb.

In der Browser-Konsole: `METROSIM.snapshot()`, `METROSIM.pause()`,
`METROSIM.setSpeed(4)`, `METROSIM.advance(60)`, `METROSIM.inspectStation(1, 20)`
und `METROSIM.restart()`.

Reproduzierbare Ansichten für visuelle QA:

- `?view=station&station=0&offset=20`: linker Bahnsteig mit Rolltreppe, pausiert.
- `?view=station&station=1&offset=12`: rechter, gekrümmter Bahnsteig mit Aufzug.
- `?time=52&paused=1`: erster Halt mit offenen Türen.
- `?rate=8`: beschleunigter Dauerlauf für die Prüfung mehrerer Stationen.

Die normale URL startet immer am roten Signal. Die Diagnoseansichten sind
optional und gehören nicht zur Bedienoberfläche.
