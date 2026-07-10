# Pinsetter-Simulator

Blick ins Innere eines Bowling-Automaten — aus der Perspektive des Personals,
das nachsehen würde, ob eine Kugel steckt oder ein Pin die Mechanik blockiert.
Es gibt bewusst keine Bahn-Außenwelt: Nur die Vorgänge im Automaten selbst.

## Was simuliert wird

**Echte Physik** (Rapier, 120-Hz-Festschritt):

- Kugel und alle Pins auf dem Pindeck (Kollision, Umfallen, Abpraller von den
  Kickbacks, Rinnen, Sturz in die Grube, Anschlag ans Ballpolster)
- Das Abräumen: Der Kehrbalken ist ein kinematischer Körper, der das liegende
  Holz physikalisch in die Grube schiebt

**Choreografiert "wie auf Schienen"** (kinematisch, mit Übergabepunkten):

- Greifertisch senkt sich, Greifer fassen die stehenden Pins am Hals, heben
  sie an, der Kehrbalken fährt darunter durch, danach wird nachgesetzt
- Grubenteppich → Aufzugsrad (5 Schaufeln) → Laufband oben → Karussell-Magazin
  (10 Becher) → Tisch → neues Rack. Es zirkulieren 22 Pins.
- Ballrücklauf: Grube → Pendelklappe → Schienen → Beschleuniger-Reifen →
  Tunnel Richtung Spieler
- Staulogik wie in echt: Ist das Magazin voll, halten Band und Rad an; fehlen
  Pins fürs Rack, wartet die Maschine ("WARTE AUF PINNACHSCHUB")

Die Würfe variieren automatisch (Strike-Tasche, Brooklyn, frontal, dünn,
Kanten-Treffer, Gasse); der zweite Wurf zielt auf die Stehengebliebenen.
Wertung mit Strike-/Spare-/Split-Erkennung.

## Bedienung

| Eingabe | Wirkung |
|---|---|
| `1`–`6` oder Buttons | Kamera wählen (Pindeck links/rechts, Tisch & Magazin, Aufzug & Grube, Grube & Balltür, freie Service-Kamera) |
| Maus ziehen / Rad | freie Kamera drehen / zoomen (nur Kamera 6) |
| `N` | sofort werfen |
| Wurf-Buttons | Strike-, Split-, Gassen- oder Zufallswurf (laufender Zyklus: wird vorgemerkt) |
| Reset | alle Pins abräumen und ein frisches Rack stellen (wie an echten Bahnen) |
| Frame 1 | Zählung auf Frame 1 zurücksetzen |
| `A` / Auto | Automatikbetrieb an/aus (startet ausgeschaltet) |
| `+` / `−` / Button | Tempo 0,5× – 4× |
| `M` / Button | synthetischer Ton (Pin-Klacken, Motoren, Kugelrollen) |
| Leertaste | Pause |

## Technik

- [three.js](https://threejs.org) 0.185.1 (`three.module.min.js`, `three.core.min.js`)
  und [Rapier](https://rapier.rs) 0.19.3 (`rapier3d-compat.min.js`, WASM als
  Base64 eingebettet) liegen lokal bei — kein Build-Schritt, kein CDN.
- Fester Physik-Takt mit Akkumulator und Pose-Interpolation: läuft auf
  60/120/144-Hz-Displays gleich schnell.
- Alle Texturen prozedural (Canvas), Klang synthetisch (WebAudio).
- Debug-Konsole: `PINSIM.snapshot()`, `PINSIM.throwNow('pocket')`,
  `PINSIM.tick(n)`, `PINSIM.setSpeed(4)`.

### Rapier-Stolperfallen (0.19), die dieser Code umschifft

- `collider.setEnabled(true)` stellt die **Masse** des Körpers nicht wieder
  her → nach dem Reaktivieren `recomputeMassPropertiesFromColliders()`
  aufrufen (sonst "unendlich schwerer" Geisterkörper: ignoriert Gravitation,
  schiebt alles beiseite).
- Einen Körper direkt nach Teleport + Collider-Aktivierung **nicht** per
  `body.sleep()` schlafen legen: Der Collider landet nie in der Broad-Phase
  und ist für alle Kollisionen unsichtbar — und nichts kann ihn je aufwecken.
  Stattdessen wach lassen; ruhende Pins schlafen von selbst ein.
