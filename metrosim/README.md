# Metro — automatische U-Bahn

Eine stationäre Frontkamera in einem fiktiven, vollautomatischen Metronetz.
Die Simulation startet unmittelbar beim Öffnen, ohne Cockpit und ohne Bedienpult.

## Start

Im Projektverzeichnis `npm start` ausführen, dann `http://localhost:3000/metrosim/`
öffnen oder die neue Metro-Karte in der Simulatorenübersicht wählen.

## Ablauf

- Zu Beginn steht der Zug vor einem roten Signal. Nach 5,5 Sekunden erfolgt die
  Freigabe; 1,25 Sekunden später beschleunigt der Zug bis auf 60 km/h.
- Zwei Tunnelsignale und ein Einfahrsignal liegen auf dem Weg zur ersten Station. Die Kamera folgt
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
  Zug. Zusätzlich gibt es sichtbare vorausfahrende Züge an ausgewählten Stationen.
- Gelegentlich ist die Station noch belegt: Ein fünfteiliger, 89,6 m langer
  Zug der U3 nach Lindenau oder U6 nach Falkenried beendet den Fahrgastwechsel oder wartet bereits mit geschlossenen Türen
  vor seinem Ausfahrsignal. Der eigene Zug hält am Einfahrsignal acht Meter vor
  dem Bahnsteig. Dieses bleibt rot, bis das **gesamte Fahrzeug** die Station
  verlassen hat und sein Zugschluss zwei Meter hinter dem Bahnsteigende liegt.
  Danach gelten auch hier Reaktionszeit und sanfter Anlauf. Die erste Begegnung
  findet am Westhafen statt; spätere Begegnungen wechseln zwischen beiden Abläufen.
- Jeder Bahnsteig hat am vorderen Ende einen Abfertigungsmonitor. Eine zweite
  Kamera rendert dieselbe Szene entlang der eigenen Türenreihe, horizontal
  gespiegelt. Sie sitzt nahe der Bahnsteigkante auf 3,65 m Höhe über dem Gleis,
  oberhalb der Fahrgastköpfe, und blickt leicht abwärts. Ihr vertikaler Blickwinkel
  von 28° umfasst die Türen bis zu den Schwellen und den Ein- und Ausstieg. Die Wagen folgen
  einzeln der Gleiskrümmung. Die Stationskurven bleiben so sanft, dass vordere
  Wagen und Säulen die Sicht auf die hinteren Türen nicht verdecken.
  Linien- und Zielanzeigen, Drehgestelle, Kupplungen,
  Türdichtungen und Schlusslichter gehören zum Modell. Seiten-, Tür- und
  Heckfenster zeigen helles, von innen beleuchtetes Milchglas mit weichen
  Helligkeitsverläufen und dunkleren Rändern; der Fahrgastraum bleibt verdeckt.
  Die Frontscheibe ist dagegen durchsichtig: Dahinter liegt ein schlichter,
  dunklerer Automatik-Führerraum mit einer Kamera an einer Deckenhalterung.
  Hinter den Türöffnungen liegen einfache beleuchtete Vorräume.
  Nur die Türen auf der Bahnsteigseite öffnen sich, synchron zur Türanzeige.
  Die Türflügel bleiben auch geschlossen sichtbar. Sie schwenken zunächst sechs
  Zentimeter aus dem Wagenkasten aus und gleiten erst dann seitlich auseinander;
  beim Schließen treffen sie sich zuerst und ziehen danach wieder in die Dichtung.
  An vier über den Zug verteilten Türen steigen jeweils ein bis vier Fahrgäste
  nacheinander aus; anschließend rücken ein bis vier wartende Fahrgäste nach und
  steigen ein. Die Anzahl variiert nach Station, Tür und Fahrtrichtung des Wechsels.
  Einsteiger warten links und rechts neben der Tür, höchstens zwei je Seite.
  Auch diese tatsächlich einsteigenden Fahrgäste verfolgen den ankommenden Zug
  mit Kopf und Körper, mit individuell unterschiedlichem Reaktionsbeginn.
  Sobald die Zugspitze vorbei ist, bleibt ihr Blick bei der Bahn neben ihnen;
  vor dem Losgehen geht die Blickreaktion weich in die Gehhaltung über.
  Einzelne Personen stehen mal links, mal rechts; größere Gruppen verteilen
  sich als 1+1, 2+1 oder 2+2. Sie steigen abwechselnd von beiden Seiten ein und
  gehen von ihren unterschiedlich weit entfernten Warteplätzen diagonal zur Tür.
  Die Wege münden in einem weichen Bogen in die Türöffnung,
  ohne seitliche Zwischenschritte oder rechtwinklige Drehungen. Aussteiger gehen
  zunächst durch die freie Mitte an den Wartenden vorbei und wenden sich
  während des Gehens in einem weiten Bogen zur festen Treppe. Beginn, Breite
  und Verlauf dieser Bögen variieren pro Person; die Drehung setzt sanft ein
  und klingt ebenso sanft aus. Der Blick führt die Körperdrehung leicht an:
  Je nach Tür laufen sie längs des Bahnsteigs nach vorn oder nach hinten,
  innerhalb der Säulenreihe. Die Tür wird vor dem Einstieg freigegeben;
  Ausgestiegene gehen ohne Zwischenhalt weiter Richtung Ausgang, auch während
  des Türschließens, der Abfertigung und eines späteren Signalhalts. Ihre eigene
  Zeitmessung läuft unabhängig von den Türphasen weiter und pausiert mit der
  Simulation. Die Wege führen um den Treppenfuß herum und in den Aufgang.
  Figuren werden erst im vollständig verdeckten oberen Treppenraum entfernt;
  sie bleiben nicht sichtbar im Monitor stehen und verschwinden nicht offen
  auf dem Bahnsteig. Das gilt auch für den vorausfahrenden Zug.
  Alle Einsteiger sind innerhalb der acht Sekunden Offenzeit im Zug.
  Warteabstände, Reaktionszeiten, Tempi und Schrittfolgen unterscheiden sich
  deutlich; auch zwischen den Aussteigenden wechseln kurze und längere Pausen.
  Wer auf seinen Vordermann aufläuft, passt sein Tempo an. Die Beinbewegung
  verwendet kleinere Ausschläge und weichere Kniebewegungen.
  Die Variation ist pro Station und Person fest, damit Pause und Zeitvorsprünge
  keine neuen Bewegungen auswürfeln.
  Der tatsächliche Stationshalt startet diesen Ablauf; der letzte Zentimeter
  beim Bremsen und ein späterer Signalhalt vertauschen oder ersetzen keine Figuren.
  Ausgestiegene des vorausfahrenden Zugs setzen ihren Weg zum Ausgang fort,
  während die nächste Abfertigung beginnt.
  Das Ausfahrsignal steht gegenüber dem Monitor und bleibt dadurch sichtbar.
