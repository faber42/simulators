# Kreuzungssimulation

Browser-Simulation einer großen Verkehrskreuzung (Vogelperspektive) zweier
vierspuriger Straßen mit breitem Mittelstreifen, zentraler Insel und
mehrstufiger Ampelanlage – komplett in HTML/CSS/JavaScript (Canvas),
ohne Build-Schritt und ohne Abhängigkeiten.

## Features

- **Große Kreuzung**: zwei sich kreuzende vierspurige Straßen (je zwei Spuren
  pro Richtung), getrennt durch breite, begrünte Mittelstreifen.
- **Mehrstufige Linksabbieger**: Linksabbieger bekommen eine eigene Ampel zum
  Einfahren, warten dann an einer vorgezogenen Haltelinie neben der
  Mittelinsel und kreuzen den Gegenverkehr erst bei Grün der inneren Ampel –
  wie vier zusammengeschaltete einfache Ampelanlagen.
- **Ampelphasen** mit Gelb, Rot-Gelb und Räumzeiten (14 Schritte pro Umlauf).
- **Zufälliger Verkehr**: Autos fahren zufällig als Geradeausfahrer,
  Links- oder Rechtsabbieger an die Kreuzung heran – mit sichtbaren
  Blinkern und Bremslichtern.
- **Fußgängerfurten**: Zebrastreifen an allen vier Armen, Querung in zwei
  Etappen über die Mittelinsel, eigene Fußgängersignale je Furt-Hälfte.
- **Steuerung**: Verkehrsdichte und Ampel-Tempo per Regler,
  „Alle Ampeln rot“-Test-Schalter, Pause.

## Starten

Einfach `index.html` über einen beliebigen statischen Server öffnen, z. B.:

```sh
python -m http.server 8123
# dann http://localhost:8123 im Browser öffnen
```

(Direktes Öffnen der Datei im Browser funktioniert ebenfalls, da keine
Module oder Fetch-Aufrufe verwendet werden.)

## Dateien

| Datei        | Inhalt                                          |
|--------------|--------------------------------------------------|
| `index.html` | Seite mit Canvas und Bedien-Panel                |
| `style.css`  | Layout/Design                                    |
| `app.js`     | Geometrie, Routen, Ampelsteuerung, Fahrzeug- und Fußgängerlogik, Rendering |
