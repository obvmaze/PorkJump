# Pork Jump 🐷

Hochkant endless Jump 'n' Run mit John Pork in der Hauptrolle

## Spielen: https://claude.ai/artifact/2oTBmyx1Kstr6P5sn3DS4i

- **Lokal:** `index.html` im Browser öffnen (Doppelklick reicht).
- **Modus wählen:** Nach „Start“ zwischen **Classic** (nach oben springen) und **Run** (waagerecht laufen) wählen.
- **Classic:** Buttons links/rechts gedrückt halten. Am PC Pfeiltasten oder A/D.
- **Run:** rechts = springen (halten = höher, 2x = Doppelsprung), links = sliden. Am PC Hoch/Leertaste und Runter.
- `P` oder `Esc` = Pause, `Enter` = nochmal.

## Features

Aktuelle Version: **1.3**. Alle Änderungen stehen in [PATCHNOTES.md](PATCHNOTES.md).

- **Zwei Modi:** Classic (endlos nach oben) und Run (endlos nach rechts), jeweils mit eigenem Rekord
- **11 Comic-Welten**, alle 400 m ein Wechsel in zufälliger Reihenfolge: Strand bei Sonnenaufgang, Zauberwald, Verschneite Berge, Chinesisches Neujahr, Canyon bei Sonnenuntergang, Dunkle Grotte, Land der Süßigkeiten, Giftlabor, Wolkenkönigreich, Polarlichter bei Nacht, Weltall
- **Classic:** zufällige Plattformen, die mit der Höhe schwerer werden. Gegenstände: **Trampolin** (Mega-Sprung), **Federschuhe** (15 s doppelt so hohe Sprünge, ab und zu ein Salto), **Biene** (trägt dich 3 s nach oben), **Handy** (sehr selten: John Pork ruft an, ein Heli zieht dich 420 m hoch)
- **Run:** Abgründe, Plattform-Brücken, Hindernisse mit eigenem Look je Welt, 3 Herzen, Trüffel zum Sammeln. Items: **Magnet**, **Schild**, **Sau-Turbo**, **Herz**
- Meter-Anzeige, Pause-Menü (Sound an/aus, Hauptmenü), Bestleistungen lokal gespeichert, Rekord-Markierung im Level

## Dateien

- `index.html` – Aufbau (Menüs, Buttons)
- `style.css` – Aussehen der Menüs/Buttons
- `game.js` – Classic-Modus, Welten, Pork, Sound, Menüs. Gameplay-Werte stehen ganz oben.
- `run.js` – Run-Modus (Streckengenerator, Hindernisse, Items). Werte stehen oben im `R`-Objekt.
