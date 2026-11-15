'use strict';
// ===== Lorenz' Welt – Spieldaten =====
// Neue Produktionskette hinzufügen:
//   1. Ware in ITEMS eintragen
//   2. Gebäude in THINGS eintragen: kind:'factory', in:{ware:menge}, item:<ergebnis>, n:<menge>, time:<sek>
//   3. Optional: Zeichenfunktion in game.js (DRAW[typ]) und Klang in audio.js (BED/EV[typ])
// Alles andere (Laden, Diagramm, Warnungen, Transport) funktioniert dann automatisch.

const T = 48;                      // Pixel pro Kachel
const WORLD = { w: 60, h: 44 };    // Weltgröße in Kacheln (h wächst mit gekauftem Land)
const WORLD_H0 = WORLD.h;
const HARVEST_TIME = 3;            // Sekunden Ernte von Hand (geteilt durch Werkzeug-Tempo)
const OUT_CAP = 10;                // Lager-Größe für fertige Waren in Gebäuden

const ITEMS = {
  weizen:  { name: 'Weizen',      icon: '🌾', price: 2 },
  apfel:   { name: 'Äpfel',       icon: '🍎', price: 3 },
  milch:   { name: 'Milch',       icon: '🥛', price: 5 },
  mehl:    { name: 'Mehl',        icon: '🛍️', price: 7 },
  brot:    { name: 'Brot',        icon: '🍞', price: 18 },
  joghurt: { name: 'Joghurt',     icon: '🥣', price: 14 },
  kaese:   { name: 'Käse',        icon: '🧀', price: 30 },
  kuchen:  { name: 'Apfelkuchen', icon: '🥧', price: 38 },
  // freischaltbar (siehe UNLOCKS)
  sahne:   { name: 'Sahne',       icon: '🍶', price: 20 },
  butter:  { name: 'Butter',      icon: '🧈', price: 55 },
  kekse:   { name: 'Butterkekse', icon: '🍪', price: 45 },
  saft:    { name: 'Apfelsaft',   icon: '🧃', price: 13 },
  essig:   { name: 'Apfelessig',  icon: '🫙', price: 36 },
  pizza:   { name: 'Pizza',       icon: '🍕', price: 62 },
  griess:  { name: 'Grieß',       icon: '🥄', price: 10 },
  nudeln:  { name: 'Nudeln',      icon: '🍝', price: 28 },
  lasagne: { name: 'Lasagne',     icon: '🫕', price: 88 },
  torte:   { name: 'Sahnetorte',  icon: '🎂', price: 160 },
};

