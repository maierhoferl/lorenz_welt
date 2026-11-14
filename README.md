# Lorenz' Welt 🌾🍎🐄

Ein Aufbau- und Entdeckerspiel im Browser für Kinder (7–10 Jahre). Läuft auf Desktop, iPad und iPhone – ohne Installation, ohne Build-Schritt.

**Spielen:** https://maierhoferl.github.io/lorenz_welt/

## Spielidee
- Du bist ein blonder Bub auf einer kleinen Farm: ein Weizenfeld, zwei Apfelbäume.
- **Ernten:** Stell dich auf ein reifes Feld, unter einen Baum oder neben eine Kuh – es wird automatisch geerntet. Bessere Werkzeuge ernten schneller (Hände → Sichel → Sense → Motormäher → Mähdrescher).
- **Verkaufen:** Beim **Händler** werden Waren zu Geldscheinen.
- **Kaufen:** Das Geld trägst du selbst zum **Laden**: Felder, Bäume, Kühe, Werkzeuge, Gebäude, Land.
- **Verarbeiten:** Mühle (Weizen → Mehl), Bäckerei (Mehl → Brot), Molkerei (Milch → Joghurt), Käserei (Milch → Käse), Konditorei (Äpfel + Mehl + Milch → Apfelkuchen). Verarbeitete Waren bringen mehr Geld.
- **Automatik:** Mit Mähdrescher, Baumschüttler oder Melkroboter wird automatisch geerntet. Dann liefern Felder/Bäume/Kühe von selbst an die Gebäude, und Gebäude geben Zwischenprodukte (z. B. Mehl) an die nächsten weiter. **Fertige Produkte und Geld trägst du immer selbst.**
- **❗ Warnungen** über Dingen zeigen, wenn etwas fehlt, ein Lager voll ist oder die Mengen nicht zusammenpassen (rot = blockiert, gelb = Mengen stimmen nicht).
- **📊 Produktions-Plan** zeigt alle Ketten als Diagramm mit Mengen pro Minute – auch die, die du noch nicht gebaut hast.
- **ℹ️ Wie geht das?** erklärt bei jedem Ding, wie es wirklich funktioniert (Hefe, Lab, Mähdrescher, Hydraulik …).
- Je größer die Welt, desto älter wird der Bub (bis zum Erwachsenen).
- Kein Ziel – die Welt wachsen zu lassen ist das Spiel.

**Steuerung:** Pfeiltasten / WASD. Auf iPad/iPhone: irgendwo hintippen und ziehen = Joystick.

**Spieler:** Lorenz und Adrian sind angelegt, weitere können dazukommen. Beim ersten Start legt jeder einen 4-stelligen Code fest. Code vergessen → Rechenaufgaben lösen (Schwierigkeit nach Alter).
Spielstände werden online gespeichert (Cloudflare Worker + D1, Ordner `worker/`) und sind auf jedem Gerät verfügbar: lokal alle 5 s, Server alle 30 s und beim Verlassen. Ohne Internet läuft das Spiel lokal weiter; der neuere Stand gewinnt.
Der Code wird am Server geprüft (5 Fehlversuche → 2 Min. Sperre), die Rechenaufgaben zur Wiederherstellung stellt und prüft ebenfalls der Server.

## Neue Produktionskette hinzufügen
Alles Inhaltliche steht in `data.js`:
1. Neue Ware in `ITEMS` (Name, Emoji, Verkaufspreis).
2. Neues Gebäude in `THINGS` mit `kind: 'factory'`, `in: { zutat: menge }`, `item`, `n`, `time`, `price`, `info`.
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
