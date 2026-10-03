# Kreuzungsatlas · Dortmund in 3D

Zwei Kreuzungen nutzen dieselbe 3D-Darstellung, Verkehrslogik, Simulationsuhr
und Kamerasteuerung: **Voßkuhle** (B1 / Voßkuhle / Semmerteichstraße) und
**Opphoff** (Märkische Straße / oberirdische Seitenarme des Westfalen- und
Rheinlanddamms). Die vorhandene Simulation in `trafficsim/` bleibt unabhängig.
Die Darstellung verwendet Three.js wie die anderen 3D-Projekte dieser Sammlung.

## Starten

Im Repository `npm start` ausführen und
<http://localhost:3000/junction3d/> öffnen. Es ist kein Build erforderlich.
Ein Browser mit WebGL-Unterstützung ist notwendig.

Die Startseite bietet die Kreuzungsauswahl mit Lageplänen aus den jeweiligen
Standortdaten; sie startet noch keine 3D-Zeichenschleife. Direkte Einstiege:

- Voßkuhle: `simulation.html?location=vosskuhle`
- Opphoff: `simulation.html?location=opphoff`

Der Pfeil links oben führt zurück zur Auswahl. Ein unbekannter oder fehlender
Standort in der Simulationsadresse führt ebenfalls dorthin. Eigene Kameras
werden getrennt nach Standort gespeichert; bestehende Voßkuhle-Kameras bleiben
erhalten. Beide Standorte teilen sich `simulation.html` und `app.mjs`.

## Opphoff

Die schräg verlaufende Märkische Straße trifft auf zwei getrennte oberirdische
Seitenarme. Die unterirdische B1 wird weder als Straße noch als Verkehrsstrom
dargestellt. Es gibt auch keine oberirdischen Stadtbahngleise oder Zugfahrten.
Pavillon, Autohaus mit Stellflächen, Wohngebäude, Baumreihen und begrünte
Mittelinsel bilden die Umgebung anhand der lokalen Referenzbilder nach.

Der Umlauf hat zwei Achsenphasen: Ost–West und Nord–Süd. Beide Richtungen einer
Achse kommen in jedem Umlauf dran, einschließlich ihrer Linksabbieger.
Außen- und Mittelampeln derselben Richtung beginnen gleichzeitig mit Grün.
Linksabbieger passieren ihre Außen- und Innenampel und warten anschließend
am inneren Signal der Zielrichtung. Speicherplätze und gemeinsam genutzte
Ausfahrtsspuren verhindern Überfüllung und Fahrzeugüberschneidungen.

Die elf markierten Signalstandorte bestehen aus acht äußeren/inneren Standorten
und drei gesonderten Rechtsabbiegern: aus Osten nach Norden, aus Norden nach
Westen und aus Süden nach Osten. Pro mehrspurigem Standort gibt es mehrere
Signalgeber. Die drei Rechtsabbieger erhalten ihre eigene Freigabe in der Phase
der Zufahrtsachse; dies ist eine Modellannahme, kein vermessener Signalplan.

Spurzahl (je eine linke und zwei geradeaus führende Spuren auf den durchgehenden
Fahrbahnen), Breiten, Radien, Zuflüsse und Sekundenwerte sind angenähert.
Die Daten sind in `locations/opphoff.mjs` und `locations/opphoff-environment.mjs`
gekapselt. Der gemeinsame Motor unterstützt hierfür auch drei aufeinanderfolgende
Haltepunkte: Ist der nachfolgende Mittelbereich voll, dürfen bereits sicher
wartende Fahrzeuge den Wechsel zur entlastenden Querphase nicht blockieren.
Die Fahrbahnmarkierungen folgen denselben Kurven wie die Fahrzeuge.

`opphoff/` enthält ausschließlich lokale Referenzbilder und ist in `.gitignore`
ausgeschlossen, ebenso wie die früheren Diagnoseframes. Die Anwendung lädt
keines dieser Bilder.

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
- **Zeit:** Beim Öffnen startet die Simulation mit der aktuellen Uhrzeit in
  Dortmund. Unter **Zeit & Alltag** setzt **Jetzt** sie erneut auf die aktuelle
  Ortszeit. Ein eigenes Datum mit Uhrzeit wird mit **Setzen** übernommen.
  **Zeitvorlage** bietet Montag 08:00, Freitag 15:30, Mittwoch 11:00,
  Samstag 12:00 und Sonntag 23:45. Das Setzen einer Zeit startet Verkehr und
  Ampelumlauf neu. **Pause** beziehungsweise die **Leertaste** hält auch die
  Uhr an; **1× / 2× / 4×** gilt für die gesamte Simulationszeit.