const THINGS = {
  feld: { kind: 'grow', name: 'Weizenfeld', icon: '🌾', area: 'acker', price: 40,
    item: 'weizen', n: 6, time: 40, tool: 'getreide', w: 5, h: 3,
    info: 'Weizen ist eigentlich ein Gras! Aus einem Korn wächst ein Halm mit einer Ähre – darin stecken 30 bis 50 neue Körner. Zuerst ist er grün, im Sommer wird er goldgelb und trocken: dann ist er reif. In Echt dauert das fast ein Jahr (man sät schon im Herbst), hier geht es schneller.' },
  baum: { kind: 'grow', name: 'Apfelbaum', icon: '🌳', area: 'obst', price: 25,
    item: 'apfel', n: 4, time: 35, tool: 'obst',
    info: 'Im Frühling blüht der Apfelbaum weiß-rosa. Bienen fliegen von Blüte zu Blüte und tragen Blütenstaub mit (Bestäubung). Nur aus bestäubten Blüten wächst ein Apfel – erst klein und grün, dann groß und rot. Ein großer Baum trägt bis zu 500 Äpfel im Jahr!' },
  kuh: { kind: 'grow', name: 'Kuh', icon: '🐄', area: 'weide', price: 80,
    item: 'milch', n: 2, time: 25, tool: 'milch',
    info: 'Eine Kuh gibt nur Milch, nachdem sie ein Kalb bekommen hat. Sie frisst etwa 50 kg Gras am Tag, trinkt bis zu 100 Liter Wasser und gibt 20–30 Liter Milch. Ihr Magen hat 4 Kammern: Sie schluckt das Gras, würgt es später wieder hoch und kaut es nochmal – darum heißt sie Wiederkäuer.' },

  muehle: { kind: 'factory', name: 'Mühle', icon: '🌬️', area: 'dorf', price: 150,
    in: { weizen: 2 }, item: 'mehl', n: 1, time: 5,
    info: 'Der Wind dreht die Flügel, die drehen über Zahnräder einen schweren Mühlstein. Die Körner werden zwischen zwei Steinen zerrieben (heute nimmt man Stahlwalzen). Danach wird gesiebt: Die Schale (Kleie) bleibt hängen, das feine weiße Mehl fällt durch. Aus 100 kg Weizen werden etwa 75 kg Mehl.' },
  baeckerei: { kind: 'factory', name: 'Bäckerei', icon: '🥖', area: 'dorf', price: 300,
    in: { mehl: 2 }, item: 'brot', n: 1, time: 9,
    info: 'Teig = Mehl + Wasser + Salz + Hefe. Hefe sind winzige Pilze. Sie fressen Zucker und machen dabei Gas (CO₂) – wie kleine Pupse 😄. Die Gasbläschen lassen den Teig aufgehen. Im Ofen bei etwa 230 °C wird die Kruste braun und knusprig, innen bleibt das Brot weich.' },
  molkerei: { kind: 'factory', name: 'Molkerei', icon: '🏭', area: 'dorf', price: 250,
    in: { milch: 2 }, item: 'joghurt', n: 1, time: 7,
    info: 'Die Milch wird auf 90 °C erhitzt – das tötet schlechte Keime. Dann kühlt man sie auf 42 °C ab und gibt Milchsäurebakterien dazu. Diese guten Bakterien verwandeln den Milchzucker in Milchsäure. Die Milch wird dick und leicht sauer: Joghurt! Das dauert etwa 5 Stunden.' },
  kaeserei: { kind: 'factory', name: 'Käserei', icon: '🧀', area: 'dorf', price: 400,
    in: { milch: 4 }, item: 'kaese', n: 1, time: 14,
    info: 'Zur warmen Milch kommt Lab (ein Enzym). Die Milch wird fest wie Pudding. Diese Masse schneidet man: Es entsteht fester Bruch und flüssige Molke. Der Bruch wird in runde Formen gepresst, in Salzwasser gebadet und reift dann Wochen bis Jahre im kühlen Keller. Für 1 kg Käse braucht man ca. 10 Liter Milch!' },
  konditorei: { kind: 'factory', name: 'Konditorei', icon: '🎂', area: 'dorf', price: 450,
    in: { apfel: 3, mehl: 1, milch: 1 }, item: 'kuchen', n: 1, time: 12,
    info: 'Für Apfelkuchen mischt man Mehl, Milch, Butter, Eier und Zucker zu einem Teig. Die Äpfel werden geschält, in Spalten geschnitten und auf den Teig gelegt. Dann bäckt der Kuchen etwa 45 Minuten bei 180 °C. Butter wird übrigens auch aus Milch gemacht – durch kräftiges Schlagen von Sahne!' },

  // ----- freischaltbar: erst im Laden, wenn eine Endstation gebaut wurde (UNLOCKS) -----
  zentrifuge: { kind: 'factory', name: 'Milch-Zentrifuge', icon: '🌀', area: 'dorf', price: 350,
    in: { milch: 3 }, item: 'sahne', n: 1, time: 6,
    info: 'Eine Trommel dreht sich ganz schnell – bis zu 6000 Mal in der Minute! Dabei wird die schwere, wässrige Milch nach außen gedrückt, das leichte Fett bleibt innen. So trennt man die Sahne (Rahm) von der Magermilch. Früher ließ man die Milch einfach stehen, bis die Sahne oben schwamm.' },
  butterei: { kind: 'factory', name: 'Butterei', icon: '🧈', area: 'dorf', price: 400,
    in: { sahne: 2 }, item: 'butter', n: 1, time: 8,
    info: 'Sahne wird im Butterfass lange und kräftig geschlagen. Irgendwann kleben die kleinen Fettkügelchen zusammen – plötzlich gibt es gelbe Butterklumpen und eine dünne Flüssigkeit, die Buttermilch. Die Butter wird gewaschen und geknetet. Für 1 kg Butter braucht man etwa 20 Liter Milch!' },
  keksbaeckerei: { kind: 'factory', name: 'Keksbäckerei', icon: '🍪', area: 'dorf', price: 550,
    in: { butter: 1, mehl: 2 }, item: 'kekse', n: 2, time: 10,
    info: 'Butter, Mehl und Zucker werden zu einem Mürbeteig geknetet. Der Teig wird dünn ausgerollt und in Formen ausgestochen oder gestanzt. Im Ofen backen die Kekse nur etwa 10 Minuten. Das Wort „Keks“ kommt vom englischen „cakes“ – Kuchen.' },
  saftpresse: { kind: 'factory', name: 'Saftpresse', icon: '🧃', area: 'dorf', price: 300,
    in: { apfel: 3 }, item: 'saft', n: 1, time: 5,
    info: 'Die Äpfel werden gewaschen und klein gemahlen – das heißt Maische. Dann presst eine Presse den Saft heraus, den Rest (Trester) bekommen oft die Tiere. Danach wird der Saft kurz erhitzt, damit er lange haltbar bleibt. Aus 1,5 kg Äpfeln wird etwa 1 Liter Saft.' },
  essigbrauerei: { kind: 'factory', name: 'Essigbrauerei', icon: '🫙', area: 'dorf', price: 450,
    in: { saft: 2 }, item: 'essig', n: 1, time: 12,
    info: 'Zuerst verwandeln Hefen den Zucker im Apfelsaft in Alkohol. Dann kommen Essigbakterien dazu: Die brauchen Luft und machen aus dem Alkohol Essigsäure. Auf dem Essig wächst dabei eine glibberige Haut – die „Essigmutter“. Fertiger Essig enthält keinen Alkohol mehr.' },
  pizzeria: { kind: 'factory', name: 'Pizzeria', icon: '🍕', area: 'dorf', price: 600,
    in: { mehl: 2, kaese: 1 }, item: 'pizza', n: 1, time: 10,
    info: 'Pizzateig ist Mehl, Wasser, Salz, Öl und Hefe. Er wird dünn ausgezogen, mit Tomatensoße bestrichen und mit Käse belegt. Ein Holzofen wird über 400 °C heiß – darin ist die Pizza in nur 90 Sekunden fertig! Erfunden wurde sie in Neapel in Italien.' },
  griessmuehle: { kind: 'factory', name: 'Grießmühle', icon: '⚙️', area: 'dorf', price: 350,
    in: { weizen: 3 }, item: 'griess', n: 1, time: 5,
    info: 'Grieß ist grob gemahlenes Getreide – die Körnchen sind größer als beim Mehl. Für Nudeln nimmt man Hartweizen: Der ist besonders fest und gelb. Die Walzen stehen weiter auseinander als beim Mehl, und Siebe sortieren die passende Korngröße heraus.' },
  nudelfabrik: { kind: 'factory', name: 'Nudelfabrik', icon: '🍝', area: 'dorf', price: 500,
    in: { griess: 2 }, item: 'nudeln', n: 1, time: 8,
    info: 'Grieß und Wasser werden zu einem festen Teig geknetet. Eine Maschine drückt den Teig durch eine Lochscheibe – die Form der Löcher bestimmt die Nudel: Spaghetti, Spiralen, Muscheln … Dann werden die Nudeln langsam getrocknet, damit sie nicht brechen. Trocken halten sie jahrelang!' },
  trattoria: { kind: 'factory', name: 'Trattoria', icon: '🫕', area: 'dorf', price: 750,
    in: { nudeln: 1, kaese: 1, milch: 1 }, item: 'lasagne', n: 1, time: 14,
    info: 'Für Lasagne legt man breite Nudelplatten, Fleisch- oder Gemüsesoße und weiße Soße (Béchamel aus Milch, Butter und Mehl) in Schichten übereinander – wie ein Stapel. Oben drauf kommt Käse. Im Ofen wird alles weich und der Käse goldbraun.' },
  tortenmeister: { kind: 'factory', name: 'Tortenmeister', icon: '🎂', area: 'dorf', price: 1000,
    in: { kuchen: 2, sahne: 2 }, item: 'torte', n: 1, time: 16,
    info: 'Ein Konditor-Meister schneidet Böden quer durch und füllt sie mit Sahne und Früchten. Kalte Sahne wird mit dem Schneebesen steif geschlagen: Dabei werden winzige Luftbläschen ins Fett eingeschlossen. Zum Schluss wird verziert – mit Spritzbeutel, Schokolade und Früchten. Konditor ist ein eigener Beruf mit 3 Jahren Lehre!' },
};