- Sechs Stationsvarianten wiederholen sich entlang einer endlos erzeugten
  Strecke: Rathaus, Museum, Westhafen, Opernplatz, Botanischer Garten und
  Zentralbahnhof. Farben, Krümmung, Bahnsteigseite und Zugänge variieren.
  Rathaus und Opernplatz haben durchgehend farbige Keramikwände in Türkis bzw.
  Terrakotta. Museum verwendet ockerfarbene Diagonalen, Westhafen blaue Kreise.
  Botanischer Garten behält das horizontale Band; Zentralbahnhof ist weiß.
  Kachelformate und Kopfwandgestaltung passen zur jeweiligen Variante.
- Die Bahnsteige haben Säulen, Bänke, taktile Sicherheitsstreifen, abstrakte
  Werbeplakate, Stationsnamen und zwei doppelseitige Fahrzielanzeiger.
  Vor der Einfahrt zeigen diese zwei Züge: oben **U8 Waldheim · 1 Min**, darunter
  je nach Station U3 Lindenau oder U6 Falkenried mit drei Minuten Wartezeit. Beim Einfahren wird die
  Anzeige zur großen Linien- und Zielansicht mit fünf gekuppelten Wagensymbolen
  über den Bahnsteigabschnitten A–E. Der Zug ist passend zu seiner Länge und
  Halteposition eingezeichnet; Zwischenziele werden nicht angezeigt.
  Der bisherige Inhalt bleibt bis einen Meter hinter dem Einfahrsignal stehen.
  Danach blättert die gesamte Anzeige achtmal über eine gemeinsame horizontale
  Mittelachse. Eine durchgehende obere Metallhälfte fällt als echte 3D-Fläche
  nach unten; ihre Rückseite trägt die neue untere Hälfte. Die Bewegung zeigt
  Beschleunigung, einen weichen Schatten und leichtes Nachfedern beim Aufschlag.
  Dazwischen erscheinen andere bedruckte Zielblätter, bevor das letzte Blatt
  die richtige Anzeige erreicht. Leicht gealterte elfenbeinweiße Fallblätter,
  schwarze Druckschrift und Symbole,
  ein tieferes Gehäuse und sichtbare Lager ersetzen die bisherige LED-Optik.
  Drei verdeckte warme Leuchten erzeugen sanft ungleichmäßige Lichtkegel,
  dunklere Ränder und Scharnierschatten. Dezente Patina bleibt auf den Blättern,
  während sich ihre Beleuchtung beim Umklappen mit der Blattstellung verändert.
  Schon vor dem ersten Schild ist ein vollständiger Blattwechsel sichtbar.
  Die Faltblattanimation endet, wenn das zweite Schild fünf Meter
  vor dem Zug steht. Alle Schildseiten wechseln synchron; Pause hält auch die
  Animation an. Bei belegter Station zeigt die große Ansicht zunächst Linie
  und Ziel des vorausfahrenden Zugs und wechselt direkt zur eigenen großen
  Ansicht, ohne zwischenzeitlich zur Abfahrtsliste zurückzukehren.
  Stirn-, Heck- und Seitenanzeigen der Fahrzeuge verwenden dieselben Ziele.
  Jede Station
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
  Laufstege und Leuchten und reicht 300 m hinter das Portal. Neben den
  Blocksignalen der eigenen Strecke stehen auf gleicher Höhe auch Signale
  am ungewählten Gleis, jeweils außerhalb des Gleisprofils. Sie zeigen Rot
  und gelten ausschließlich für diesen anderen Streckenast – auch wenn der
  eigene Zug abbiegt und die Geradeausstrecke frei bleibt. Nach jeweils fünf,
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
  Für den sichtbaren Ein- und Ausstieg bleiben eigene Türgassen frei. Die übrigen
  Gehwege berücksichtigen diese Gassen und die Fahrgäste dort als Hindernisse.

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