- **Verkehr und Licht:** Der Startmodus **Automatisch** leitet Zufluss und
  Beleuchtung aus Wochentag und Uhrzeit ab. **Manuell** stellt die zuvor
  gewählten eigenen Werte wieder her: Der Regler **Verkehrsaufkommen** steuert
  neue Zufahrten; bei null fahren vorhandene Fahrzeuge weiter. Die Auswahl
  **Beleuchtung** bietet Tageslicht, Abendlicht und Nacht. Der Stadtbahnfahrplan
  folgt an der Voßkuhle in beiden Modi weiterhin der Simulationsuhr. **Neustart** setzt Verkehr,
  Ampelumlauf und Uhr auf die zuletzt gewählte Startzeit zurück.
- **Ampeln:** **Nächste Phase** beendet die aktuelle Grünphase vorzeitig.
  Gelb, Räumzeit und Rot-Gelb werden weiterhin durchlaufen. Die inneren Ampeln
  bleiben während des Nachlaufs grün, bis die Konfliktbereiche sicher geräumt
  sind; erst anschließend wechseln auch sie über Gelb auf Rot. Bei vollem
  Ziel-Mittelbereich können Fahrzeuge vor einer inneren Ampel sicher warten,
  während die nächste Achsenphase Platz schafft.
- **Darstellung:** Im manuellen Modus wechselt auch die Lichttaste zwischen
  Tageslicht, Abendlicht und Nacht. **⛶** öffnet das Vollbild. Während der
  Browser-Tab verborgen ist, pausieren Verkehr und Simulationsuhr automatisch;
  beim Zurückkehren wird die verstrichene Echtzeit nicht nachgeholt.
  Die Darstellung ist auf maximal **30 FPS**
  begrenzt. In der Pause ruht die Zeichenschleife vollständig, sobald eine
  Kamerabewegung beendet ist. Kamera, Zoom, Licht, Neustart, Ampeländerungen
  und Fenstergröße lösen bei Bedarf neue Bilder aus; der Verkehr bleibt stehen.
  Die Bildtaktung folgt den Zeitstempeln des Browsers, ohne dass sich kleine
  Callback-Verzögerungen aufsummieren. Autos und Bahnen werden zwischen den
  letzten beiden festen Simulationsschritten interpoliert. So führt ein
  wechselnder Abstand der Bilder nicht zu ausgelassenen Bewegungszwischenständen.

Globale Tastenkürzel greifen außerhalb fokussierter Eingabefelder und Buttons.

## Simulationsuhr und Tagesablauf

Die Uhr beginnt bei `Date.now()` und wird in der Standortzeitzone
`Europe/Berlin` angezeigt, unabhängig von der Zeitzone des Computers.
Danach schreitet sie ausschließlich mit der laufenden Simulation fort.
Sommer- und Winterzeit werden berücksichtigt. Eine eingegebene Ortszeit in
der übersprungenen Frühlingsstunde wird abgelehnt; in der doppelten
Herbststunde wird die frühere der beiden möglichen Zeiten gewählt.
Die Zeitvorlagen verwenden den nächsten passenden Wochentag ab dem heutigen
Dortmunder Datum, einschließlich heute.

Im Automatikmodus ist der modellierte Berufsverkehr montags bis freitags
zwischen **07–09 Uhr** und **14–17 Uhr** besonders stark (Verkehrsfaktoren
1,55 und 1,65). Mittags liegt der Faktor ungefähr bei 0,8–0,9, samstags tagsüber
bei 0,6 und sonntags bei 0,3. Nachts sinkt er auf 0,04, in der Nacht von
Sonntag auf Montag auf 0,02. Übergänge werden geglättet; die Faktoren verändern
die Zahl neu eintreffender Fahrzeuge, nicht deren Fahrgeschwindigkeit.
Beim Start und beim Setzen einer Zeit wird auch die anfängliche Fahrzeugzahl
an das Aufkommen angepasst. Nachts beginnt die Szene ohne künstliche
Startwarteschlangen; einzelne Fahrzeuge können danach weiter eintreffen.

Die automatische Beleuchtung verwendet einen vereinfachten lokalen Tageslauf:
Morgendämmerung **06–08 Uhr**, Tageslicht **08–18 Uhr**, Abenddämmerung
**18–20 Uhr**, anschließend Nacht. Helligkeit und Lichtfarbe gehen fließend
über. Diese Zeiten und die Verkehrsprofile sind editierbare Modellannahmen;
die Beleuchtung berechnet keinen astronomischen Sonnenstand und berücksichtigt
keine jahreszeitlichen Sonnenauf- und -untergänge.

Bei geringer Helligkeit werden auch Kopfzeile, Seitenleiste, Bedienelemente,
Kameraleiste und Lageplan dunkel dargestellt. Im Automatikmodus folgt dies
dem Tageslichtprofil, im manuellen Modus der Auswahl Abendlicht oder Nacht.
Die B1-Straßenlampen haben warmes gelb-oranges Natriumlicht; an Voßkuhle und
Semmerteichstraße stehen weiße Leuchten. Ihre Lichtwirkung nimmt mit der
Dunkelheit zu. Weiche Lichtfelder hellen Straßen und vorbeifahrende Fahrzeuge
auf. Dafür wird eine gemeinsame Beleuchtungskarte verwendet; separate
Schatten für jede Straßenlampe werden nicht berechnet.

