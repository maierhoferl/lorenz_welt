# Lorenz' Welt 🌾🍎🐄

Ein Aufbau- und Entdeckerspiel im Browser für Kinder (7–10 Jahre). Läuft auf Desktop, iPad und iPhone – ohne Installation, ohne Build-Schritt.

**Spielen:** https://maierhoferl.github.io/lorenz_welt/

## Spielidee
- Du bist ein blonder Bub auf einer kleinen Farm: ein Weizenfeld, zwei Apfelbäume.
- **Ernten:** Stell dich auf ein reifes Feld, unter einen Baum oder neben eine Kuh – es wird automatisch geerntet. Bessere Werkzeuge ernten schneller (Hände → Sichel → Sense → Motormäher → Mähdrescher).
- **Verkaufen:** Beim **Händler** werden Waren zu Geldscheinen.
- **Kaufen:** Das Geld trägst du selbst zum **Laden**: Felder, Bäume, Kühe, Werkzeuge, Gebäude, Land.
- **Verarbeiten:** Mühle (Weizen → Mehl), Bäckerei (Mehl → Brot), Molkerei (Milch → Joghurt), Käserei (Milch → Käse), Konditorei (Äpfel + Mehl + Milch → Apfelkuchen). Verarbeitete Waren bringen mehr Geld.
- **Neue Rezepte:** Baust du eine *Endstation* (Gebäude, dessen Ware nirgends weiterverarbeitet wird, z. B. Konditorei), kommt eine neue mehrstufige Kette in den Laden: Butterkekse (Zentrifuge → Butterei → Keksbäckerei), Apfelessig, Pizza, Lasagne (Griessmühle → Nudelfabrik → Trattoria), Sahnetorte. Reihenfolge steht in `data.js` → `UNLOCKS`.
- **Automatik:** Mit Mähdrescher, Baumschüttler oder Melkroboter wird automatisch geerntet. Dann liefern Felder/Bäume/Kühe von selbst an die Gebäude, und Gebäude geben Zwischenprodukte (z. B. Mehl) an die nächsten weiter. **Fertige Produkte und Geld trägst du selbst** – ausser du stellst einen sehr teuren **🚚 Spediteur** an (Werkzeuge: Lastenrad → Lieferwagen → Lastwagen). Seine Fahrzeuge fahren sichtbar zu den Gebäuden, holen Endprodukte ab und verkaufen sie beim Händler. Ab dem Lastwagen kannst du beliebig viele weitere Lastwagen kaufen.
- **❗ Warnungen** über Dingen zeigen, wenn etwas fehlt, ein Lager voll ist oder die Mengen nicht zusammenpassen (rot = blockiert, gelb = Mengen stimmen nicht).
- **📊 Produktions-Plan** zeigt alle Ketten als Diagramm mit Mengen pro Minute – auch die, die du noch nicht gebaut hast.
- **ℹ️ Wie geht das?** erklärt bei jedem Ding, wie es wirklich funktioniert (Hefe, Lab, Mähdrescher, Hydraulik …).
- **🇨🇭 Schweiz:** Im Norden stehen die Alpen (mit Gipfelfahne und Bergsee), im Osten liegt der See des Spielers (z. B. „Lorenzsee“) – hineinlaufen geht nicht. Bezahlt wird in Franken (Fr.) mit Schweizer Banknoten-Farben, die Kühe tragen Glocken, Hof/Laden/Händler haben Fahnen. Schweizer Rezepte: Müesli-Küche (Äpfel + Joghurt → Birchermüesli) und Fondue-Stübli (Käse + Brot → Käsefondue). Texte in Schweizer Schreibweise (ss statt ß).
- **🏔️ Deko** (Laden → Reiter „Deko“): Dinge ohne Funktion, einfach schön und lustig – Steinmann, Gartenzwerg, Tanne, Wanderweg-Schild, Edelweiss, Schneemann, Schweizer Fahne, Murmeltier, Alphornbläser, Bernhardiner, Fondue-Tisch, Dorfbrunnen, Chalet, Uhrturm (zeigt die echte Uhrzeit). Nach dem Kauf trägst du sie und stellst sie mit **📍 Hier abstellen** (oder Enter/Leertaste) selbst hin; mit **✋ Umstellen** kannst du sie später verschieben. Schwan, Segelboot und Raddampfer schwimmen auf dem See, Heissluftballone fliegen über die Welt, die Gondelbahn fährt in die Berge. Neue Deko: `data.js` → `DECOS` und Zeichnung in `game.js` → `DECO_DRAW`.
- **🗺️ Land-Stufen schalten Neues frei:** Ab Land-Stufe 10 wächst die Welt nach Osten: 🍇 **Weinberg** (Rebstock-Reihen → Kelterei/Traubensaft, Dörrhaus/Rosinen → Schnecken-Beck/Rosinenschnecken, Werkzeuge Rebschere → Traubenbutte → Traubenvollernter). Ab Stufe 20 kommen 🐟 **Fischteiche** dazu (Filetiererei, Räucherei, Seebeiz/Fischknusperli, Werkzeuge Angel → Netz → Fischpumpe). Im Laden sieht man vorher schon 🔒, was kommt. Gesteuert über `land:` in `THINGS`/`TOOLS` und `from:` in `AREAS`.
- **🏡 Bauernhof im Alpenstil** wird mit dem Land ausgebaut (`HOF_LV` in `data.js`): Stufe 2 Brunnen + Holzbeige, 5 Kornspeicher, 10 zweiter Stock mit Geranien-Balkon, 15 Glockentürmchen auf dem Stall, 20 Kapelle.
- Je grösser die Welt, desto älter wird der Bub (bis zum Erwachsenen).
- Kein Ziel – die Welt wachsen zu lassen ist das Spiel.

