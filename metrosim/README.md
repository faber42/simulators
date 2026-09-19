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
- Der Zug bremst bis zum Halt neun Meter vor dem Bahnsteigende. Im letzten
  langsamen Abschnitt wird die Bremskraft sanft zurückgenommen. Der Wagenkasten
  federt bei jedem Halt geringfügig auf und ab und etwa 4–5 mm zurück; die Kamera
  übernimmt diese gedämpfte Bewegung. Die Radposition bleibt am Haltepunkt.
  Dasselbe Nachfedern erfolgt auch beim zweiten Halt vor einem roten Signal.
  Erst nach 1,15 Sekunden Beruhigungszeit beginnt die Türöffnung samt Anzeige.
  Das Ausfahrsignal
  steht am Tunnelmund. Seine Freigabe hängt von einem eigenen Belegungszeitplan ab.
- Türanzeige: 2 Sekunden Öffnen, 8 Sekunden offen, 2,8 Sekunden Schließen.
  Danach folgen 1,4 Sekunden Abfertigung und die Abfahrt mit geschlossenen Türen.
  In den letzten 0,55 Sekunden der Vorbereitung löst die Bremse; erst danach
  baut sich die Zugkraft über 0,8 Sekunden weich auf. Auch beim Anfahren reagiert
  die Wagenfederung dezent auf die Beschleunigung.
  Das Signal kann schon während des Fahrgastwechsels grün werden, genau zur
  Abfahrt oder erst später. Bei Rot rollt der Zug vor und hält 4,5 Meter vor
  dem Signal erneut an. Nach etwa ein bis zwei Sekunden zusätzlicher Wartezeit
  wird der Block frei. Dieser Signalhalt öffnet keine Türen und zählt nicht
  als weiterer Stationshalt. Nach dem Wechsel auf Grün bleibt ein vor dem Signal
  stehender Zug noch 1,25 Sekunden stehen, bevor die Bremsen gelöst werden und er
  anfährt. Diese Reaktionszeit wird mit der Simulation pausiert. Manchmal erfolgt
  die Freigabe bereits beim Vorrollen; dann fährt der Zug ohne zusätzlichen Halt.
- Auch ausgewählte Tunnelsignale sind zunächst rot. Sie wechseln kurz vor dem
  herannahenden Zug auf Grün. Der Zug berücksichtigt sie vorher in seiner
  Bremskurve. Die Freigaben simulieren wechselnden Abstand zu einem vorausfahrenden
  Zug; ein vollständiger Verkehr mehrerer Züge wird noch nicht berechnet.
- Sechs Stationsvarianten wiederholen sich entlang einer endlos erzeugten
  Strecke: Rathaus, Museum, Westhafen, Opernplatz, Botanischer Garten und
  Zentralbahnhof. Farben, Krümmung, Bahnsteigseite und Zugänge variieren.
  Rathaus und Opernplatz haben durchgehend farbige Keramikwände in Türkis bzw.
  Terrakotta. Museum verwendet ockerfarbene Diagonalen, Westhafen blaue Kreise.
  Botanischer Garten behält das horizontale Band; Zentralbahnhof ist weiß.
  Kachelformate und Kopfwandgestaltung passen zur jeweiligen Variante.
- Die Bahnsteige haben Säulen, Bänke, taktile Sicherheitsstreifen, abstrakte
  Werbeplakate, Stationsnamen und Anzeigen mit „Zug fährt ein“. Jede Station
  besitzt eine feste, massive Treppe sowie eine Rolltreppe oder einen Aufzug.
  Die Treppen haben tragende Unterbauten, Seitenwände und Handläufe; darüber
  öffnen sich die Decken zu vollständig eingefassten Treppenschächten. Die
  oberen Räume haben geflieste Seiten- und Stirnwände, Deckenleuchten sowie
  Podeste mit Ausgangstüren. Ihre Decken und Wände decken die gesamte Öffnung
  ab und folgen auch gekrümmten Bahnsteigen. Manche Bahnsteige besitzen einen
  seitlichen, beleuchteten Verbindungsgang mit einer Ecke und Beschilderung
  zur Gegenrichtung.
  Rolltreppen haben 32 einzeln bewegte, geriffelte Stufen mit gelben Vorderkanten.
  Sie laufen aufwärts und tauchen unter die festen Abschlussplatten der Podeste;
  Pause hält auch die Stufen an. Die Stützkonstruktion liegt unter der Stufenbahn.
  Drei Sitzgruppen mit je drei Plätzen stehen an der Bahnsteigwand, abseits der
  Aufgänge und Durchgänge. Je zwei Plätze sind belegt: Ein Fahrgast verfolgt die
  einfahrende Bahn mit dem Kopf, der andere schaut auf ein schwarzes Smartphone
  in seiner Hand. Hüfte und Füße bleiben auf Sitzfläche und Bahnsteig abgestimmt.
