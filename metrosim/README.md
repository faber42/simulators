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
  Werbeplakate, Stationsnamen und Anzeigen mit „Zug fährt ein“. Jede Station
  besitzt eine feste, massive Treppe sowie eine Rolltreppe oder einen Aufzug.
  Die Treppen haben tragende Unterbauten, Seitenwände und Handläufe; darüber
  öffnen sich die Decken zu Treppenschächten.
- Im Tunnel gibt es Notausgangstüren mit Podest, Rahmen, Panikstange und
  beleuchteter Beschilderung. In 180 m langen Ausweichabschnitten weitet sich
  die Röhre für ein zweites Gleis. Sichtbare Weichen führen das Nebengleis
  aus dem Hauptgleis heraus und anschließend wieder zurück. Der automatische
  Zug bleibt auf dem Hauptgleis.
- Fahrgäste bestehen aus jeweils einem zusammengefassten Skelettmodell mit
  geformten Körperkonturen, Gesichtern und Kleidung. Einige warten, sehen aufs
  Telefon oder verlagern ihr Gewicht; andere gehen kurze Wege am Bahnsteig.

## Tastatur

| Taste | Funktion |
| --- | --- |
| Leertaste | Pause / weiter |
| F | Vollbild |
| H | Kamera- und Betriebsinformationen aus-/einblenden |
| D | Leistungsdiagnose aus-/einblenden |

Die Türanzeige bleibt auch beim Ausblenden der übrigen Informationen sichtbar.
In einem verborgenen Browser-Tab pausiert die Simulationszeit automatisch.

## Leistungsdiagnose

Der Overlay zeigt die Bildrate des letzten Messintervalls (bis zu einer Sekunde),
einen 60-Sekunden-Verlauf und den **Zeitanteil unter 30 FPS**. Ein Frame zählt als
langsam, wenn sein ungekürztes Zeitintervall über 33,3 ms liegt. Beispielsweise
zählt ein Hänger von 500 ms mit seiner gesamten Dauer, statt nur als ein einzelner
Frame zwischen vielen schnellen Frames. Berechnet wird über ein gleitendes
60-Sekunden-Fenster; in der Anlaufphase über die bereits gemessene Zeit.

Zusätzlich erscheinen das 95. Perzentil der Framezeit, der längste Frame und die
Zahl der Zeichenaufrufe der 3D-Szene. Verborgene Tabs werden nicht mitgezählt;
ein pausierter, weiterhin sichtbarer Simulator misst seine Renderleistung weiter.

## Technik

- Three.js aus `../pinsim/three.module.min.js`; dieselbe lokal beiliegende Version
  wie beim Pinsetter. Kein CDN, Download oder zusätzlicher Build nötig.
- Vollständige 3D-Geometrie; deterministische Fahrdynamik mit 60-Hz-Zeitschritt
  und interpolierter Kamerabewegung zwischen den Simulationstakten.
- Prozedurale Canvas-Texturen, raue Betonoberflächen, Kachelwände, metallische
  Schienen, Punktlichter und Zugbeleuchtung.
- HDR-Renderziel mit 4× MSAA, vorgefiltertes Bloom mit weichem Übergang,
  Schattenflächen unter den Fahrgästen, Belichtungsanpassung, dezente Vignette
  und Linsenverzeichnung. Die Materialhöhen sind unabhängig vom feinen
  Farbrauschen geglättet. Instabile Tiefenableitungen und zeitlich wechselndes
  Sensorkorn werden nicht mehr verwendet.
- 24-Meter-Abschnitte werden fortlaufend erzeugt und wieder freigegeben. Geometrie
  wird nach Material zusammengefasst. Neue Abschnitte entstehen schrittweise
  in kleinen Arbeitsportionen vor dem Zug. Jeder Fahrgast benötigt einen
  Zeichenaufruf für seinen Körper statt vieler einzelner Körperteile.
  Leuchten bleiben fest an ihren Positionen und werden am Rand ihres Bereichs
  weich ausgeblendet; Leuchtenzahl und Texturen bleiben begrenzt.
  Die Geometriekoordinaten sind lokal zum Abschnitt, damit auch lange Fahrten
  nicht durch große GPU-Koordinaten instabil werden.
- Die Szene ist eine prozedurale Echtzeitdarstellung. Die Fahrgäste sind
  ausgeformte, animierte 3D-Modelle, keine gescannten Menschen.

## Prüfung und Diagnose

`node --test metrosim/route.test.mjs metrosim/diagnostics.test.mjs metrosim/crowd.test.mjs` prüft Freigabe,
Bremsen, Türverriegelung, Pause, Stationsübergänge, Weichenabschnitte und eine
Stunde durchgehenden Betrieb. Die Diagnoseprüfungen decken konstante FPS,
lange Hänger, die gleitende Fenstergrenze und ausgeblendete Tabs ab. Die
Fahrgastprüfung kontrolliert gültige Geometrie, Knochengewichte, Kopfbewegung
und genau einen Zeichenaufruf für den Körper jedes Fahrgasts.

In der Browser-Konsole: `METROSIM.snapshot()`, `METROSIM.pause()`,
`METROSIM.setSpeed(4)`, `METROSIM.advance(60)`, `METROSIM.inspectStation(1, 20)`
und `METROSIM.restart()`.

Reproduzierbare Ansichten für visuelle QA:

- `?view=station&station=0&offset=18`: linker Bahnsteig mit massiver Treppe.
- `?view=station&station=1&offset=60`: rechter, gekrümmter Bahnsteig mit Aufzug.
- `?time=19&paused=1`: verbreiterter Tunnel mit zweitem Gleis.
- `?time=52&paused=1`: erster Halt mit offenen Türen.
- `?rate=8`: beschleunigter Dauerlauf für die Prüfung mehrerer Stationen.
- `?diagnostics=1`: Diagnoseoverlay bereits beim Öffnen einblenden.

Die normale URL startet immer am roten Signal. Die Diagnoseansichten sind
optional und gehören nicht zur Bedienoberfläche.
