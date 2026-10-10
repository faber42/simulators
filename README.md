# Simulatoren

Sammlung HTML-basierter Simulationsprojekte — ohne Build-Schritt, ohne Dependencies.

## Starten

```sh
npm start
```

Dann <http://localhost:3000> öffnen. Die Startseite verlinkt auf alle Projekte.

## Projekte

| Projekt | Beschreibung |
|---|---|
| [elevsim](elevsim/) | Aufzug-Simulator |
| [netsim](netsim/) | Netzwerk-Simulator (Geräte, Links, Frames, Protokolle) |
| [trafficsim](trafficsim/) | Kreuzungssimulation mit mehrstufiger Ampelanlage |
| [junction3d](junction3d/) | Kreuzungsatlas · Voßkuhle und Opphoff in Dortmund als 3D-Simulationen mit Verkehrskameras, eigenen Ampelplänen und Tageszeiten; gemeinsamer Motor und getrennte Standortdaten |
| [washsim](washsim/) | Waschtrockner-Simulator mit Wasser- und Schaumpartikeln |
| [dishsim](dishsim/) | 3D-Geschirrspüler als transparentes Schnittmodell: vollständiger Spülgang mit Wassertasche, Reiniger, Sprüharmen, Sieb und Kondensationstrocknung (Three.js) |
| [coffeesim](coffeesim/) | Kaffeevollautomat nach Philips 5400/LatteGo: frei drehbare 3D-Schnittansicht, getrenntes Mahlwerk, äußerer Brühgruppenantrieb, Milchschaum, Vorbrühen und Tresterauswurf (Three.js) |
| [drivesim](drivesim/) | Nachtfahrt auf regennasser Autobahn (WebGL-Shader) |
| [llmsim](llmsim/) | Transformer-Simulator: Texterzeugung Wort für Wort, Attention, Wissens-Ebenen und KV-Cache als Symbole statt Mathematik |
| [pinsim](pinsim/) | Pinsetter-Simulator: Blick ins Innere eines Bowling-Automaten mit 3D-Physik (three.js + Rapier), Kehrwerk, Greifertisch, Pin-Aufzug und Karussell-Magazin |
| [telefonsim](telefonsim/) | Elektromechanisches Fernsprechamt: bedienbare 3D-Wählscheibe, sechsstellige Impulswahl, Anrufsucher und Hebdrehwähler, drei gleichzeitige Kameras, Leitungsweg und automatische Textansagen |
| [metrosim](metrosim/) | Frontkamera einer automatischen U-Bahn: endlose 3D-Tunnelstrecke, wechselnde Stationen, bewegte Fahrgäste, Signale und Türzyklen (Three.js) |
| [uhrengalerie](uhrengalerie/) | Uhrengalerie: zwölf Uhren-Simulationen — Bahnhofsuhr, Fallblattwecker, Solari-Weltzeituhr, Wortuhr, Nixie, Räderwerk, Kugel- und Wasseruhr, Kreidetafel, Bleistift & Zettel, Strandschreiber, Vogelschwarm |

## Neues Projekt hinzufügen

1. Neues Verzeichnis im Root anlegen (z. B. `mysim/`) mit einer `index.html`.
2. Karte in der Root-[index.html](index.html) ergänzen.

Der Server in [server.js](server.js) liefert alle Unterverzeichnisse automatisch aus —
es ist kein eigener Server und keine `package.json` pro Projekt nötig.
