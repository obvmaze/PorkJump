# Pork Jump 🐷

Hochkant endless Jump 'n' Run mit John Pork in der Hauptrolle

## Spielen

- **Online für alle (ohne Account):** https://obvmaze.github.io/PorkJump/
  Am Handy über „Teilen → Zum Home-Bildschirm“ als App mit eigenem Icon speichern.
- **Claude-Spiel-Link:** https://claude.ai/artifact/2oTBmyx1Kstr6P5sn3DS4i (nur mit Claude-Account)
- **Lokal:** `index.html` im Browser öffnen (Doppelklick reicht).
- **Zwei Menü-Seiten:** Das 2D-Menü hat **Classic** (nach oben springen) und **Run** (waagerecht laufen). Über den Knopf **3D** unten links geht's ins 3D-Menü mit **3D Jump 'n' Run** (3D-Endlos-Runner), über **2D** wieder zurück. Das Spiel merkt sich die zuletzt genutzte Seite.
- **Classic:** Buttons links/rechts gedrückt halten. Am PC Pfeiltasten oder A/D.
- **Run:** rechts = springen (halten = höher, 2x = Doppelsprung), links = sliden. Am PC Hoch/Leertaste und Runter.
- **3D Jump 'n' Run:** irgendwo wischen: links/rechts = Spur, hoch = springen, runter = sliden. Am PC Pfeiltasten/WASD, Leertaste = springen.
- `P` oder `Esc` = Pause, `Enter` = nochmal.

## Features

Aktuelle Version: **2.0**. Alle Änderungen stehen in [PATCHNOTES.md](PATCHNOTES.md).

- **Drei Modi:** Classic (endlos nach oben) und Run (endlos nach rechts) im 2D-Menü, 3D Jump 'n' Run (3D-Strand-Runner) im 3D-Menü, jeweils mit eigenem Rekord. Im 3D-Menü tanzt John Pork in 3D auf einer kleinen Strandbühne
- **3D Jump 'n' Run:** 3 Spuren mit Kurven und Hügeln, Sprung-, Slide- und Block-Hindernisse, entgegenkommende Gegner, Handys zum Sammeln (zählen aufs 3D-Konto), Power-ups **Federschuhe** und **Biene** (Biene: 3x so schnell, fliegt ca. 5x so weit), Items mit Lichtsäule, Gegner mit Warnzeichen
- **11 Comic-Welten**, alle 400 m ein Wechsel in zufälliger Reihenfolge: Strand bei Sonnenaufgang, Zauberwald, Verschneite Berge, Chinesisches Neujahr, Canyon bei Sonnenuntergang, Dunkle Grotte, Land der Süßigkeiten, Giftlabor, Wolkenkönigreich, Polarlichter bei Nacht, Weltall
- **Classic:** zufällige Plattformen, die mit der Höhe schwerer werden. Gegenstände: **Trampolin** (Mega-Sprung), **Federschuhe** (15 s doppelt so hohe Sprünge, ab und zu ein Salto), **Biene** (trägt dich 3 s nach oben), **Handy** (sehr selten: John Pork ruft an, ein Heli zieht dich 420 m hoch)
- **Run:** Abgründe, Plattform-Brücken, Hindernisse mit eigenem Look je Welt, 3 Herzen, Handys zum Sammeln. Items: **Magnet**, **Schild**, **Sau-Turbo**, **Herz**. Gegner kann man durch Draufspringen besiegen
- **Handy-Währung, getrennt für 2D und 3D:** Handys aus Run landen auf dem 2D-Konto (alte Trüffel wurden 1:1 zu 2D-Handys), Handys aus 3D Jump 'n' Run auf dem 3D-Konto. Jede Seite hat ihren eigenen **Shop** (noch Vorschau, Skins kommen bald)
- Meter-Anzeige, Pause-Menü (Sound an/aus, Hauptmenü), Bestleistungen lokal gespeichert, Rekord-Markierung im Level

## Spielstand (Handys, Rekorde, gekaufte Sachen)

- Der Spielstand wird doppelt gespeichert: im Browser **und** im dauerhaften Server-Speicher des Spiel-Links, privat pro Person. Updates löschen ihn nicht.
- Beim Start werden beide zusammengeführt: Zahlen nehmen den höheren Wert, gekaufte Sachen werden vereinigt. Die Währung zählt getrennt als „verdient“ und „ausgegeben“, so geht beim Zusammenführen nichts verloren und nichts wird doppelt gezählt.
- Auf der GitHub-Pages-Seite liegt der Spielstand im Browser des Spielers (Adresse bleibt bei Updates gleich, das Spiel bittet den Browser, die Daten dauerhaft zu behalten). Für ein neues Gerät gibt es in den Einstellungen den **Spielstand-Code** (exportieren / laden, führt verlustfrei zusammen).
- **Regel für alle Updates:** Speicher-Schlüssel (`porkjump_*` bzw. `best`, `bestRun`, `best3d`, `phones`, `bestPhones`, `earned`, `spent`, `owned`, `spent3d`, `owned3d`) nie umbenennen oder löschen, nur neue hinzufügen. Käufe im 2D-Shop als `spent` + `owned`, im 3D-Shop als `spent3d` + `owned3d` speichern. 2D-Konto = `earned` − `spent`, 3D-Konto = `phones` − `spent3d`.

## Dateien

- `index.html` – Aufbau (Menüs, Buttons)
- `style.css` – Aussehen der Menüs/Buttons
- `game.js` – Classic-Modus, Welten, Pork, Sound, Menüs. Gameplay-Werte stehen ganz oben.
- `run.js` – Run-Modus (Streckengenerator, Hindernisse, Items). Werte stehen oben im `R`-Objekt.
- `run3d.js` – 3D Jump 'n' Run und 3D-Menü (Three.js-Szene, Tanz, Strecke, Pork-Modell, Hindernisse, Power-ups). Werte stehen oben im `R3`-Objekt. Alle Modelle und Texturen werden im Code erzeugt.
- `vendor/three.min.js` – [Three.js](https://threejs.org) r149 (MIT-Lizenz, siehe `vendor/three-LICENSE.txt`). Wird erst geladen, wenn man ins 3D-Menü wechselt.