Im Diagnose-Overlay stehen drei gegenseitig ausschließende Kameraansichten:

- **Normalansicht**: die reguläre Frontkamera aus dem Zugcockpit. Damit lassen
  sich auch per URL geöffnete Sonderansichten wie die Fahrzeug-Nahansicht verlassen.
- **Türansicht**: die erste Tür auf der Bahnsteigseite frontal und aus der Nähe,
  ab 0,45 Sekunden vor der Öffnung bis 0,3 Sekunden nach dem Schließen. Dazwischen
  erscheint die Frontkamera; am nächsten Halt gilt die Auswahl wieder.
- **Zugabfertigungsmonitor**: das vergrößerte Bild der festen Bahnsteigkamera
  entlang des Zuges. Die Ansicht bleibt bei Annäherung und Aufenthalt am Bahnhof
  aktiv; außerhalb der geladenen Station erscheint die Frontkamera.

Die Auswahl aktualisiert auch die URL, damit Neuladen die gewählte Ansicht
übernimmt und keine alte Sonderansicht zurückholt. Das Diagnose-Overlay lässt
sich mit D oder × ausblenden, während die Auswahl aktiv bleibt.
P pausiert alle Ansichten. Ein Kamerawechsel während einer
Pause zeichnet nur ein neues Standbild und startet kein dauerhaftes Rendering.

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
  In Stationen bleiben zusätzlich 96 m hinter der Frontkamera erhalten, damit
  der Monitor auch den letzten Wagen, Bahnsteig und Fahrgäste zeigt. Sein
  576×384-HDR-Renderziel mit 4× MSAA wird wiederverwendet und während der gesamten
  Sichtbarkeit mit demselben 30-FPS-Takt aktualisiert. Es gibt keinen Wechsel von
  einem eingefrorenen Fernbild zu einem Livebild; in Pause wird auch der Monitor nicht neu
  gerendert. Trilinear gefilterte Mipmaps und anisotrope Filterung glätten das
  verkleinerte Bild. Ein von der projizierten Pixelgröße abhängiger Mipmap-Bias
  verstärkt die Glättung in der Ferne, damit feine Details bei der Einfahrt
  nicht zwischen einzelnen Bildpunkten flimmern.
  Der Monitorrahmen lässt die Bildfläche frei; seine Rückwand liegt deutlich
  dahinter, damit die Tiefengenauigkeit in der Ferne keine schwarzen Flächen erzeugt.
  Eigener Zug, vorausfahrender Zug und Monitor werden als feste Pools wiederverwendet.
  Zusammengefasste Wagenkörper und instanzierte Türflügel begrenzen Zeichenaufrufe.
  Auch die beiden Gruppen für den Fahrgastwechsel mit je 32 möglichen Figuren
  werden vorab gebaut und wiederverwendet; nicht benötigte Personen bleiben unsichtbar.
  Fahrzielanzeiger verwenden fünf wiederverwendete, vorgefilterte Texturen.
  Die obere Hälfte wird im Vertexshader um ihre reale Mittelachse gedreht;
  Grundplatte und beide Blattseiten teilen sich die vorgefertigten Druckbilder.
  Während der Fahrt werden dafür
  keine Canvasbilder neu gezeichnet oder hochgeladen. Das Shaderprogramm wird
  beim Laden vorbereitet und zwischen Stationen behalten.
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