- Im Tunnel gibt es Notausgangstüren mit Podest, Rahmen, Panikstange und
  beleuchteter Beschilderung. Feste Bauabschnitte von 96 bzw. 144 m wechseln
  zwischen dunklem verrußtem Beton, hellen Betonsegmenten, braunem Mauerwerk,
  altem Sichtbeton und hellem Anstrich. Die Unterschiede gehören zum Material
  und bleiben unabhängig von Kameraposition und Beleuchtung erhalten.
  Die Röhre weitet sich für ein zweites Gleis links
  oder rechts. Es gibt sowohl Ausweichgleise mit Rückführung als auch
  Abzweigungen: Hinter einem doppelten Tunnelportal biegt das Nebengleis in
  einer eigenen Röhre weiter ab. Die ungewählte Röhre enthält Schienen, Kabel,
  Laufstege und Leuchten und reicht 300 m hinter das Portal. Nach jeweils fünf,
  sechs oder sieben Stationen nimmt der Zug selbst den Abzweig. Seine Strecke
  führt kontinuierlich durch die gewählte Röhre bis zur nächsten Station.
  Die Auswahl des Streckenastes ist von der Geometrie getrennt und kann später
  von einer Netzroute bestimmt werden.
- Fahrgäste bestehen aus jeweils einem zusammengefassten Skelettmodell mit
  geformten Körperkonturen, Gesichtern und Kleidung. Einige warten, sehen aufs
  Telefon oder verlagern ihr Gewicht; andere gehen kurze Wege am Bahnsteig.
  Köpfe besitzen Kiefer, Kinn, Wangen, Augenhöhlen und eine geformte Haaroberfläche.
  Wartende reagieren auf die einfahrende Bahn, drehen Oberkörper und Kopf zu
  ihr und senken ihr Telefon. Manche bemerken die Bahn früh, andere erst in
  14–31 m Entfernung; am Telefon ist eine spätere Reaktion häufiger. Nach der
  Vorbeifahrt kehren sie zur Wartehaltung zurück.
  Etwa 58 % der stehenden Fahrgäste haben die Absicht einzusteigen: Sie reagieren zeitversetzt auf die
  Einfahrt, gehen mit 0,86–1,23 m/s in Richtung der Halteposition und anschließend
  näher an die Bahnsteigkante. Am vorderen Ende gehen sie dafür ein Stück zurück.
  Die Wege bleiben hinter dem taktilen Streifen und führen innen an den Säulen
  vorbei. Schrittlänge, Armbewegung, Anlaufen und Abbremsen folgen dem tatsächlich
  zurückgelegten Weg. Am Ziel wenden sich die Fahrgäste wieder zur Bahn.
  Andere warten weiter oder gehen unabhängig davon kurze Wege. Eine kurze
  Kollisionsvorschau prüft die Gehwege. Bei drohendem Kontakt
  bleiben die Beteiligten an ihrer letzten sicheren Position stehen und gehen
  in die Wartehaltung über. Auch sich kreuzende Wege und längere Frameabstände
  werden berücksichtigt. Es gibt kein Umplanen oder Ausweichen um andere herum.
  Die Simulation zeigt das Annähern; ein Einsteigen in unsichtbare Waggons wird
  nicht dargestellt.

## Tastatur

| Taste | Funktion |
| --- | --- |
| P oder Leertaste | Pause / weiter |
| F | Vollbild |
| H | Kamera- und Betriebsinformationen aus-/einblenden |
| D | Leistungsdiagnose aus-/einblenden |

Die Türanzeige bleibt auch beim Ausblenden der übrigen Informationen sichtbar.
Pause hält auch die Render-Schleife vollständig an: Es werden keine weiteren
Animationsframes angefordert. Das letzte Bild bleibt stehen. Eine Größenänderung
zeichnet das Standbild einmal neu; die Bedienung der Einblendungen bleibt möglich.
In einem verborgenen Browser-Tab pausieren Simulation und Rendering automatisch.

## Leistungsdiagnose

Der Overlay zeigt die Bildrate des letzten Messintervalls (bis zu einer Sekunde),
einen 60-Sekunden-Verlauf und den **Zeitanteil unter 30 FPS**. Ein Frame zählt als
langsam, wenn sein ungekürztes Zeitintervall über 35,3 ms liegt: Der 30-FPS-Takt
von 33,3 ms erhält 2 ms Messtoleranz für Browser- und VSync-Schwankungen. Diese
Toleranz wird im Overlay ausgewiesen. Beispielsweise
zählt ein Hänger von 500 ms mit seiner gesamten Dauer, statt nur als ein einzelner
Frame zwischen vielen schnellen Frames. Berechnet wird über ein gleitendes
60-Sekunden-Fenster; in der Anlaufphase über die bereits gemessene Zeit.