## Voßkuhle: Standort und Modellannahmen

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
2. **Voßkuhle und Mittelbereich Richtung Süd gemeinsam.** Die äußeren und
   inneren Signale werden gleichzeitig grün. Wartende B1-Linksabbieger fahren
   in die Semmerteichstraße aus; Wendefahrten biegen nochmals links auf die B1
   Richtung Ost ab. Verkehr aus der Voßkuhle rollt bei Grün langsam bis vor
   die Abbiegekurve und lässt dort noch wartende B1-Abbieger zuerst räumen.
3. **B1 wieder geradeaus in beiden Richtungen.** Nach 7 Sekunden wird die
   eigene Linksabbiegerspur aus Westen freigegeben. Diese Fahrzeuge biegen in
   den Mittelbereich Richtung Nord ein und warten an dessen roter Ampel.
4. **Semmerteichstraße und Mittelbereich Richtung Nord gemeinsam.** Auch hier
   starten die äußeren und inneren Signale gleichzeitig. Wartende B1-Abbieger
   fahren in die Voßkuhle aus oder biegen für ihre Wendefahrt links auf die B1
   Richtung West ab. Verkehr aus der Semmerteichstraße rückt im Schritttempo
   bis vor die Abbiegekurve vor und wartet dort bei Bedarf auf die B1-Abbieger.

Ist in einer B1-Phase eine Stadtbahnpassage vorgesehen, bleiben **beide
B1-Linksabbiegersignale während dieser gesamten Phase rot**. Die B1-Spuren für
Geradeausverkehr bleiben grün. Das gilt auch vor der tatsächlichen Ankunft
einer bereits für diese Phase erwarteten Bahn.

Die äußere B1-Linksabbiegerampel wird zusammen mit der Hauptstraße rot.
Nur die jeweilige Mittelampel bleibt anschließend gemeinsam mit der
Nebenstraße grün; die äußere B1-Zufahrt bleibt in dieser Zeit gesperrt.

`north` bezeichnet die **Herkunft** im Norden, also die Freigabe **nach Süden**.
`south` bezeichnet entsprechend die Herkunft im Süden. Die Gegenrichtung der
Nebenstraße bleibt jeweils gesperrt. In jeder Nebenstraßenzufahrt und im
anschließenden Mittelbereich gibt es drei Spuren: **links**, **links oder
geradeaus**, **geradeaus**. Auf der gemeinsamen Spur können beide Fahrziele
vorkommen; der Signalgeber und die Fahrbahnmarkierung zeigen einen kombinierten
Pfeil. Die beiden Linksabbiegespuren führen in parallelen Bögen auf verschiedene
B1-Ausfahrtsspuren. Die innersten B1-Zufahrtsspuren sind ausschließlich
Linksabbiegerspuren; daneben bleiben je zwei Geradeausspuren. Rechtsabbieger
sind in dieser Standortkonfiguration nicht enthalten.

Jede der drei mittleren Spuren hat zwei reguläre Aufstellplätze. B1-Abbieger mit
Ziel Nebenstraße können die gemeinsame oder die reine Geradeausspur wählen.
B1-Wendefahrten wählen die reine Linksabbiegespur oder die gemeinsame Spur.
Die Entscheidung fällt vor der äußeren Haltelinie anhand freier Aufstellplätze;
das ursprüngliche Fahrtziel bleibt erhalten. Danach teilen sie die jeweilige
Spur mit den Fahrzeugen aus der Nebenstraße, auch wenn diese erst später
unterschiedlich abbiegen. Entsprechend der vom Nutzer beschriebenen Praxis
fahren B1-Linksabbieger bei Grün auch dann weiter ein, wenn diese Plätze belegt
sind: Der Rückstau reicht entlang der Abbiegekurve in die Kreuzung zurück.
Die rote Mittelampel und die Abstände zu vorausfahrenden Fahrzeugen gelten
weiterhin. Beim nächsten gemeinsamen Grün lässt die Nebenstraße diese bereits
eingefahrenen Abbieger zuerst ihre Kurve beenden. Das gilt symmetrisch und
schließt Wendefahrten ein; es gibt keinen zeitlichen Grünvorsprung der Mitte.
Die Nebenstraßenzufahrt darf bei Grün bereits ohne freien Mittelplatz bis vor
die Abbiegekurve vorrollen. Bei belegter Kurve oder voller Mittelspur fährt sie
dabei höchstens 1,4 m/s (etwa 5 km/h). Erst für die Weiterfahrt hinter diesem Wartepunkt
reserviert sie Platz in ihrer Mittelspur. Frei liegende Zielspuren können
B1-Abbieger auffüllen, ohne pauschal auf Fahrzeuge in anderen Zielspuren
warten zu müssen; die Fahrzeugkörper müssen beim Vorbeifahren getrennt bleiben.
Ein reservierter Platz wird erst frei, wenn das Fahrzeug die innere Haltelinie vollständig
passiert hat. Zwei kleine Inseln tragen die inneren Ampelmasten; die
Stadtbahnfreigabe wartet auf die Räumung aller reservierten Wartebereiche.