**Steuerung:** Pfeiltasten / WASD. Auf iPad/iPhone: irgendwo hintippen und ziehen = Joystick, zwei Finger = Zoom.

**Spieler:** Lorenz und Adrian sind angelegt, weitere können dazukommen. Beim ersten Start legt jeder einen 4-stelligen Code fest. Code vergessen → Rechenaufgaben lösen (Schwierigkeit nach Alter).
Spielstände werden online gespeichert (Cloudflare Worker + D1, Ordner `worker/`) und sind auf jedem Gerät verfügbar: lokal alle 5 s, Server alle 30 s und beim Verlassen. Ohne Internet läuft das Spiel lokal weiter; der neuere Stand gewinnt.
Der Code wird am Server geprüft (5 Fehlversuche → 2 Min. Sperre), die Rechenaufgaben zur Wiederherstellung stellt und prüft ebenfalls der Server.

## Neue Produktionskette hinzufügen
Alles Inhaltliche steht in `data.js`:
1. Neue Ware in `ITEMS` (Name, Emoji, Verkaufspreis).
2. Neues Gebäude in `THINGS` (soll es erst freigeschaltet werden: zusätzlich als Gruppe in `UNLOCKS`) mit `kind: 'factory'`, `in: { zutat: menge }`, `item`, `n`, `time`, `price`, `info`.
3. Optional: eigene Zeichnung in `game.js` → `DRAW.<typ>` (sonst Standard-Haus) und eigener Klang in `audio.js` → `BED`/`EV`.

Laden, Diagramm, Transport und Warnungen funktionieren dann automatisch.

## Dateien
- `index.html` – Bildschirme & Stil
- `data.js` – Spielinhalte (Waren, Gebäude, Werkzeuge, Karte)
- `game.js` – Spiellogik, Zeichnen, Laden, Diagramm, Spieler/Code
- `audio.js` – alle Klänge, live erzeugt mit WebAudio

## Hosting
Statische Dateien → GitHub Pages (Branch `main`, Ordner `/`). Funktioniert genauso auf Cloudflare Pages (kein Build-Befehl, Ausgabeordner `/`).

### Server (Cloudflare)
```
cd worker
npx wrangler@4 login
npx wrangler@4 d1 execute lorenz-welt --remote --file=schema.sql   # nur beim ersten Mal
npx wrangler@4 deploy
```
Adresse steht in `game.js` → `API`. Einen Code zurücksetzen (Notfall): `npx wrangler@4 d1 execute lorenz-welt --remote --command "SELECT v FROM kv WHERE k='profiles'"` und `pinHash` des Spielers entfernen.