Zusätzlich erscheinen das 95. Perzentil der Framezeit, der längste Frame und die
Zahl der Zeichenaufrufe der 3D-Szene. Pausen und verborgene Tabs werden nicht
mitgezählt. Während einer Pause zeigt die Diagnose 0 FPS und „Rendering
angehalten“. Beim Fortsetzen beginnt die Zeitmessung ohne künstlichen langen Frame.

## Technik

- Three.js aus `../pinsim/three.module.min.js`; dieselbe lokal beiliegende Version
  wie beim Pinsetter. Kein CDN, Download oder zusätzlicher Build nötig.
- Vollständige 3D-Geometrie; deterministische Fahrdynamik mit 60-Hz-Zeitschritt
  und interpolierter Kamerabewegung zwischen den Simulationstakten. Die Ausgabe
  ist auf 30 FPS begrenzt, unabhängig von der Bildschirmfrequenz. Nach Hängern
  werden keine zusätzlichen Bilder in einem Aufholschub ausgegeben.
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
  Ein festes, pro Fragment berechnetes Lichtfeld beleuchtet Tunnelwände und
  Bahnsteige auch in der Ferne. Es hängt ausschließlich von der Infrastruktur
  ab, nicht von der Kameraposition. 16 ergänzende Punktlichter für Figuren und
  Reflexionen reichen bis 72 m voraus und blenden über 24 m weich ein. Damit
  wird der vorherige sichtbare Helligkeitssprung wenige Leuchten vor dem Zug
  reduziert; Leuchtenzahl und Texturen bleiben begrenzt.
  Tunnel-Leuchtflächen gehen zwischen 35 und 65 m Entfernung weich in gefilterte,
  tiefengeprüfte Lichtpunkte über. Deren glatter Abtastbereich bleibt mindestens
  fünf Renderpixel groß; die Helligkeit nimmt entsprechend der projizierten
  Leuchtfläche ab. So verschwinden Leuchten kleiner als ein Pixel nicht mehr
  zwischen Rasterpositionen. Nebel und verdeckende Tunnelwände gelten weiterhin.
  Pro Abschnitt werden diese Lichtpunkte in einem Zeichenaufruf zusammengefasst.
  Die Wände und Decken an den Aufgängen teilen sich exakte Querschnitte an den
  Abschnittsgrenzen. Obere Wände beginnen an der Oberkante der Stationswand;
  überlappende Sichtflächen an Wänden, Decken und Podesten werden vermieden.
  Auch die Stirnflächen über der ersten Stufe schließen ohne Überdeckung an:
  Der Türsturz liegt zwischen den Seitenwänden, alle enden unter dem Dach.
  Helle Türen mit Milchglasfeldern und eigener Beleuchtung machen den oberen
  Abschluss des Aufgangs auch vom Zug aus erkennbar.
  Die Geometriekoordinaten sind lokal zum Abschnitt, damit auch lange Fahrten
  nicht durch große GPU-Koordinaten instabil werden.
- Die Szene ist eine prozedurale Echtzeitdarstellung. Die Fahrgäste sind
  ausgeformte, animierte 3D-Modelle, keine gescannten Menschen.

## Prüfung und Diagnose