Die Stadtbahn fährt auf beiden Gleisen durch den Mittelstreifen. Der vom Nutzer
vorgegebene Minutenraster gilt für geplante Ankünfte an der Kreuzung in
Dortmunder Ortszeit:

| Richtung | Montag–Samstag | Sonntag |
| --- | --- | --- |
| Ost / Aplerbeck | :09, :19, :29, :39, :49, :59 | :09, :29, :49 |
| West / Westerfilde | :02, :12, :22, :32, :42, :52 | :02, :22, :42 |

Der Betrieb beginnt täglich um **05:00 Uhr**; zwischen **23:30 und 05:00 Uhr**
werden keine weiteren Fahrten eingeplant. Damit liegen die ersten Ankünfte
bei 05:09 beziehungsweise 05:02 und die letzten bei 23:29 beziehungsweise
23:22. Die vorgegebenen Minuten bezeichnen die angeforderte Kreuzungspassage;
eine rote Ampel kann die tatsächliche Durchfahrt verzögern. Bereits gestartete
Fahrten beenden ihren Weg auch nach Betriebsschluss. Zukünftige Morgenfahrten
stehen nachts nicht schon an der Kreuzung.

Bahnen dürfen nur während einer B1-Freigabe passieren. Je nach Ampelstand
warten sie, sodass Passagen getrennt oder gemeinsam in einer B1-Phase
stattfinden können. Erst wenn auch das Zugheck den Konfliktbereich verlassen
hat, kann die Nebenstraße Grün erhalten. Dies ist ein Simulationsfahrplan
nach Nutzervorgabe, kein bestätigter offizieller U47-Fahrplan.

Am Ende einer Nebenstraßenphase werden zuerst die äußeren Zufahrten
geschlossen. Die inneren Ampeln bleiben als **Nachlauf** grün, bis der bereits
eingelassene Verkehr ausgefahren ist, und wechseln danach ebenfalls über Gelb
auf Rot. Während einer B1-Phase bereits eingelassene Abbieger dürfen auch im
Rückstau vor der Mitte auf die folgende, entlastende Nebenstraßenphase warten.
Sie blockieren deren Freigabe nicht; der neu anfahrende Nebenstraßenverkehr
gibt ihnen beim Einordnen Vorrang. Vor einer folgenden B1- oder Bahnfreigabe
muss dieser Rückstau dagegen geräumt sein.

Grünzeiten (32 / 22 / 32 / 22 Sekunden), Gelb (3 Sekunden), Räumzeit
(3 Sekunden), Rot-Gelb (1 Sekunde) sowie die Verzögerung von 7 Sekunden für
B1-Linksabbieger in Phasen ohne Stadtbahn
sind Demonstrationswerte, kein bestätigter Signalzeitenplan. Die tatsächliche
Phasendauer kann sich durch Räumung und Nachlauf verlängern.
Verkehrsaufkommen, Fahrbahnbreiten, Spuranordnung,
Gebäudehöhen und Geschwindigkeiten sind ebenfalls editierbare Annahmen.
Die Nebenstraßenfläche ist mit ungefähr 24 Metern Gesamtbreite für sechs
Spuren einschließlich seitlichem Spielraum modelliert. Die Bahn ist 28 Meter
lang und 2,5 Meter breit; die Bahnsteigmitten liegen bei `z = ±5,5 m`, damit
die innere Bahnsteigkante nahe am Wagen liegt und dessen Körper frei bleibt.
Je B1-Zufahrt entstehen 45 Abbiegefahrten zur Nebenstraße und 20 Wendefahrten
pro Stunde bei Verkehrsfaktor 1. Je Nebenstraßenzufahrt entstehen 150
Linksabbieger (90 auf der reinen und 60 auf der gemeinsamen Spur) sowie
75 Geradeausfahrer (25 auf der gemeinsamen und 50 auf der reinen Spur).
Damit ist der Linksabbiegeanteil doppelt so groß. Im Automatikmodus bestimmt
das Tagesprofil den Faktor; die anfängliche manuelle Vorgabe ist 0,8.
Die zusätzlichen Routen für alternative mittlere Spuren
erzeugen keine zusätzlichen Fahrzeuge. Bei erhöhtem Verkehrsaufkommen darf
Rückstau entstehen.
Gehwege und Umgebung sind Kulisse; Fußgänger-, Radverkehr, Fahrgastwechsel und
ein vollständiger Linienbetrieb der Stadtbahn sind nicht modelliert.
Auf den Nebenstraßen und B1-Abbiegespuren fahren Pkw und Lieferwagen. Die vereinfachten engen
Fahrkurven bilden den zusätzlichen Platzbedarf ausschwenkender langer Busse
nicht ab; Busse bleiben deshalb auf den geraden B1-Routen.