// Freischalten: Wird eine Endstation gebaut (ihre Ware verarbeitet niemand weiter, z. B. Konditorei),
// kommt die nächste Kette in den Laden. Reihenfolge zählt (Tortenmeister braucht Sahne).
const UNLOCKS = [
  ['zentrifuge', 'butterei', 'keksbaeckerei'],
  ['saftpresse', 'essigbrauerei'],
  ['pizzeria'],
  ['griessmuehle', 'nudelfabrik', 'trattoria'],
  ['tortenmeister'],
];

const TOOLS = {
  getreide: { name: 'Getreide-Ernte', icon: '🌾', levels: [
    { name: 'Hände', speed: 1, price: 0, info: 'Halme mit der Hand abreißen – ganz schön mühsam!' },
    { name: 'Sichel', speed: 2, price: 30, info: 'Eine gebogene Klinge. Man fasst die Halme mit einer Hand und schneidet sie mit der anderen ab. Die Sichel gibt es seit über 10.000 Jahren!' },
    { name: 'Sense', speed: 4, price: 90, info: 'Langer Stiel, lange Klinge: Man mäht im Stehen mit schwingenden Bewegungen. Viel schneller als mit der Sichel.' },
    { name: 'Motormäher', speed: 8, price: 350, info: 'Ein Benzinmotor bewegt einen Mähbalken: Viele dreieckige Messer gleiten schnell hin und her – wie eine riesige Schere.' },
    { name: 'Mähdrescher', speed: 20, price: 1500, auto: true, info: 'Mähen und Dreschen in einem! Vorne schneidet das Schneidwerk die Halme. Eine schnelle Trommel schlägt die Körner aus den Ähren (dreschen). Siebe und ein Gebläse trennen Spreu vom Korn. Die Körner kommen in den Korntank, das Stroh fällt hinten raus. ERNTET AUTOMATISCH!' },
  ]},
  obst: { name: 'Obst-Ernte', icon: '🍎', levels: [
    { name: 'Hände', speed: 1, price: 0, info: 'Äpfel mit der Hand pflücken – aber nur die unteren erreichst du.' },
    { name: 'Pflückstange', speed: 2, price: 25, info: 'Eine lange Stange mit einem Körbchen und kleinen Krallen. Damit holst du hohe Äpfel, ohne zu klettern.' },
    { name: 'Obstleiter', speed: 4, price: 80, info: 'Eine Leiter mit drei Beinen: Drei Punkte stehen immer fest – auch auf unebener Wiese wackelt nichts.' },
    { name: 'Hebebühne', speed: 8, price: 300, info: 'Hydraulik: Eine Pumpe drückt Öl in einen Zylinder. Das Öl schiebt einen Kolben nach oben – und die Plattform mit dir hebt sich.' },
    { name: 'Baumschüttler', speed: 20, price: 1200, auto: true, info: 'Eine Zange packt den Stamm und rüttelt ihn ein paar Sekunden kräftig. Die Äpfel fallen in ein aufgespanntes Auffangtuch. ERNTET AUTOMATISCH!' },
  ]},
  milch: { name: 'Melken', icon: '🥛', levels: [
    { name: 'Hände', speed: 1, price: 0, info: 'Melken mit der Hand: Die Zitze oben mit Daumen und Zeigefinger zudrücken, dann mit den anderen Fingern die Milch nach unten drücken.' },
    { name: 'Melkschemel & Eimer', speed: 2, price: 40, info: 'Ein Hocker zum Sitzen und ein Eimer dazwischen – so geht es bequemer und schneller.' },
    { name: 'Melkmaschine', speed: 5, price: 250, info: 'Melkbecher kommen auf die Zitzen. Eine Pumpe saugt im Takt (Pulsieren) – fast wie ein trinkendes Kalb. Die Milch fließt durch Schläuche in einen Kühltank mit 4 °C.' },
    { name: 'Melkroboter', speed: 20, price: 1100, auto: true, info: 'Die Kuh geht selbst hinein, wann sie will! Ein Roboterarm mit Laser-Kamera findet die Zitzen, putzt sie und setzt die Becher an. MELKT AUTOMATISCH!' },
  ]},
  tragen: { name: 'Transport', icon: '🎒', levels: [
    { name: 'Hände', cap: 12, price: 0, info: 'Viel passt nicht in zwei Hände.' },
    { name: 'Korb', cap: 24, price: 15, info: 'Ein geflochtener Korb aus Weidenruten – leicht und stabil.' },
    { name: 'Schubkarre', cap: 50, price: 60, info: 'Ein Hebel auf Rädern! Die Last liegt nah am Rad, darum musst du nur einen Teil des Gewichts heben.' },
    { name: 'Leiterwagen', cap: 100, price: 200, info: 'Vier Räder tragen das ganze Gewicht – du musst nur noch ziehen.' },
    { name: 'Traktor mit Anhänger', cap: 240, price: 800, info: 'Ein Dieselmotor: Kraftstoff verbrennt im Zylinder und drückt einen Kolben. Die Kurbelwelle macht daraus eine Drehung, die über das Getriebe die riesigen Räder antreibt.' },
  ]},
};

