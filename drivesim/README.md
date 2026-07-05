# Nachtfahrt-Simulator

Stimmungssimulation: Beifahrerblick durch die Windschutzscheibe bei einer
nächtlichen Autobahnfahrt im starken Regen. Die Welt draußen wird bewusst
nicht fotorealistisch simuliert – sie besteht nur aus Lichtquellen
(Scheinwerfer, Rücklichter, Laternen, Schilder, Leitpfosten), Spiegelungen
auf nassem Asphalt und Gischtnebel. Erst die nasse Scheibe davor, mit
Tropfen, Wasserfilm und Scheibenwischern, macht daraus ein glaubwürdiges
Bild. Komplett in rohem WebGL2 (Shader), ohne Build-Schritt und ohne
Abhängigkeiten – kein three.js nötig, da es keine echte 3D-Geometrie gibt.

## Render-Pipeline

1. **Szenen-Pass** (halbe Auflösung, HDR): Himmel, nasse Fahrbahn mit
   Markierungen, Regenschleier in der Luft; darüber additiv instanzierte
   Licht-Sprites samt vertikal gestreckter, wabernder Spiegelungen.
2. **Blur-Pyramide** (Dual-Kawase, 5 Stufen): liefert mehrere
   Unschärfegrade – zugleich „Blick durch nasses Glas“ und Bloom.
3. **Tropfen-Pass**: JavaScript simuliert große Tropfen (ankleben, ab einer
   Größe losreißen, bei Tempo nach oben/außen wandern, Spuren hinterlassen,
   verschmelzen); gerendert als instanzierte Sprites in eine Normalmap.
4. **Composite-Pass** (volle Auflösung): Scheibenwischer, Mikrotröpfchen,
   Wasserfilm-Refraktion, Linseneffekt mit Farbsäumen in den Tropfen,
   Cockpit-Silhouette, ACES-Tonemapping, Vignette und Filmkorn.

### Der Wischer-Trick

Die Wischblätter folgen einer Kosinus-Schwingung über die integrierte Phase
`M`. Dadurch lässt sich **pro Pixel geschlossen berechnen, wann das Blatt
diesen Winkel zuletzt überstrichen hat** (arccos + Perioden-Arithmetik,
ohne Zustandstexturen). Aus dieser „Zeit seit dem letzten Wischen“ entsteht
alles Weitere: Wasserfilm und Beschlag bauen sich wieder auf, prozedurale
Mikrotröpfchen (Hash-Grids mit zyklischem Respawn) erscheinen nur, wenn sie
nach dem letzten Wischerdurchgang entstanden sind, frisch gewischte Bögen
zeigen kurz Schlieren, und vor dem Blatt läuft ein glänzender Wasserwulst.
Ecken außerhalb des Wischfelds bleiben dauerhaft nass. Die großen
JS-Tropfen löscht der überstrichene Winkelbereich direkt.

## Bedienung

- **Regen**: Tropfenmenge, Sicht, Wasserfilm (wandert zusätzlich langsam
  um den eingestellten Wert – Regenbänder).
- **Tempo**: Fahrgeschwindigkeit; ab ca. 80 km/h drückt der Fahrtwind die
  Tropfen nach oben/außen statt nach unten.
- **Verkehr**: Dichte auf drei Richtungsfahrspuren — rechts Langsamere
  (oft LKW), die wir überholen, in der Mitte ein Vorausfahrender, links
  Schnellere, die uns überholen und dabei einen Gischtschwall auf die
  Scheibe werfen. Dazu Gegenverkehr jenseits des Mittelstreifens,
  Bremslichter und Gischtfahnen im eigenen Scheinwerferlicht.
- **Scheibenwischer**: Automatik (folgt dem Regen) oder feste Stufen.
- `?debug` in der URL zeigt FPS und das Wischfeld als Heatmap.

## Starten

Wie alle Projekte der Sammlung über den Root-Webserver
(`node server.js`, dann `http://localhost:3000/drivesim/`).
Benötigt WebGL2; HDR-Rendering nutzt `EXT_color_buffer_float`
(mit 8-Bit-Fallback).

## Dateien

| Datei        | Inhalt                                                     |
|--------------|-------------------------------------------------------------|
| `index.html` | Seite mit Canvas und Bedien-Panel                           |
| `style.css`  | Overlay-Layout                                              |
| `shaders.js` | Alle GLSL-Quellen (Szene, Sprites, Blur, Tropfen, Composite)|
| `app.js`     | WebGL-Pipeline, Verkehrs-, Tropfen- und Wischer-Simulation  |