## Aufbau

Standortdaten stehen in `locations/dortmund.mjs` (Voßkuhle) und
`locations/opphoff.mjs`, die Umgebung von Opphoff in einem separaten Datenmodul.
`locations/index.mjs` registriert beide Standorte. Die Simulationslogik
arbeitet mit Routen, Signalgruppen und räumlichen Grenzen; sie benötigt keine
Dortmunder Straßennamen. Die Darstellung liest dieselben Daten für Fahrbahnen,
Umgebung, Signalpositionen und Kameras.

| Datei | Verantwortung |
| --- | --- |
| `index.html`, `selection.mjs`, `selection.css` | Kreuzungsauswahl mit statischen Lageplänen aus den Standortdaten. |
| `simulation.html` | Gemeinsame Oberfläche für alle Kreuzungen. |
| `app.mjs` | Bedienung, Simulationsuhr, Kameraauswahl und Lageplan. |
| `frame-loop.mjs` | Auf 30 FPS begrenzte, bedarfsgesteuerte Zeichenschleife mit Ruhemodus. |
| `time-model.mjs` | Ortszeit und Zeitumstellungen, Straßenbahn-Minutenraster, Verkehrs- und Lichtprofile ohne Browserabhängigkeit. |
| `engine.mjs` | Fahrwege, Fahrzeuge, Abstandshaltung und Signalzustände ohne Browser- oder Three.js-Abhängigkeit. |
| `scene.mjs` | Three.js-Szene, Straßen, Fahrzeuge, Ampeln und Kameradarstellung. |
| `lane-markings.mjs` | Spurgrenzen entlang der Fahrwege oder zwischen benachbarten Fahrspuren. |
| `environment.mjs` | Wiederverwendbare Modellbausteine für Gebäude, Grün und Straßenausstattung. |
| `street-lighting.mjs` | Gemeinsame ortsfeste Beleuchtungskarte für Straßenlampen, Straßen und bewegte Fahrzeuge. |
| `locations/index.mjs` | Verzeichnis der auswählbaren Kreuzungen und ihrer Modulimporte. |
| `locations/dortmund.mjs` | Voßkuhle: Ortsgeometrie, Betriebsparameter und Umgebung. |
| `locations/opphoff.mjs`, `locations/opphoff-environment.mjs` | Opphoff: Straßen, Signale und eigenständige Umgebung. |
| `engine.test.mjs` | Automatisierte Prüfungen der Fahr- und Signallogik. |
| `spillback.test.mjs` | Rückstau der Voßkuhle-B1-Abbieger, Vorrang beim Räumen und kollisionsfreies Nachrücken der Nebenstraße. |
| `creep.test.mjs` | Auffüllen freier Mittelspuren und langsames Vorrücken der Nebenstraße bis vor die belegte Abbiegekurve. |
| `opphoff.test.mjs` | Elf Signalstandorte, mehrstufige Linksabbieger, Speichersättigung und Langläufe mit unabhängiger Kollisionsprüfung. |
| `time-model.test.mjs` | Ortszeitumrechnung, beide Sommerzeitwechsel, Fahrplangrenzen, Wochenenden sowie Verkehrs- und Lichtprofile. |

Die Engine-Prüfungen lassen sich vom Repository-Hauptverzeichnis mit
`node --test junction3d/engine.test.mjs` ausführen. Sie prüfen die Logik
unabhängig von der 3D-Darstellung.
`node --test junction3d/frame-loop.test.mjs` prüft die Bildbegrenzung,
Taktstabilität bei Zeitstempel- und Callback-Schwankungen, Ruhephasen sowie das
Fortsetzen nach Pause und verborgenem Tab. Die Engine-Tests prüfen zusätzlich
die interpolierte Darstellung bei unregelmäßigen Bildabständen.
`node --test junction3d/lane-markings.test.mjs` prüft die Ausrichtung der
Fahrbahnmarkierungen auf geraden und gebogenen Zufahrten und Ausfahrten.
`node --test junction3d/time-model.test.mjs` prüft das Zeitmodell unabhängig
von der Szene und der lokalen Zeitzone des Rechners.
`node --test junction3d/opphoff.test.mjs` prüft Opphoff über zehn Minuten
Normalverkehr und zwanzig Minuten Berufsverkehr; alle Fahrbeziehungen müssen
passieren, ohne rote Haltepunkte zu überfahren, Fahrzeughüllen zu überschneiden
oder den Mittelbereich zu überfüllen.
`node --test junction3d/spillback.test.mjs` prüft den erlaubten Rückstau in
beiden B1-Abbiegerichtungen einschließlich Wendefahrten und des anschließenden
Vorrangs vor neu einfahrendem Nebenstraßenverkehr.
`node --test junction3d/creep.test.mjs` prüft zusätzlich das Vorrollen bei
Grün, die Wartepunkte vor dem Kurvenbereich und das Auffüllen freier Spuren.