const LAND_PRICES = [120, 300, 700, 1500, 3000];

// Bereiche in Kacheln; Plätze werden reihenweise belegt. base + per*Landstufe = freie Plätze
// Ist das Raster voll, geht es im Neuland südlich der Welt weiter (ex = Spalte, ec = Spalten dort)
const AREAS = {
  acker: { name: 'Acker',     x: 4,  y: 13, cols: 2, rows: 5, dx: 7,   dy: 5, base: 2, per: 2, ex: 4,  ec: 2 },
  obst:  { name: 'Obstgarten', x: 4, y: 4,  cols: 9, rows: 2, dx: 2.8, dy: 3, base: 4, per: 3, ex: 18, ec: 5 },
  weide: { name: 'Weide',      x: 41, y: 6, cols: 5, rows: 3, dx: 3,   dy: 3, base: 2, per: 3, ex: 33, ec: 3 },
  dorf:  { name: 'Dorf',       x: 22, y: 31, cols: 5, rows: 2, dx: 7,  dy: 7, base: 2, per: 2, ex: 46, ec: 2 },
};
const PASTURE = { x: 38.5, y: 3.5, w: 17, h: 12 }; // Zaun (Kacheln)

// Feste Orte (Kacheln, x/y = Mitte unten)
const FIXED = [
  { type: 'hof', name: 'Bauernhof', x: 29, y: 12, info: 'Dein Zuhause. Hier hat alles angefangen – mit einem Feld und zwei Apfelbäumen.' },
  { type: 'haendler', name: 'Händler', x: 23, y: 23, info: 'Beim Händler verkaufst du deine Waren. Er gibt dir dafür Geldscheine. Verarbeitete Waren (Mehl, Brot, Käse …) bringen viel mehr Geld als Rohstoffe – weil darin mehr Arbeit steckt!' },
  { type: 'laden', name: 'Laden', x: 36, y: 23, info: 'Im Laden kaufst du Tiere, Bäume, Felder, Werkzeuge, Gebäude und neues Land. Bring dein Geld hierher!' },
];

// Wachstum des Spielers: ab welchem Welt-Punktestand wie viele Jahre älter
const STAGES = [
  { score: 0, add: 0 }, { score: 8, add: 2 }, { score: 18, add: 5 }, { score: 32, add: 9 }, { score: 50, add: 16 },
];

// Wege (Kacheln) für die Optik
// Weg ins Neuland im Süden (erscheint, sobald dort Plätze liegen)
const PATHS_SOUTH = [[[32, 30], [32, 44]], [[4, 44], [56, 44]]];
const PATHS = [
  [[29, 13], [29, 18], [23, 18], [23, 24]],
  [[29, 18], [36, 18], [36, 24]],
  [[29, 18], [29, 30], [50, 30]],
  [[29, 30], [22, 30]],
  [[23, 18], [16, 18], [16, 12]],
  [[36, 18], [38, 18], [38, 10]],
  [[29, 13], [29, 9]],
];
