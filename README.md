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
| [washsim](washsim/) | Waschtrockner-Simulator mit Wasser- und Schaumpartikeln |
| [drivesim](drivesim/) | Nachtfahrt auf regennasser Autobahn (WebGL-Shader) |
| [llmsim](llmsim/) | Transformer-Simulator: Texterzeugung Wort für Wort, Attention, Wissens-Ebenen und KV-Cache als Symbole statt Mathematik |
| [pinsim](pinsim/) | Pinsetter-Simulator: Blick ins Innere eines Bowling-Automaten mit 3D-Physik (three.js + Rapier), Kehrwerk, Greifertisch, Pin-Aufzug und Karussell-Magazin |

## Neues Projekt hinzufügen

1. Neues Verzeichnis im Root anlegen (z. B. `mysim/`) mit einer `index.html`.
2. Karte in der Root-[index.html](index.html) ergänzen.

Der Server in [server.js](server.js) liefert alle Unterverzeichnisse automatisch aus —
es ist kein eigener Server und keine `package.json` pro Projekt nötig.
