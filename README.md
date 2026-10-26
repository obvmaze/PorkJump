# Pork Jump 🐷

Hochkant endless Jump 'n' Run mit John Pork in der Hauptrolle

## Spielen: https://claude.ai/artifact/2oTBmyx1Kstr6P5sn3DS4i

- **Lokal:** `index.html` im Browser öffnen (Doppelklick reicht).
- **Modus wählen:** Nach „Start“ zwischen **Classic** (nach oben springen) und **Run** (waagerecht laufen) wählen.
- **Classic:** Buttons links/rechts gedrückt halten. Am PC Pfeiltasten oder A/D.
- **Run:** rechts = springen (halten = höher, 2x = Doppelsprung), links = sliden. Am PC Hoch/Leertaste und Runter.
- `P` oder `Esc` = Pause, `Enter` = nochmal.

## Features

Aktuelle Version: **1.5**. Alle Änderungen stehen in [PATCHNOTES.md](PATCHNOTES.md).

- **Zwei Modi:** Classic (endlos nach oben) und Run (endlos nach rechts), jeweils mit eigenem Rekord
- **11 Comic-Welten**, alle 400 m ein Wechsel in zufälliger Reihenfolge: Strand bei Sonnenaufgang, Zauberwald, Verschneite Berge, Chinesisches Neujahr, Canyon bei Sonnenuntergang, Dunkle Grotte, Land der Süßigkeiten, Giftlabor, Wolkenkönigreich, Polarlichter bei Nacht, Weltall
- **Classic:** zufällige Plattformen, die mit der Höhe schwerer werden. Gegenstände: **Trampolin** (Mega-Sprung), **Federschuhe** (15 s doppelt so hohe Sprünge, ab und zu ein Salto), **Biene** (trägt dich 3 s nach oben), **Handy** (sehr selten: John Pork ruft an, ein Heli zieht dich 420 m hoch)
- **Run:** Abgründe, Plattform-Brücken, Hindernisse mit eigenem Look je Welt, 3 Herzen, Trüffel zum Sammeln. Items: **Magnet**, **Schild**, **Sau-Turbo**, **Herz**. Gegner kann man durch Draufspringen besiegen
- **Trüffel-Währung** über alle Runden (Anzeige im Hauptmenü), **Shop** als Vorschau (Skins kommen bald)
- Meter-Anzeige, Pause-Menü (Sound an/aus, Hauptmenü), Bestleistungen lokal gespeichert, Rekord-Markierung im Level

## Spielstand (Trüffel, Rekorde, gekaufte Sachen)

- Der Spielstand wird doppelt gespeichert: im Browser **und** im dauerhaften Server-Speicher des Spiel-Links, privat pro Person. Updates löschen ihn nicht.
- Beim Start werden beide zusammengeführt: Zahlen nehmen den höheren Wert, gekaufte Sachen werden vereinigt. Trüffel zählen getrennt als „verdient“ und „ausgegeben“, so geht beim Zusammenführen nichts verloren und nichts wird doppelt gezählt.
- **Regel für alle Updates:** Speicher-Schlüssel (`porkjump_*` bzw. `best`, `bestRun`, `earned`, `spent`, `owned`) nie umbenennen oder löschen, nur neue hinzufügen. Käufe immer als `spent` + `owned` speichern.

## Dateien

- `index.html` – Aufbau (Menüs, Buttons)
- `style.css` – Aussehen der Menüs/Buttons
- `game.js` – Classic-Modus, Welten, Pork, Sound, Menüs. Gameplay-Werte stehen ganz oben.
- `run.js` – Run-Modus (Streckengenerator, Hindernisse, Items). Werte stehen oben im `R`-Objekt.