Alle Längen sind Meter, Zeiten Sekunden und Geschwindigkeiten Meter pro
Sekunde. Ausnahmen: Absolute Uhrzeiten sind Unix-Zeitstempel in Millisekunden;
der Stadtbahnfahrplan verwendet lokale Minuten nach Mitternacht.
Im dreidimensionalen System gilt `+x = Osten`, `+y = oben`,
`+z = Süden`. Grundrisspunkte haben das Format `[x, z]`, Kamerapositionen und
Blickziele das Format `[x, y, z]`. Gebäude-Drehungen sind im Bogenmaß angegeben.

| Datenfeld | Aufgabe |
| --- | --- |
| `roads` | Sichtbare Straßen: Polylinie `points`, Breite `width`, Spurzahl `lanes`. |
| `laneMarkings` | Äußere Fahrbahnmarkierungen entlang einer `routeId`; `section` wählt Zufahrt, Ausfahrt oder beide und `offsets` die seitlichen Linien. |
| `routes` | Tatsächliche Fahrwege mit geordneten Signalhalten, Zufluss und Speicherkapazität. |
| `transit` | Stadtbahnrouten, deterministische Ankunftszeiten, zulässige Phasen und während einer Bahnphase gesperrte Signalgruppen. |
| `timeZone` | IANA-Zeitzone für Uhranzeige, Eingaben, Tagesprofile und Stadtbahnfahrplan. |
| `phases` | Freigaben mit `groups`, Grünzeit `duration`, gruppenweisen Verzögerungen `groupDelays` und optionalen Nachlaufgruppen `drainGroups`. |
| `timing` | Übergänge `yellow`, `allRed` und `redAmber`. |
| `conflictBounds` | Rechteck des zu räumenden Kreuzungsbereichs im Grundriss. |
| `islands` | Unbefahrbare Inseln als Grundrisspolygone `points`. |
| `signalGantries` | Masten mit `anchor`, `height` und den daran montierten Signalhalt-IDs `stopIds`. |
| `cameras` | Kameravorgaben mit Position, Blickziel und vertikalem Sichtwinkel `fov` in Grad. |
| `environment` | Gebäude, Baumzonen, Grünbereich, Gleise, Haltestelle und Tankstelle. |
| `environment.lights` | Lampenstandorte mit `x`, `z`, `height`, `rotation` und dem zugeordneten Lichtprofil `profile`. |
| `environment.streetLights` | Wiederverwendbare Lichtprofile unter `profiles`, das `defaultProfile` und die Auflösung der Beleuchtungskarte. |
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
Für einen gemeinsamen Links-/Geradeaus-Signalgeber wird `stop.arrow` auf
`left-straight` gesetzt; `route.turn` bleibt die tatsächliche Fahrtrichtung
dieses einzelnen Fahrwegs.

`clearPoint` beschreibt, ab wo ein Fahrzeug den **zu diesem Signalhalt
gehörenden** Konfliktabschnitt geräumt hat. Entscheidend ist, dass auch das
Fahrzeugheck diesen Punkt überschritten hat. Ohne Angabe wird die Ausfahrt
aus `conflictBounds` verwendet. Für mehrstufige Routen muss der erste
`clearPoint` vor dem zweiten Signal liegen und auch hinter dem Heck des
letzten dort zulässig wartenden Fahrzeugs genügend Abstand lassen.

