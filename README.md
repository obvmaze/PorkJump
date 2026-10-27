# Pork Jump 🐷

Hochkant endless Jump 'n' Run mit John Pork in der Hauptrolle

## Spielen

- **Online für alle (ohne Account):** https://obvmaze.github.io/PorkJump/
  Am Handy über „Teilen → Zum Home-Bildschirm“ als App mit eigenem Icon speichern.
- **Claude-Spiel-Link:** https://claude.ai/artifact/2oTBmyx1Kstr6P5sn3DS4i (nur mit Claude-Account)
- **Lokal:** `index.html` im Browser öffnen (Doppelklick reicht).
- **Modus wählen:** Nach „Start“ zwischen **Classic** (nach oben springen), **Run** (waagerecht laufen) und **3D Run** (3D-Endlos-Runner) wählen.
- **Classic:** Buttons links/rechts gedrückt halten. Am PC Pfeiltasten oder A/D.
- **Run:** rechts = springen (halten = höher, 2x = Doppelsprung), links = sliden. Am PC Hoch/Leertaste und Runter.
- **3D Run:** irgendwo wischen: links/rechts = Spur, hoch = springen, runter = sliden. Am PC Pfeiltasten/WASD, Leertaste = springen.
- `P` oder `Esc` = Pause, `Enter` = nochmal.

## Features

Aktuelle Version: **2.0**. Alle Änderungen stehen in [PATCHNOTES.md](PATCHNOTES.md).

- **Drei Modi:** Classic (endlos nach oben), Run (endlos nach rechts) und 3D Run (3D-Strand-Runner), jeweils mit eigenem Rekord
- **3D Run:** 3 Spuren mit Kurven und Hügeln, Sprung-, Slide- und Block-Hindernisse, entgegenkommende Gegner, Handys als eigene Sammel-Statistik, Power-ups **Federschuhe** und **Biene**
- **11 Comic-Welten**, alle 400 m ein Wechsel in zufälliger Reihenfolge: Strand bei Sonnenaufgang, Zauberwald, Verschneite Berge, Chinesisches Neujahr, Canyon bei Sonnenuntergang, Dunkle Grotte, Land der Süßigkeiten, Giftlabor, Wolkenkönigreich, Polarlichter bei Nacht, Weltall
- **Classic:** zufällige Plattformen, die mit der Höhe schwerer werden. Gegenstände: **Trampolin** (Mega-Sprung), **Federschuhe** (15 s doppelt so hohe Sprünge, ab und zu ein Salto), **Biene** (trägt dich 3 s nach oben), **Handy** (sehr selten: John Pork ruft an, ein Heli zieht dich 420 m hoch)
- **Run:** Abgründe, Plattform-Brücken, Hindernisse mit eigenem Look je Welt, 3 Herzen, Handys zum Sammeln. Items: **Magnet**, **Schild**, **Sau-Turbo**, **Herz**. Gegner kann man durch Draufspringen besiegen
- **Handy-Währung** über alle Runden und Modi (Anzeige im Hauptmenü): Handys aus Run und 3D Run landen auf einem Konto, alte Trüffel wurden 1:1 zu Handys. **Shop** als Vorschau (Skins kommen bald)
- Meter-Anzeige, Pause-Menü (Sound an/aus, Hauptmenü), Bestleistungen lokal gespeichert, Rekord-Markierung im Level

## Spielstand (Handys, Rekorde, gekaufte Sachen)

- Der Spielstand wird doppelt gespeichert: im Browser **und** im dauerhaften Server-Speicher des Spiel-Links, privat pro Person. Updates löschen ihn nicht.
- Beim Start werden beide zusammengeführt: Zahlen nehmen den höheren Wert, gekaufte Sachen werden vereinigt. Die Währung zählt getrennt als „verdient“ und „ausgegeben“, so geht beim Zusammenführen nichts verloren und nichts wird doppelt gezählt.
- Auf der GitHub-Pages-Seite liegt der Spielstand im Browser des Spielers (Adresse bleibt bei Updates gleich, das Spiel bittet den Browser, die Daten dauerhaft zu behalten). Für ein neues Gerät gibt es in den Einstellungen den **Spielstand-Code** (exportieren / laden, führt verlustfrei zusammen).
- **Regel für alle Updates:** Speicher-Schlüssel (`porkjump_*` bzw. `best`, `bestRun`, `best3d`, `phones`, `bestPhones`, `earned`, `spent`, `owned`) nie umbenennen oder löschen, nur neue hinzufügen. Käufe immer als `spent` + `owned` speichern. Kontostand = `earned` (Run + alte Trüffel) + `phones` (3D Run) − `spent`.

## Dateien

- `index.html` – Aufbau (Menüs, Buttons)
- `style.css` – Aussehen der Menüs/Buttons
- `game.js` – Classic-Modus, Welten, Pork, Sound, Menüs. Gameplay-Werte stehen ganz oben.
- `run.js` – Run-Modus (Streckengenerator, Hindernisse, Items). Werte stehen oben im `R`-Objekt.
- `run3d.js` – 3D Run (Three.js-Szene, Strecke, Pork-Modell, Hindernisse, Power-ups). Werte stehen oben im `R3`-Objekt. Alle Modelle und Texturen werden im Code erzeugt.
- `vendor/three.min.js` – [Three.js](https://threejs.org) r149 (MIT-Lizenz, siehe `vendor/three-LICENSE.txt`). Wird nur beim Start von 3D Run geladen.