`node --test metrosim/route.test.mjs metrosim/diagnostics.test.mjs metrosim/crowd.test.mjs metrosim/presentation.test.mjs metrosim/tunnel.test.mjs metrosim/boarding.test.mjs metrosim/pedestrians.test.mjs metrosim/platform-life.test.mjs metrosim/render-loop.test.mjs` prüft Freigabe,
Bremsen, Türverriegelung, Pause, Stationsübergänge, Weichenabschnitte und eine
Stunde durchgehenden Betrieb. Die Diagnoseprüfungen decken konstante FPS,
lange Hänger, die gleitende Fenstergrenze und ausgeblendete Tabs ab. Die
Fahrgastprüfung kontrolliert gültige Geometrie, Knochengewichte, Kopfbewegung
und genau einen Zeichenaufruf für den Körper jedes Fahrgasts.
Zusätzlich werden der 30-FPS-Takt bei 60–240 Hz, die Behandlung von Hängern,
die Messtoleranz und die Blickreaktion auf beiden Bahnsteigseiten geprüft.
Die Render-Schleifen-Tests prüfen vollständig ausbleibende Frame-Callbacks bei
Pause, einmaliges Neuzeichnen bei Größenänderungen und verborgene Tabs.
Signaltests prüfen frühe, gleichzeitige und verspätete Blockfreigaben, den
zweiten Halt ohne Türöffnung und das Verbot, rote Signale zu überfahren.
Weitere Fahrtests prüfen auslaufende Bremskraft, verzögerte Türöffnung,
Beruhigung des Wagenkastens, Pause während des Nachfederns und das Lösen der
Bremse vor dem sanften Kraftaufbau. Der einstündige Dauerlauf begrenzt außerdem
die Auslenkung der Federung auf wenige Millimeter und sehr kleine Nickwinkel.
Geometrische Strahltests durch die tatsächlich erzeugten Tunnel kontrollieren
freie Portale, beide Gleiswege und die Enden der entfernten Nebenröhren.
Strahltests in den oberen Treppen- und Rolltreppenräumen prüfen außerdem
geschlossene Wände, Decken und Podeste sowie freie Kopfhöhe auf dem Aufgang.
Dabei müssen die sichtbaren Wand-, Decken- und Podestflächen sowie die
Stirnflächen am vorderen Deckenanschluss jeweils eindeutig
sein, um Z-Fighting durch doppelte Geometrie zu verhindern. Kollisionstests
prüfen Wartende, Gegenverkehr, kreuzende Wege, große Zeitschritte sowie die
tatsächlich erzeugten Fahrgastgruppen mehrerer Stationen.
Die Gehwegtests prüfen Abstand zu Kante und Säulen, Gehgeschwindigkeit,
Pause, Ankunft am Wartepunkt und sichtbare Bewegung während einer Zug-Einfahrt.
Die Sitz- und Rolltreppentests kontrollieren Fußkontakt bei verschiedenen
Körpergrößen, feste Sitzplätze, unterschiedliche Blickreaktionen, tatsächliche
Stufenbewegung, Umlauf und eingefrorene Stufen bei unveränderter Simulationszeit.

In der Browser-Konsole: `METROSIM.snapshot()`, `METROSIM.pause()`,
`METROSIM.setSpeed(4)`, `METROSIM.advance(60)`, `METROSIM.inspectStation(1, 20)`
und `METROSIM.restart()`.

Reproduzierbare Ansichten für visuelle QA:

- `?view=station&station=0&offset=18`: linker Bahnsteig mit massiver Treppe.
- `?view=station&station=1&offset=60`: rechter, gekrümmter Bahnsteig mit Aufzug.
- `?view=station&station=0&offset=43`: seitlicher Verbindungsgang links.
- `?view=station&station=1&offset=46`: Verbindungsgang rechts und wartende Fahrgäste.
- `?view=station&station=2&offset=18`: blaue Kreismotive in Westhafen.
- `?view=station&station=5&offset=18`: weiße Kacheln in Zentralbahnhof.
- `?view=access&station=0`: Prüfblick vom Treppenfuß bis zum oberen Abschluss.
- `?view=access&station=2&kind=escalator`: entsprechender Blick die Rolltreppe hinauf.
- `?view=access&station=2&kind=escalator&time=0.2`: Stufenphase; mit `time=0.45` vergleichen.
- `?view=seating&station=0`: Nahansicht von Sitzgruppe, Kopfbewegung und Smartphone.
- `?time=38`: Einfahrt mit beginnenden Gehwegen der Fahrgäste.
- `?view=junction&junction=0&offset=130`: freie Abzweigung rechts.
- `?view=junction&junction=1&offset=130`: freie Abzweigung links.
- `?view=junction&junction=5&offset=30&play=1`: Fahrt durch den gewählten Abzweig.
- `?time=58.55&paused=1`: Nachfedern am ersten Halt, noch keine Türanzeige.
- `?time=59.6&paused=1`: Türöffnung nach der Beruhigungsphase.
- `?time=73.3&paused=1`: Bremse wird vor der ersten Stationsabfahrt gelöst.
- `?time=68&paused=1`: grüne Ausfahrt während des ersten Fahrgastwechsels.
- `?time=160.6&paused=1`: zweiter Halt vor dem noch roten Museum-Ausfahrsignal.
- `?time=161.8&paused=1`: grünes Ausfahrsignal, Zug wartet noch seine Reaktionszeit ab.
- `?rate=8`: beschleunigter Dauerlauf für die Prüfung mehrerer Stationen.
- `?diagnostics=1`: Diagnoseoverlay bereits beim Öffnen einblenden.

Die normale URL startet immer am roten Signal. Die Diagnoseansichten sind
optional und gehören nicht zur Bedienoberfläche.