`storage: { id, capacity }` am ersten Halt reserviert Platz bis zum folgenden
Signalhalt. Identische `storage.id` bedeutet einen gemeinsamen Wartebereich,
auch wenn Fahrzeuge aus verschiedenen Straßen kommen. Eine Kapazität von zwei
setzt entsprechend lange nutzbare Aufstellflächen voraus. Optional erlaubt
`storage.allowOverflow: true` das Einfahren bei Grün trotz belegter Plätze,
während Fahrzeugfolge und der folgende Signalhalt den Rückstau begrenzen.
Das ist an der Voßkuhle nur für B1-Linksabbieger aktiviert. Die anschließende
Phase muss das folgende innere Signal öffnen und als `drainGroups` räumen.
`yieldToGroups` am äußeren Halt der Nebenstraße lässt bereits eingelassene
Fahrzeuge dieser Gruppen zuerst bis hinter ihren `clearPoint` fahren. Es
verändert weder Ampelfarbe noch Phasenzeit. Mit
`yieldApproach: { point: [x, z], speed: 1.4 }` darf die Nebenstraße bei Grün
bis zu diesem zusätzlichen Wartepunkt vorrollen. Die normale Haltemarge gilt
vor dem Punkt; er muss vor den Fahrzeughüllen aller priorisierten Fahrwege
liegen. Die Geschwindigkeitsgrenze greift bei belegter Kurve oder vollem
Mittelbereich. Die Platzreservierung erfolgt dann erst bei der Weiterfahrt
über den Wartepunkt. Bereits über die äußere Haltelinie eingefahrene Fahrzeuge
werden auch nach dem Schließen der äußeren Ampel im Nachlauf geräumt.
Opphoff behält die feste Kapazität und das Warten am äußeren Signal.
`mergePoint` markiert
den Beginn einer gemeinsamen Ausfahrtsspur; zusammenführende Routen müssen ab
dort dieselben Leitpunkte und dieselbe `exitId` verwenden. Wiederholte
Signalhalt-IDs stehen für denselben physischen Signalgeber und dürfen daher
nur dieselbe Position und Signalgruppe bezeichnen.

`choiceGroup` verbindet Alternativen mit derselben Zufahrt und demselben
Fahrtziel. Eine Primärroute enthält den gemeinsamen Zufluss `rate`; alternative
Routen müssen `rate: 0` verwenden. Die Engine wählt vor der Zulassung eine
kompatible Spur mit freiem Speicher. Für Wendefahrten gehören nur reine
Linksabbiege- und kombinierte Spuren in dieselbe Auswahlgruppe.

`laneSections: [{ id, from, to }]` beschreibt die Abschnitte gemeinsam genutzter
Fahrspuren. Identische IDs erzwingen auch für später unterschiedlich abbiegende
Routen eine gemeinsame Fahrzeugfolge. Die Abschnitte müssen bis zur wirklichen
Trennung der Fahrzeugkörper reichen; bei einer gemeinsamen mittleren Spur
liegen ihre Endpunkte deshalb einige Meter hinter der inneren Haltelinie.
So verschwindet die Abstandshaltung beim Beginn des Abbiegens nicht vorzeitig.

`transit.greenGroups` bezeichnet die für Stadtbahnfahrten geeigneten
Autoverkehrsgruppen, `transit.blockedGroups` die während der gesamten
reservierten Bahnphase gesperrten Abbiegegruppen. Jede Route in
`transit.routes` enthält `points`, `stopLine`, `clearPoint`, `speed`, `length`,
und `schedule`. Das Fahrplanobjekt enthält `minuteOffset` (9 Richtung Ost,
2 Richtung West), `intervalMinutes: 10`, `sundayIntervalMinutes: 20`,
`serviceStart: 300` und `serviceEnd: 1410`. Die Betriebsgrenzen sind Minuten
nach Mitternacht; das Ende ist exklusiv. Der Minutenversatz wird auf das
jeweilige lokale Taktraster angewendet, sonntags beispielsweise :09/:29/:49.
Die Engine lässt Bahnen rechtzeitig sichtbar zur geplanten Ankunft anfahren.
`trackZ`, `direction`, `signalPosition`, `line` und `destination` steuern die
Darstellung. Ankunftszeiten innerhalb des bevorstehenden B1-Grünfensters werden
bereits am Phasenanfang berücksichtigt, damit keine Linksabbieger kurz vor
einer erwarteten Bahn eingelassen werden.

`new TrafficSimulation(config, { startTime: epochMs })` aktiviert die absolute
Simulationsuhr und die Fahrpläne. `getClockTime()` liest sie;
`setClockTime(epochMs)` setzt eine neue Startzeit und startet Verkehr und
Ampeln neu. Die allgemeinen `reset()`-Aufrufe behalten diese gewählte Basiszeit.
Für Anwendungen oder Tests ohne absolute Uhr bleiben `interval` und `offset`
als relative Ankunftszeiten in Sekunden verfügbar; die Standortdaten enthalten
beide Felder weiterhin auch für die allgemeine Routenvalidierung. Nur dieser ältere
Engine-Modus verwendet die gespeicherten Startversätze 75/99 Sekunden;
die Browseranwendung verwendet immer den ortszeitgebundenen Fahrplan.

`time-model.mjs` stellt `getLocalTime`, `localDateTimeToEpoch`,
`nextTramDeparture`, `getTrafficProfile` und `getLightingProfile` bereit.
Die Funktionen lesen nicht selbst die aktuelle Uhrzeit. `nextTramDeparture`
liefert die erste geplante Ankunft ab dem übergebenen Zeitstempel; für die
Folgefahrt wird der vorige Zeitpunkt um eine Millisekunde erhöht. Verkehrs-
und Lichtprofile werden in der Anwendung anhand derselben Simulationsuhr
angewendet. Im manuellen Modus bleiben allein diese beiden Profile ungenutzt,
der ortszeitgebundene Straßenbahnfahrplan bleibt aktiv.