`node --test metrosim/*.test.mjs` prüft Freigabe,
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
Verkehrstests kontrollieren die Freigabe erst hinter dem Zugschluss, beide
Belegungsvarianten, Zugabstand, Türverriegelung und Pause. Fahrzeugtests prüfen
die richtige Türseite und den Monitorausschnitt einschließlich Türschwellen über
36 Stationen sowie freie Sicht über nahe Fahrgastköpfe. Strahltests prüfen zusätzlich die freie Sicht an Wagen und
gebauten Bahnsteigsäulen vorbei. Fahrgasttests prüfen Türpositionen, getrennte Gehspuren
und die Reihenfolge von Ausstieg, Einstieg und Türschluss.
Zusätzliche Tests prüfen die Vierergruppen samt Abstand und vollständigem
Fahrgastwechsel vor Türschluss sowie das Ausschwenken vor dem seitlichen Gleiten.
Sie prüfen außerdem die beidseitigen Warteplätze, den freien geraden Ausstiegsweg
und die abwechselnde Reihenfolge beim Überqueren der Türschwelle.
Die Türkamera wird auf beiden Bahnsteigseiten, gekrümmten Stationen und schmalen
Bildformaten geprüft. Tests sichern ihre Umschaltzeiten sowie die individuellen
Tempi, Abstände und Schrittfolgen der Warteschlangen ab.
Weitere Prüfungen kontrollieren diagonale Einstiege, kontinuierliche Drehungen,
die Laufrichtung zur Treppe und freie gebogene Laufwege zwischen den übrigen
Fahrgästen. Tausend Stationsvarianten prüfen, dass auch bei langsamen Vorderleuten
alle Nachfolgenden vor Türschluss einsteigen.
Die Aussteiger werden bis zum oberen Treppenraum auf Abstand geprüft. Ihre
Animation läuft kontinuierlich über Türschluss und Abfahrt hinweg; Pausen
halten sie an. Sichtstrahlen vom Abfertigungsmonitor prüfen, dass der gesamte
Körper hinter Wänden verdeckt ist, bevor die Figur aus der Szene entfernt wird.
Regressionstests prüfen den letzten Bremszentimeter, den abgeschlossenen Wechsel
beim Signalhalt, den Abstand der Monitorrückwand und das durchgehende Livebild.
Anzeigentests prüfen Zweizeilenliste, abweichende Vorgängerlinie, Zugbeschilderung,
Signalpassage und die vollständige Umschaltung fünf Meter vor dem zweiten Schild.
Sie decken Signalhalte, Pause, acht vollständige Blattwechsel, die gemeinsame
Achse und begrenzten Material-/Texturspeicher ab.

In der Browser-Konsole: `METROSIM.snapshot()`, `METROSIM.pause()`,
`METROSIM.setSpeed(4)`, `METROSIM.advance(60)`, `METROSIM.inspectStation(1, 20)`
und `METROSIM.restart()`.

Reproduzierbare Ansichten für visuelle QA:

- `?time=43&rate=0.25`: langsame Einfahrt zur Prüfung des gefilterten Monitorbilds.
- `?time=58`: erster Halt mit Monitor, Türöffnung und Fahrgastwechsel.
- `?time=143`: entsprechender Ablauf am rechten, gekrümmten Bahnsteig Museum.
- `?time=203`: Annäherung an die belegte Station Westhafen und Einfahrsignal.
- `?time=207&paused=1`: rotes Einfahrsignal und noch stehender vorausfahrender Zug.
- `?view=mirror&time=67&paused=1`: vergrößerte, ungespiegelte zweite Kamera für Tür- und Fahrgastprüfung.
- `?view=vehicle`: Nahansicht der Frontscheibe und des Automatik-Kameraraums.
- `?view=vehicle&end=rear`: beleuchtetes Heckfenster und seitliche Milchglasscheiben.

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
- `?view=display&station=0&offset=-8`: Nahansicht der zweizeiligen Faltblattanzeige beim Einfahrsignal.
- `?view=display&station=0&offset=-0.63`: fallendes Blatt während des ersten Umschlags.
- `?view=display&station=0&offset=65.8`: fertige große Zielanzeige mit Wagenstand.
- `?view=display&station=2&offset=-8`: große Vorgängeranzeige U3 Lindenau.
- `?time=40.8&rate=0.25`: langsame erste Einfahrt mit Wechsel der Fahrzielanzeiger.
- `?time=234&rate=0.25`: Einfahrt hinter dem vorausfahrenden Zug mit direktem Zielwechsel.
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