`phase.groupDelays` ordnet einer Signalgruppe die Verzögerung in Sekunden ab
Beginn der Grünphase zu; nicht aufgeführte Gruppen starten sofort. Gruppen in
`drainGroups` behalten nach dem Schließen der äußeren Zufahrten ihre Freigabe,
bis die bereits eingelassenen Fahrzeuge ausgefahren sind. Mit `uiNote` und
`ui.signalIndicators` können standortspezifische Erklärungen und Anzeigen
ergänzt werden, ohne Ortsnamen in der Anwendung festzuschreiben.

Die Straßenflächen und Fahrwege sind absichtlich separate Daten: Eine breite
Straße allein erzeugt keine befahrbaren Spuren. Nach einer Geometrieänderung
müssen daher auch Routen, Haltepunkte und Kameras überprüft werden.

Die äußeren Fahrbahnlinien folgen mit `laneMarkings` denselben Kurven wie die
Fahrzeuge. `section` ist `approach`, `departure` oder `full`; positive
`offset`-Werte liegen links in Fahrtrichtung, `style` ist `dashed` oder `solid`.
Die nominale Spurbreite (`laneWidth`) beträgt 3,5 Meter, unabhängig von der breiteren
Asphaltfläche. Zwischen benachbarten gebogenen Fahrspuren bezeichnet
`betweenRouteId` die zweite Route: Die Trennlinie liegt dann mittig zwischen
deren tatsächlichen Fahrwegen, statt einen konstanten Abstand zu erzwingen.
Gemeinsam genutzte Spuren werden nur einmal referenziert;
die eigenen Leitlinien im Kreuzungsbereich werden separat dargestellt.

Straßenlampen bleiben ebenfalls Standortdaten: In `streetLights.profiles`
bestimmen `color`, `intensity`, `radius`, `forward` und `spread` Farbe und
Ausdehnung ihrer Lichtfelder. `forward` verschiebt das Feld vom Lampenkopf
zur Straße; `radius` und `radius / spread` sind die beiden Ausdehnungen in
Metern entlang und quer zur Straße. Einzelne Lampen können Profilwerte mit
`lighting` überschreiben. Der Lampenarm zeigt ohne Drehung nach Süden (`+z`), bei `rotation`
`Math.PI / 2` nach Osten. Die Nebenstraßenmasten folgen der jeweiligen
Straßenkurve und stehen außerhalb der Fahrbahnflächen.

Für weitere Stadtumgebungen stehen optionale Datenfelder zur Verfügung:
`environment.surfacePatches` zeichnet Polygone mit `points`, `color` und
optional `surface: 'grass'` / `curb`. `parkingLots` verwendet `x`, `z`,
`width`, `depth`, `rotation`, `rows` und `occupancy` für Stellplätze samt
stehenden Autos. `pavilions` nutzt dieselben Positions-/Maßfelder und
`height` / `label`. `shrubs` platziert niedrige Pflanzen mit `radius`,
`height` und optionaler `elevation`. Gebäude unterstützen zusätzlich
`style: 'residential'` für Balkone und `style: 'showroom'` für große Fenster.
Inseln können mit `surface: 'grass'` begrünt werden. Alle Bausteine sind
optional und enthalten keine festen Ortskoordinaten in der Darstellung.

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
5. Zuflüsse und Geschwindigkeiten plausibel einstellen. Standortzeitzone und
   gegebenenfalls Stadtbahn-Minutenraster und Betriebszeiten anpassen.
   Beobachtete oder bestätigte Werte von Annahmen in der Standortdokumentation
   unterscheiden; die Tagesprofile im Zeitmodell bei Bedarf ebenfalls ändern.
6. Gebäude, Grünflächen, Baumzonen und optionale Anlagen konfigurieren;
   Objekte von den Fahrwegen fernhalten. Kamera-Masten außerhalb der
   Fahrbahnen mit Blickzielen im Kreuzungsbereich platzieren.
7. Einen Eintrag mit eindeutigem `slug`, Beschreibung und `load`-Funktion in
   `locations/index.mjs` ergänzen. Auswahl und gemeinsame Simulation greifen
   über dieses Verzeichnis auf die Standortkonfiguration zu; ein Wechsel des
   Imports in `app.mjs` ist nicht erforderlich.
   Einen vollständigen Umlauf mit geringem und hohem Verkehrsaufkommen
   beobachten und aus jeder Kamera Haltepunkte, Abbieger, Rückstau und
   Phasenwechsel kontrollieren.

Ein Agent kann diese Anpassungen anhand einer neuen Kartenreferenz und
Beobachtungen vornehmen. Ein automatischer Google-Maps-Import ist nicht Teil
der Anwendung. Die allgemeine Simulationslogik muss für eine andere
Geometrie mit demselben Datenmodell nicht verändert werden.
