'use strict';
// ===== Lorenz' Welt – Spieldaten =====
// Neue Produktionskette hinzufügen:
//   1. Ware in ITEMS eintragen
//   2. Gebäude in THINGS eintragen: kind:'factory', in:{ware:menge}, item:<ergebnis>, n:<menge>, time:<sek>
//   3. Optional: Zeichenfunktion in game.js (DRAW[typ]) und Klang in audio.js (BED/EV[typ])
// Alles andere (Laden, Diagramm, Warnungen, Transport) funktioniert dann automatisch.

const T = 48;                      // Pixel pro Kachel
const WORLD = { w: 48, h: 46 };    // Weltgrösse in Kacheln, wächst mit dem Land (fitWorld)
const HARVEST_TIME = 3;            // Sekunden Ernte von Hand (geteilt durch Werkzeug-Tempo)
const OUT_CAP = 10;                // Lager-Grösse für fertige Waren in Gebäuden

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
  griess:  { name: 'Griess',       icon: '🥄', price: 10 },
  nudeln:  { name: 'Nudeln',      icon: '🍝', price: 28 },
  lasagne: { name: 'Lasagne',     icon: '🫕', price: 88 },
  torte:   { name: 'Sahnetorte',  icon: '🎂', price: 160 },
  // Schweizer Spezialitäten
  muesli:  { name: 'Birchermüesli', icon: '🥗', price: 34 },
  fondue:  { name: 'Käsefondue',  icon: '🍲', price: 110 },
  // Weinberg (ab Land-Stufe 10) und Fischerei (ab Land-Stufe 20)
  trauben:      { name: 'Trauben',        icon: '🍇', price: 5 },
  traubensaft:  { name: 'Traubensaft',    icon: '🥤', price: 22 },
  rosinen:      { name: 'Rosinen',        icon: '🟤', price: 24 },
  schnecken:    { name: 'Rosinenschnecken', icon: '🥐', price: 95 },
  fisch:        { name: 'Fisch',          icon: '🐟', price: 9 },
  filet:        { name: 'Fischfilet',     icon: '🍣', price: 26 },
  raeucherfisch: { name: 'Räucherfisch',  icon: '🐠', price: 45 },
  knusperli:    { name: 'Fischknusperli', icon: '🍤', price: 120 },
  // Tierhof (ab Land-Stufe 30)
  eier:       { name: 'Eier',        icon: '🥚', price: 6 },
  fleisch:    { name: 'Fleisch',     icon: '🥩', price: 12 },
  cervelat:   { name: 'Cervelat',    icon: '🌭', price: 36 },
  zopf:       { name: 'Butterzopf',  icon: '🥨', price: 48 },
  meringue:   { name: 'Meringues',   icon: '☁️', price: 32 },
  cordonbleu: { name: 'Cordon bleu', icon: '🍖', price: 150 },
  // Import-Terminal (ab Land-Stufe 35)
  kakao:       { name: 'Rohkakao',          icon: '🫘', price: 10 },
  kakaomasse:  { name: 'Kakaomasse',        icon: '🟫', price: 44 },
  schokolade:  { name: 'Milchschokolade',   icon: '🍫', price: 125 },
  schoggitorte: { name: 'Schokoladetörtchen', icon: '🧁', price: 320 },
  kaffee:      { name: 'Rohkaffee',         icon: '🫛', price: 9 },
  roestkaffee: { name: 'Röstkaffee',        icon: '☕', price: 28 },
  kafi:        { name: 'Milchkaffee',       icon: '🥛', price: 80 },
  // neue Rezepte aus vorhandenen Zutaten
  glace:        { name: 'Glace',            icon: '🍦', price: 44 },
  magronen:     { name: 'Älplermagronen',   icon: '🥘', price: 90 },
  rahmmeringue: { name: 'Meringues mit Doppelrahm', icon: '🍨', price: 115 },
  malz:         { name: 'Malz',             icon: '🌱', price: 14 },
  malztrunk:    { name: 'Malztrunk',        icon: '🫗', price: 120 },
  schoggifondue: { name: 'Schoggifondue',   icon: '🍡', price: 210 },
  // Imkerei (ab Land-Stufe 40), Kartoffelacker (45), Kastanienhain (50)
  honig:       { name: 'Honig',             icon: '🍯', price: 12 },
  laeckerli:   { name: 'Läckerli',          icon: '🧇', price: 50 },
  biber:       { name: 'Biber',             icon: '🐻', price: 85 },
  kartoffel:   { name: 'Kartoffeln',        icon: '🥔', price: 6 },
  roesti:      { name: 'Rösti',             icon: '🥞', price: 110 },
  raclette:    { name: 'Raclette',          icon: '🫠', price: 115 },
  chips:       { name: 'Chips',             icon: '🍟', price: 32 },
  kastanien:   { name: 'Kastanien',         icon: '🌰', price: 9 },
  marroni:     { name: 'Heissi Marroni',    icon: '🥡', price: 45 },
  vermicelles: { name: 'Vermicelles',       icon: '🍧', price: 95 },
  // Geissen-Alp (ab Land-Stufe 55), Zuckerrüben (60), Chriesi-Garten (65)
  geissmilch:  { name: 'Geissmilch',        icon: '🍼', price: 8 },
  geisskaese:  { name: 'Geisschäsli',       icon: '⚪', price: 40 },
  chaeschueechli: { name: 'Chäschüechli',   icon: '🥮', price: 120 },
  rueben:      { name: 'Zuckerrüben',       icon: '🍠', price: 5 },
  zucker:      { name: 'Zucker',            icon: '🧊', price: 30 },
  rahmtaefeli: { name: 'Rahmtäfeli',        icon: '🍬', price: 170 },
  nougat:      { name: 'Nougat',            icon: '🥜', price: 110 },
  kirschen:    { name: 'Chriesi',           icon: '🍒', price: 7 },
  konfi:       { name: 'Chriesi-Konfi',     icon: '🥫', price: 60 },
  kirschtorte: { name: 'Zuger Kirschtorte', icon: '🍰', price: 190 },
};

const THINGS = {
  feld: { kind: 'grow', name: 'Weizenfeld', icon: '🌾', area: 'acker', price: 40,
    item: 'weizen', n: 6, time: 40, tool: 'getreide', w: 5, h: 3,
    info: 'Weizen ist eigentlich ein Gras! Aus einem Korn wächst ein Halm mit einer Ähre – darin stecken 30 bis 50 neue Körner. Zuerst ist er grün, im Sommer wird er goldgelb und trocken: dann ist er reif. In Echt dauert das fast ein Jahr (man sät schon im Herbst), hier geht es schneller.' },
  baum: { kind: 'grow', name: 'Apfelbaum', icon: '🌳', area: 'obst', price: 25,
    item: 'apfel', n: 4, time: 35, tool: 'obst',
    info: 'Im Frühling blüht der Apfelbaum weiss-rosa. Bienen fliegen von Blüte zu Blüte und tragen Blütenstaub mit (Bestäubung). Nur aus bestäubten Blüten wächst ein Apfel – erst klein und grün, dann gross und rot. Ein grosser Baum trägt bis zu 500 Äpfel im Jahr!' },
  kuh: { kind: 'grow', name: 'Kuh', icon: '🐄', area: 'weide', price: 80,
    item: 'milch', n: 2, time: 25, tool: 'milch',
    info: 'Eine Kuh gibt nur Milch, nachdem sie ein Kalb bekommen hat. Sie frisst etwa 50 kg Gras am Tag, trinkt bis zu 100 Liter Wasser und gibt 20–30 Liter Milch. Ihr Magen hat 4 Kammern: Sie schluckt das Gras, würgt es später wieder hoch und kaut es nochmal – darum heisst sie Wiederkäuer.' },

  muehle: { kind: 'factory', name: 'Mühle', icon: '🌬️', area: 'dorf', price: 150,
    in: { weizen: 2 }, item: 'mehl', n: 1, time: 5,
    info: 'Der Wind dreht die Flügel, die drehen über Zahnräder einen schweren Mühlstein. Die Körner werden zwischen zwei Steinen zerrieben (heute nimmt man Stahlwalzen). Danach wird gesiebt: Die Schale (Kleie) bleibt hängen, das feine weisse Mehl fällt durch. Aus 100 kg Weizen werden etwa 75 kg Mehl.' },
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

  muesli_kueche: { kind: 'factory', name: 'Müesli-Küche', icon: '🥗', area: 'dorf', price: 350,
    in: { apfel: 2, joghurt: 1 }, item: 'muesli', n: 1, time: 8,
    info: 'Das Birchermüesli hat der Schweizer Arzt Maximilian Bircher-Benner vor über 100 Jahren erfunden. Er fand: Rohe Früchte machen gesund und stark! Die Äpfel werden mit der Schale gerieben, mit Haferflocken, Joghurt (oder Milch), Zitrone und Nüssen gemischt. „Müesli“ ist Schweizerdeutsch und heisst „kleines Mus“.' },
  fonduestube: { kind: 'factory', name: 'Fondue-Stübli', icon: '🍲', area: 'dorf', price: 500,
    in: { kaese: 2, brot: 1 }, item: 'fondue', n: 1, time: 12,
    info: 'Käsefondue ist das Schweizer Nationalgericht! Geriebener Käse (oft Gruyère und Vacherin) schmilzt mit etwas Weisswein im Caquelon – einem Topf aus Ton – über einer kleinen Flamme. Jeder spiesst ein Stück Brot auf eine lange Gabel und tunkt es ein. Wer sein Brot im Käse verliert, muss eine Runde singen! 🎶' },
  // ----- Weinberg: erst ab Land-Stufe 10 (land), Fischerei ab 20 -----
  rebe: { kind: 'grow', name: 'Rebstock-Reihe', icon: '🍇', area: 'weinberg', price: 400, land: 10,
    item: 'trauben', n: 6, time: 45, tool: 'reben',
    info: 'Reben sind Kletterpflanzen: Sie halten sich mit kleinen Ranken an Drähten fest. Am Genfersee wachsen sie an steilen Hängen in Terrassen (Lavaux) – die Sonne wärmt die Steinmauern, und der See spiegelt noch mehr Licht auf die Trauben. Erst sind sie klein, hart und grün, im Herbst süss und blau. Die Traubenernte heisst „Wümmet“.' },
  kelterei: { kind: 'factory', name: 'Kelterei', icon: '🥤', area: 'dorf', price: 900, land: 10,
    in: { trauben: 3 }, item: 'traubensaft', n: 1, time: 6,
    info: 'In der Kelterei werden die Trauben von den Stielen getrennt (abbeeren) und zerquetscht. Eine Presse drückt den süssen Saft heraus – den Most. Wird er gleich kurz erhitzt, bleibt er Traubensaft. Für 1 Liter braucht man etwa 1,3 kg Trauben.' },
  doerrhaus: { kind: 'factory', name: 'Dörrhaus', icon: '☀️', area: 'dorf', price: 1100, land: 10,
    in: { trauben: 4 }, item: 'rosinen', n: 1, time: 10,
    info: 'Rosinen sind getrocknete Trauben! Warme Luft zieht ganz langsam das Wasser heraus – aus 4 kg Trauben wird nur 1 kg Rosinen. Weil fast kein Wasser mehr drin ist, können keine Bakterien wachsen: Rosinen halten monatelang und sind sehr süss.' },
  schneckenbeck: { kind: 'factory', name: 'Schnecken-Beck', icon: '🥐', area: 'dorf', price: 1800, land: 10,
    in: { rosinen: 1, mehl: 2, milch: 1 }, item: 'schnecken', n: 1, time: 12,
    info: 'Für Rosinenschnecken rollt der Bäcker („Beck“ sagt man in der Schweiz) einen Hefeteig flach aus, bestreicht ihn mit Vanillecreme und streut Rosinen darauf. Dann wird alles aufgerollt wie ein Schneckenhaus und in Scheiben geschnitten. Im Ofen gehen die Schnecken schön auf.' },
  fischteich: { kind: 'grow', name: 'Fischteich', icon: '🐟', area: 'fischerei', price: 900, land: 20,
    item: 'fisch', n: 4, time: 40, tool: 'fischen',
    info: 'In Schweizer Seen leben Egli (Flussbarsche), Felchen und Forellen. Fische atmen mit Kiemen: Sie holen den Sauerstoff aus dem Wasser. Im Teich wachsen die kleinen Fische heran, bis sie gross genug sind. Ein Egli legt bis zu 300 000 Eier – als lange Schnüre an Wasserpflanzen!' },
  filetiererei: { kind: 'factory', name: 'Filetiererei', icon: '🍣', area: 'dorf', price: 1500, land: 20,
    in: { fisch: 2 }, item: 'filet', n: 1, time: 6,
    info: 'Mit einem langen, biegsamen Messer schneidet man das Fleisch links und rechts von der Gräte ab – das sind die Filets. Haut und Gräten bleiben übrig. Gute Filetierer schaffen einen Fisch in weniger als einer Minute!' },
  raeucherei: { kind: 'factory', name: 'Räucherei', icon: '🐠', area: 'dorf', price: 1800, land: 20,
    in: { fisch: 3 }, item: 'raeucherfisch', n: 1, time: 10,
    info: 'Die Fische hängen in einem Ofen über glimmendem Buchenholz. Der Rauch gibt ihnen Farbe und Geschmack, und er macht sie länger haltbar. Beim Heissräuchern ist es 60–90 °C heiss, beim Kalträuchern unter 25 °C – das dauert dann Tage!' },
  seebeiz: { kind: 'factory', name: 'Seebeiz', icon: '🍤', area: 'dorf', price: 3000, land: 20,
    in: { filet: 2, mehl: 1 }, item: 'knusperli', n: 1, time: 12,
    info: 'Eine „Beiz“ ist in der Schweiz ein gemütliches Restaurant. In der Seebeiz gibt es Fischknusperli: Fischstücke werden in Mehl und Teig gewendet und in heissem Öl ausgebacken, bis sie goldbraun und knusprig sind. Dazu gibt es Zitrone und Pommes frites.' },
  // ----- Tierhof: ab Land-Stufe 30, im Osten. Masthühner und Säuli geben beide Fleisch für die Metzgerei -----
  huhn: { kind: 'grow', name: 'Hühnerstall', icon: '🐔', area: 'tierhof', price: 2500, land: 30,
    item: 'eier', n: 6, time: 30, tool: 'stall',
    info: 'Ein Huhn legt fast jeden Tag ein Ei – auch ohne Hahn! Dann schlüpft aber kein Küken. Hühner scharren mit den Füssen im Boden und picken Körner, Würmer und Käfer. Nachts schlafen sie auf einer Stange, weil sie dort vor dem Fuchs sicher sind.' },
  masthuhn: { kind: 'grow', name: 'Masthühner-Stall', icon: '🐓', area: 'tierhof', price: 3000, land: 30,
    item: 'fleisch', n: 3, time: 40, tool: 'stall',
    info: 'Masthühner sind Hühner, die nicht Eier legen, sondern schnell gross werden – für Pouletfleisch. In der Schweiz müssen sie genug Platz, Tageslicht und Sitzstangen haben. Viele dürfen auch nach draussen auf die Wiese.' },
  schwein: { kind: 'grow', name: 'Säulistall', icon: '🐖', area: 'tierhof', price: 3500, land: 30,
    item: 'fleisch', n: 5, time: 55, tool: 'stall',
    info: 'Schweine („Säuli“) sind sehr schlau – schlauer als Hunde! Sie können nicht schwitzen. Darum suhlen sie sich im Schlamm: Der kühlt und schützt die Haut vor Sonnenbrand und Insekten. Mit ihrer Rüsselnase riechen sie Futter tief im Boden.' },
  metzgerei: { kind: 'factory', name: 'Metzgerei', icon: '🌭', area: 'dorf', price: 4000, land: 30,
    in: { fleisch: 2 }, item: 'cervelat', n: 1, time: 8,
    info: 'Der Metzger (Fleischer) verarbeitet Fleisch von Schweinen, Rindern und Hühnern. Für Würste wird das Fleisch fein gehackt, gewürzt und in eine lange Haut gefüllt. Der Cervelat ist die Nationalwurst der Schweiz – am 1. August und beim Wandern wird er über dem Feuer gebraten.' },
  zopfbeck: { kind: 'factory', name: 'Zopf-Beck', icon: '🥨', area: 'dorf', price: 4500, land: 30,
    in: { mehl: 2, eier: 2, milch: 1 }, item: 'zopf', n: 1, time: 10,
    info: 'Der Butterzopf gehört in der Schweiz zum Sonntags-Zmorge! Der Teig aus Mehl, Milch, Butter, Hefe und Ei wird in Stränge gerollt und geflochten – wie ein Haarzopf. Vor dem Backen streicht man ihn mit Eigelb an, darum glänzt er so schön goldbraun.' },
  meringuerie: { kind: 'factory', name: 'Meringue-Küche', icon: '☁️', area: 'dorf', price: 5000, land: 30,
    in: { eier: 3 }, item: 'meringue', n: 1, time: 9,
    info: 'Für Meringues trennt man das Eiweiss vom Eigelb und schlägt es mit Zucker steif – Luftbläschen machen es weiss und schaumig. Dann trocknen die Häufchen stundenlang im lauwarmen Ofen. Erfunden wurden sie angeblich in Meiringen im Berner Oberland. Mit Rahm sind sie ein Klassiker!' },
  cordonbleu_beiz: { kind: 'factory', name: 'Cordon-bleu-Beiz', icon: '🍖', area: 'dorf', price: 8000, land: 30,
    in: { fleisch: 1, kaese: 1, eier: 1, mehl: 1 }, item: 'cordonbleu', n: 1, time: 14,
    info: 'Ein Cordon bleu ist ein dünnes Schnitzel, gefüllt mit Käse (und Schinken). Es wird zuerst in Mehl, dann in verquirltem Ei und zuletzt in Paniermehl gewendet und in der Pfanne goldbraun gebraten. Wenn man hineinschneidet, läuft der Käse heraus – in der Schweiz ein Lieblingsessen!' },
  // ----- Import-Terminal: ab Land-Stufe 35, ganz im Osten. Kakao und Kaffee wachsen nicht in der Schweiz – sie kommen per Container -----
  kakaoimport: { kind: 'grow', name: 'Kakao-Container', icon: '🫘', area: 'terminal', price: 6000, land: 35,
    item: 'kakao', n: 6, time: 45, tool: 'terminal',
    info: 'Kakaobäume wachsen nur, wo es das ganze Jahr warm und feucht ist – zum Beispiel in Ghana oder Ecuador. Die Bohnen stecken in grossen Früchten, die direkt am Stamm hängen. Sie werden vergoren, getrocknet und in Säcken per Schiff nach Europa gebracht, dann per Rheinschiff oder Zug in die Schweiz.' },
  kaffeeimport: { kind: 'grow', name: 'Kaffee-Container', icon: '🫛', area: 'terminal', price: 5500, land: 35,
    item: 'kaffee', n: 6, time: 40, tool: 'terminal',
    info: 'Kaffee wächst als rote Kirsche an einem Strauch, zum Beispiel in Brasilien, Kolumbien oder Äthiopien. In jeder Kirsche stecken zwei grüne Bohnen. Roh riechen sie nach Gras – erst beim Rösten bekommen sie Farbe und Duft. Die Schweiz röstet sehr viel Kaffee für die ganze Welt!' },
  kakaoroesterei: { kind: 'factory', name: 'Kakao-Rösterei', icon: '🔥', area: 'dorf', price: 6500, land: 35,
    in: { kakao: 3 }, item: 'kakaomasse', n: 1, time: 8,
    info: 'Die Kakaobohnen werden bei etwa 130 °C geröstet, dann geknackt: Die Schale fliegt weg, übrig bleiben die Kakaosplitter. Mühlen mahlen sie so fein, dass das Fett darin schmilzt – es entsteht eine dicke, bittere, braune Flüssigkeit: die Kakaomasse.' },
  schoggifabrik: { kind: 'factory', name: 'Schoggi-Fabrik', icon: '🍫', area: 'dorf', price: 9000, land: 35,
    in: { kakaomasse: 2, milch: 2 }, item: 'schokolade', n: 1, time: 12,
    info: 'Kakaomasse, Zucker, Kakaobutter und Milchpulver werden gemischt und in der Conche stundenlang gerührt und gewärmt. Das hat Rodolphe Lindt 1879 in Bern erfunden – so wurde Schokolade zartschmelzend. Die Milchschokolade hat Daniel Peter aus Vevey erfunden. Dann wird sie in Tafelformen gegossen.' },
  schoggikonditorei: { kind: 'factory', name: 'Konditorei: Schoggi-Törtchen', icon: '🧁', area: 'dorf', price: 12000, land: 35,
    in: { schokolade: 2, mehl: 1, eier: 1 }, item: 'schoggitorte', n: 1, time: 14,
    info: 'Für Schokoladetörtchen schmilzt der Konditor die Schoggi langsam im warmen Wasserbad – zu heiss, und sie wird krümelig. Dann rührt er Eier, Zucker und Mehl darunter, füllt kleine Förmchen und bäckt sie kurz. Innen bleiben sie schön weich und saftig.' },
  kaffeeroesterei: { kind: 'factory', name: 'Kaffee-Rösterei', icon: '☕', area: 'dorf', price: 6000, land: 35,
    in: { kaffee: 2 }, item: 'roestkaffee', n: 1, time: 7,
    info: 'In einer drehenden Trommel werden die grünen Bohnen bei über 200 °C geröstet. Plötzlich knacken sie wie Popcorn („First Crack“)! Je länger man röstet, desto dunkler und kräftiger wird der Kaffee.' },
  kafistube: { kind: 'factory', name: 'Kafi-Stube', icon: '🥛', area: 'dorf', price: 7500, land: 35,
    in: { roestkaffee: 2, milch: 1 }, item: 'kafi', n: 1, time: 8,
    info: 'Die gerösteten Bohnen werden frisch gemahlen. Heisses Wasser läuft mit Druck durchs Kaffeepulver – das gibt Espresso. Dazu kommt viel aufgeschäumte warme Milch: fertig ist die „Schale“, wie man in der Schweiz zum Milchkaffee sagt.' },
  // ----- Imkerei: ab Land-Stufe 40 -----
  bienenhaus: { kind: 'grow', name: 'Bienenhaus', icon: '🐝', area: 'imkerei', price: 7000, land: 40,
    item: 'honig', n: 4, time: 40, tool: 'imker',
    info: 'Im Schweizer Bienenhaus stehen die Bienenkästen dicht nebeneinander, jeder mit einem bunten Flugloch – so findet jede Biene ihr Zuhause. Eine Biene fliegt für einen Löffel Honig etwa 1000 Blüten an! Den Nektar trägt sie im Honigmagen heim, wo er in den Waben eindickt. Ist er reif, verschliessen die Bienen die Wabe mit einem Wachsdeckel.' },
  laeckerli_huus: { kind: 'factory', name: 'Läckerli-Huus', icon: '🧇', area: 'dorf', price: 8000, land: 40,
    in: { honig: 2, mehl: 1 }, item: 'laeckerli', n: 1, time: 8,
    info: 'Basler Läckerli gibt es seit über 600 Jahren. Honig, Mehl, Mandeln, Orangeat und Gewürze werden zu einem zähen Teig geknetet, flach ausgewallt und gebacken. Noch warm streicht man eine Zuckerglasur darüber und schneidet kleine Rechtecke. „Läckerli“ kommt von „lecker“ – oder vom Ablecken der Finger!' },
  biberbeck: { kind: 'factory', name: 'Biber-Beck', icon: '🐻', area: 'dorf', price: 9500, land: 40,
    in: { honig: 2, mehl: 2, eier: 1 }, item: 'biber', n: 1, time: 10,
    info: 'Der Appenzeller Biber ist ein Lebkuchen mit Mandelfüllung. Früher drückte man ein Bild aus einem geschnitzten Holzmodel in den Teig – oft einen Bären. Mit einem Biber (dem Tier) hat er nichts zu tun: Der Name kommt wohl von „Pfeffer“, weil der Teig scharf gewürzt ist.' },
  // ----- Kartoffelacker: ab Land-Stufe 45 -----
  kartoffelfeld: { kind: 'grow', name: 'Kartoffelacker', icon: '🥔', area: 'kartoffelacker', price: 8000, land: 45,
    item: 'kartoffel', n: 8, time: 45, tool: 'kartoffel',
    info: 'Kartoffeln wachsen unter der Erde! Man steckt eine alte Kartoffel in den Boden, und aus ihren „Augen“ wachsen grüne Triebe. Unten bilden sich an den Wurzeln viele neue Knollen. Wenn das Kraut oben gelb und welk wird, sind sie reif. Die grünen Teile und Beeren der Pflanze sind giftig – nur die Knolle isst man.' },
  roestibeiz: { kind: 'factory', name: 'Rösti-Beiz', icon: '🥞', area: 'dorf', price: 10000, land: 45,
    in: { kartoffel: 3, butter: 1 }, item: 'roesti', n: 1, time: 10,
    info: 'Für Rösti raffelt man gekochte (oder rohe) Kartoffeln und brät sie in viel Butter zu einem dicken Fladen. Der Trick: Mit einem Teller wird die Rösti gewendet – einmal Mut, und hopp! Die Grenze zwischen Deutsch- und Welschschweiz heisst im Spass „Röstigraben“.' },
  raclettestube: { kind: 'factory', name: 'Raclette-Stube', icon: '🫠', area: 'dorf', price: 11000, land: 45,
    in: { kartoffel: 2, kaese: 2 }, item: 'raclette', n: 1, time: 10,
    info: 'Raclette kommt aus dem Wallis. Ein halber Käselaib wird vor das Feuer gestellt, bis die Schnittfläche schmilzt. Dann schabt man den weichen Käse ab – „racler“ heisst auf Französisch „schaben“. Dazu gibt es Gschwellti (Kartoffeln in der Schale), Essiggurken und Silberzwiebeln.' },
  chipsfabrik: { kind: 'factory', name: 'Chips-Fabrik', icon: '🍟', area: 'dorf', price: 9000, land: 45,
    in: { kartoffel: 3 }, item: 'chips', n: 1, time: 6,
    info: 'Die Kartoffeln werden geschält und in hauchdünne Scheiben geschnitten – dünner als ein Millimeter. In heissem Öl verdampft das Wasser darin blitzschnell, darum blubbert es so. Übrig bleibt eine knusprige Scheibe. Aus 4 kg Kartoffeln wird nur etwa 1 kg Chips!' },
  // ----- Kastanienhain (Selve): ab Land-Stufe 50 -----
  kastanienbaum: { kind: 'grow', name: 'Kastanienbaum', icon: '🌰', area: 'selve', price: 10000, land: 50,
    item: 'kastanien', n: 6, time: 50, tool: 'kastanien',
    info: 'Im Tessin wachsen ganze Wälder aus Edelkastanien, die Selven. Die Früchte stecken in stacheligen grünen Igeln. Im Herbst fallen sie herunter und platzen auf. Früher waren Kastanien so wichtig wie Brot – man nannte den Baum „Brotbaum“. Getrocknet halten sie den ganzen Winter.' },
  marronistand: { kind: 'factory', name: 'Marroni-Stand', icon: '🥡', area: 'dorf', price: 11000, land: 50,
    in: { kastanien: 3 }, item: 'marroni', n: 1, time: 6,
    info: 'Im Winter steht in vielen Schweizer Städten ein Marroni-Mann mit seinem Ofen. Er schneidet jede Kastanie kreuzweise ein, sonst platzt sie in der Hitze mit einem Knall! Dann röstet er sie in einer gelochten Pfanne über dem Feuer. In der Papiertüte wärmen sie auch die Hände.' },
  vermicelles_kueche: { kind: 'factory', name: 'Vermicelles-Küche', icon: '🍧', area: 'dorf', price: 14000, land: 50,
    in: { kastanien: 2, sahne: 1 }, item: 'vermicelles', n: 1, time: 10,
    info: 'Für Vermicelles kocht man Kastanien weich, schält sie und püriert sie mit Zucker und etwas Kirsch. Das Püree wird durch eine Presse mit kleinen Löchern gedrückt – heraus kommen braune „Würmchen“ wie Spaghetti (vermicelli heisst auf Italienisch „Würmchen“). Darunter Meringue, darauf Schlagrahm: fertig!' },
  // ----- Geissen-Alp: ab Land-Stufe 55 -----
  geiss: { kind: 'grow', name: 'Geissen-Stall', icon: '🐐', area: 'geissenalp', price: 12000, land: 55,
    item: 'geissmilch', n: 4, time: 35, tool: 'geiss',
    info: 'Geissen (Ziegen) sind tolle Kletterer: Ihre Hufe haben einen harten Rand und eine weiche Mitte – wie Kletterschuhe! Darum stehen sie sogar auf steilen Felsen. Sie fressen gern Blätter, Zweige und Kräuter und probieren alles – auch deinen Ärmel. Eine Geiss gibt etwa 3 Liter Milch am Tag.' },
  geisskaeserei: { kind: 'factory', name: 'Geissen-Chäsi', icon: '⚪', area: 'dorf', price: 13000, land: 55,
    in: { geissmilch: 3 }, item: 'geisskaese', n: 1, time: 8,
    info: 'Geisschäsli sind kleine, runde Frischkäse. Die Geissmilch wird mit etwas Lab dick, dann lässt man die Molke in kleinen Förmchen mit Löchern abtropfen. Schon nach ein paar Tagen sind sie fertig. Geissmilch schmeckt etwas kräftiger als Kuhmilch – manche sagen „geissig“.' },
  chaeschueechli_beck: { kind: 'factory', name: 'Chäschüechli-Beck', icon: '🥮', area: 'dorf', price: 15000, land: 55,
    in: { geisskaese: 1, mehl: 1, eier: 1, milch: 1 }, item: 'chaeschueechli', n: 1, time: 10,
    info: 'Chäschüechli sind kleine Käsekuchen aus Kuchenteig, gefüllt mit einem Guss aus Käse, Milch und Ei. Im Ofen geht der Guss auf und wird goldbraun. An Chilbis und Fasnachten isst man sie warm aus der Hand – Vorsicht, innen sind sie heiss!' },
  // ----- Zuckerrüben: ab Land-Stufe 60 -----
  ruebenfeld: { kind: 'grow', name: 'Zuckerrüben-Acker', icon: '🍠', area: 'ruebenacker', price: 14000, land: 60,
    item: 'rueben', n: 10, time: 50, tool: 'rueben',
    info: 'Die Zuckerrübe ist eine dicke, weisse Wurzel – so schwer wie ein Laib Brot. Fast ein Fünftel davon ist Zucker! Die grossen Blätter fangen Sonnenlicht ein, und die Pflanze speichert die Energie als Zucker in der Wurzel. Sie liegt fast ganz im Boden, nur der Kopf schaut heraus.' },
  zuckerfabrik: { kind: 'factory', name: 'Zuckerfabrik', icon: '🧊', area: 'dorf', price: 15000, land: 60,
    in: { rueben: 4 }, item: 'zucker', n: 1, time: 8,
    info: 'Die Rüben werden gewaschen und in dünne Schnitzel geschnitten. Heisses Wasser löst den Zucker heraus – wie beim Teekochen. Dann kocht man das süsse Wasser so lange ein, bis Kristalle entstehen. Eine Schleuder trennt die weissen Zuckerkristalle vom braunen Sirup. In der Schweiz gibt es Zuckerfabriken in Aarberg und Frauenfeld.' },
  taefeli_kueche: { kind: 'factory', name: 'Täfeli-Küche', icon: '🍬', area: 'dorf', price: 17000, land: 60,
    in: { zucker: 1, sahne: 2, butter: 1 }, item: 'rahmtaefeli', n: 1, time: 12,
    info: 'Für Rahmtäfeli (Nidletäfeli) kocht man Zucker, Rahm und Butter lange unter Rühren. Der Zucker wird braun und riecht nach Karamell. Die heisse Masse giesst man auf ein Blech, und wenn sie fest wird, schneidet man kleine Würfel. Nicht naschen, solange es heiss ist – das ist heisser als kochendes Wasser!' },
  nougat_kueche: { kind: 'factory', name: 'Nougat-Küche', icon: '🥜', area: 'dorf', price: 16000, land: 60,
    in: { zucker: 1, honig: 2, eier: 1 }, item: 'nougat', n: 1, time: 10,
    info: 'Weisses Nougat entsteht aus Honig, Zucker und steif geschlagenem Eiweiss, dazu kommen geröstete Mandeln oder Haselnüsse. Die Masse wird lange gerührt, bis sie zäh ist. Eine berühmte dreieckige Schweizer Schokolade aus Bern hat Honig-Mandel-Nougat drin – ihre Form erinnert an das Matterhorn.' },
  // ----- Chriesi-Garten: ab Land-Stufe 65 -----
  kirschbaum: { kind: 'grow', name: 'Chriesibaum', icon: '🍒', area: 'chriesigarten', price: 16000, land: 65,
    item: 'kirschen', n: 6, time: 40, tool: 'kirschen',
    info: '„Chriesi“ sagt man in der Schweiz zu Kirschen. Rund um Zug und im Baselbiet gibt es riesige alte Chriesibäume – so hoch, dass man lange Leitern braucht. Kirschen hängen immer zu zweit oder zu dritt an langen Stielen. Vögel lieben sie auch: Darum hängen Bauern glänzende Bänder in die Bäume.' },
  konfiserie: { kind: 'factory', name: 'Konfi-Küche', icon: '🥫', area: 'dorf', price: 17000, land: 65,
    in: { kirschen: 3, zucker: 1 }, item: 'konfi', n: 1, time: 8,
    info: 'Für Konfitüre kocht man Früchte mit viel Zucker. Der Zucker macht sie haltbar, weil Schimmelpilze in so viel Zucker nicht wachsen können. Ein Stoff aus den Früchten, das Pektin, macht die Konfi beim Abkühlen dick wie Gelee. Die heissen Gläser werden sofort verschlossen.' },
  kirschtorte_beck: { kind: 'factory', name: 'Zuger Konditorei', icon: '🍰', area: 'dorf', price: 20000, land: 65,
    in: { kirschen: 2, sahne: 1, mehl: 1, eier: 1 }, item: 'kirschtorte', n: 1, time: 14,
    info: 'Die Zuger Kirschtorte erfand der Konditor Heinrich Höhn vor über 100 Jahren in Zug. Zwei knusprige Nussmeringue-Böden, dazwischen ein weicher Biskuit mit Kirschensirup getränkt und Buttercrème. Oben drauf kommt Puderzucker mit einem Rautenmuster.' },
  // ----- freischaltbar: erst im Laden, wenn eine Endstation gebaut wurde (UNLOCKS) -----
  zentrifuge: { kind: 'factory', name: 'Milch-Zentrifuge', icon: '🌀', area: 'dorf', price: 350,
    in: { milch: 3 }, item: 'sahne', n: 1, time: 6,
    info: 'Eine Trommel dreht sich ganz schnell – bis zu 6000 Mal in der Minute! Dabei wird die schwere, wässrige Milch nach aussen gedrückt, das leichte Fett bleibt innen. So trennt man die Sahne (Rahm) von der Magermilch. Früher liess man die Milch einfach stehen, bis die Sahne oben schwamm.' },
  butterei: { kind: 'factory', name: 'Butterei', icon: '🧈', area: 'dorf', price: 400,
    in: { sahne: 2 }, item: 'butter', n: 1, time: 8,
    info: 'Sahne wird im Butterfass lange und kräftig geschlagen. Irgendwann kleben die kleinen Fettkügelchen zusammen – plötzlich gibt es gelbe Butterklumpen und eine dünne Flüssigkeit, die Buttermilch. Die Butter wird gewaschen und geknetet. Für 1 kg Butter braucht man etwa 20 Liter Milch!' },
  keksbaeckerei: { kind: 'factory', name: 'Keksbäckerei', icon: '🍪', area: 'dorf', price: 550,
    in: { butter: 1, mehl: 2 }, item: 'kekse', n: 2, time: 10,
    info: 'Butter, Mehl und Zucker werden zu einem Mürbeteig geknetet. Der Teig wird dünn ausgerollt und in Formen ausgestochen oder gestanzt. Im Ofen backen die Kekse nur etwa 10 Minuten. Das Wort „Keks“ kommt vom englischen „cakes“ – Kuchen.' },
  saftpresse: { kind: 'factory', name: 'Saftpresse', icon: '🧃', area: 'dorf', price: 300,
    in: { apfel: 3 }, item: 'saft', n: 1, time: 5,
    info: 'Die Äpfel werden gewaschen und klein gemahlen – das heisst Maische. Dann presst eine Presse den Saft heraus, den Rest (Trester) bekommen oft die Tiere. Danach wird der Saft kurz erhitzt, damit er lange haltbar bleibt. Aus 1,5 kg Äpfeln wird etwa 1 Liter Saft.' },
  essigbrauerei: { kind: 'factory', name: 'Essigbrauerei', icon: '🫙', area: 'dorf', price: 450,
    in: { saft: 2 }, item: 'essig', n: 1, time: 12,
    info: 'Zuerst verwandeln Hefen den Zucker im Apfelsaft in Alkohol. Dann kommen Essigbakterien dazu: Die brauchen Luft und machen aus dem Alkohol Essigsäure. Auf dem Essig wächst dabei eine glibberige Haut – die „Essigmutter“. Fertiger Essig enthält keinen Alkohol mehr.' },
  pizzeria: { kind: 'factory', name: 'Pizzeria', icon: '🍕', area: 'dorf', price: 600,
    in: { mehl: 2, kaese: 1 }, item: 'pizza', n: 1, time: 10,
    info: 'Pizzateig ist Mehl, Wasser, Salz, Öl und Hefe. Er wird dünn ausgezogen, mit Tomatensosse bestrichen und mit Käse belegt. Ein Holzofen wird über 400 °C heiss – darin ist die Pizza in nur 90 Sekunden fertig! Erfunden wurde sie in Neapel in Italien.' },
  griessmuehle: { kind: 'factory', name: 'Griessmühle', icon: '⚙️', area: 'dorf', price: 350,
    in: { weizen: 3 }, item: 'griess', n: 1, time: 5,
    info: 'Griess ist grob gemahlenes Getreide – die Körnchen sind grösser als beim Mehl. Für Nudeln nimmt man Hartweizen: Der ist besonders fest und gelb. Die Walzen stehen weiter auseinander als beim Mehl, und Siebe sortieren die passende Korngrösse heraus.' },
  nudelfabrik: { kind: 'factory', name: 'Nudelfabrik', icon: '🍝', area: 'dorf', price: 500,
    in: { griess: 2 }, item: 'nudeln', n: 1, time: 8,
    info: 'Griess und Wasser werden zu einem festen Teig geknetet. Eine Maschine drückt den Teig durch eine Lochscheibe – die Form der Löcher bestimmt die Nudel: Spaghetti, Spiralen, Muscheln … Dann werden die Nudeln langsam getrocknet, damit sie nicht brechen. Trocken halten sie jahrelang!' },
  trattoria: { kind: 'factory', name: 'Trattoria', icon: '🫕', area: 'dorf', price: 750,
    in: { nudeln: 1, kaese: 1, milch: 1 }, item: 'lasagne', n: 1, time: 14,
    info: 'Für Lasagne legt man breite Nudelplatten, Fleisch- oder Gemüsesosse und weisse Sosse (Béchamel aus Milch, Butter und Mehl) in Schichten übereinander – wie ein Stapel. Oben drauf kommt Käse. Im Ofen wird alles weich und der Käse goldbraun.' },
  tortenmeister: { kind: 'factory', name: 'Tortenmeister', icon: '🎂', area: 'dorf', price: 1000,
    in: { kuchen: 2, sahne: 2 }, item: 'torte', n: 1, time: 16,
    info: 'Ein Konditor-Meister schneidet Böden quer durch und füllt sie mit Sahne und Früchten. Kalte Sahne wird mit dem Schneebesen steif geschlagen: Dabei werden winzige Luftbläschen ins Fett eingeschlossen. Zum Schluss wird verziert – mit Spritzbeutel, Schokolade und Früchten. Konditor ist ein eigener Beruf mit 3 Jahren Lehre!' },
  // ----- neue Rezepte aus vorhandenen Zutaten -----
  gelateria: { kind: 'factory', name: 'Gelateria', icon: '🍦', area: 'dorf', price: 700,
    in: { milch: 2, sahne: 1 }, item: 'glace', n: 1, time: 7,
    info: 'Glace sagt man in der Schweiz für Speiseeis. Rahm, Milch und Zucker werden gemischt und gefroren – aber dabei ständig gerührt! So bleiben die Eiskristalle winzig, und es kommt Luft hinein: Die Glace wird cremig statt hart wie ein Eiswürfel. Früher kühlte man mit Eis und Salz: Salz lässt Eis schmelzen, und beim Schmelzen wird es noch kälter – bis −20 °C!' },
  sennhuette: { kind: 'factory', name: 'Sennhütte', icon: '🛖', area: 'dorf', price: 900,
    in: { nudeln: 1, kaese: 1, apfel: 2 }, item: 'magronen', n: 1, time: 12,
    info: 'Auf der Alp kocht der Senn, was er gerade hat: Magronen (Hörnli), Kartoffeln, Käse und Rahm, obendrauf Röstzwiebeln. Und dazu? Apfelmus! Süss und salzig zusammen schmeckt erstaunlich gut. Die Nudeln kamen mit italienischen Arbeitern in die Alpen, die vor rund 140 Jahren den Gotthardtunnel bauten – „Magronen“ kommt von „Maccheroni“.' },
  gruyerestube: { kind: 'factory', name: 'Greyerzer Stübli', icon: '🏰', area: 'dorf', price: 6000, land: 30,
    in: { meringue: 2, sahne: 1 }, item: 'rahmmeringue', n: 1, time: 9,
    info: 'Im Greyerzerland (Gruyère) isst man Meringues mit Doppelrahm. Der hat mindestens 45 % Fett – so dick, dass der Löffel darin stehen bleibt! Normaler Vollrahm hat etwa 35 %. Über dem Städtchen thront das Schloss Gruyères, fast 800 Jahre alt.' },
  maelzerei: { kind: 'factory', name: 'Mälzerei', icon: '🌱', area: 'dorf', price: 6000, land: 35,
    in: { weizen: 3 }, item: 'malz', n: 1, time: 8,
    info: 'Malz ist gekeimtes Getreide (meist Gerste, auch Weizen). Die Körner baden in Wasser, bis ein kleiner Keim herauswächst. Dabei wachen Enzyme auf – winzige Helfer, die die Stärke im Korn in süssen Malzzucker zerschneiden. Dann trocknet heisse Luft in der Darre das Grünmalz, damit es nicht weiterwächst. Probier es selbst: Kau lange auf einem Stück Brot – es wird süss, weil dein Speichel dasselbe macht!' },
  malzfabrik: { kind: 'factory', name: 'Malztrunk-Fabrik', icon: '💪', area: 'dorf', price: 10000, land: 35,
    in: { malz: 1, kakaomasse: 1, milch: 2, eier: 1 }, item: 'malztrunk', n: 1, time: 10,
    info: 'Der Berner Apotheker Albert Wander mischte 1904 Malzextrakt, Milch, Eier und Kakao zu einem Pulver – so entstand die „Ovo“. Sie sollte Kinder und Kranke stärken. Damit es ein Pulver wird, trocknet man die dicke Masse im Vakuum: Ohne Luftdruck kocht Wasser schon bei viel tieferer Temperatur weg, und der Geschmack bleibt erhalten.' },
  schoggistube: { kind: 'factory', name: 'Schoggifondue-Stübli', icon: '🍡', area: 'dorf', price: 11000, land: 35,
    in: { schokolade: 1, sahne: 1, apfel: 3 }, item: 'schoggifondue', n: 1, time: 10,
    info: 'Schoggi schmilzt bei etwa 34 °C – knapp unter deiner Körpertemperatur. Darum zergeht sie im Mund, aber in der Hand meistens nicht. Fürs Schoggifondue schmilzt man Schokolade mit Rahm im Caquelon, spiesst Apfelschnitze auf lange Gabeln und tunkt sie ein. Aber nicht zu heiss: Sonst verbrennt die Schoggi und wird krümelig!' },
};

// Freischalten: Wird eine Endstation gebaut (ihre Ware verarbeitet niemand weiter, z. B. Konditorei),
// kommt die nächste Kette in den Laden. Reihenfolge zählt (Tortenmeister braucht Sahne).
const UNLOCKS = [
  ['zentrifuge', 'butterei', 'keksbaeckerei'],
  ['saftpresse', 'essigbrauerei'],
  ['pizzeria'],
  ['griessmuehle', 'nudelfabrik', 'trattoria'],
  ['tortenmeister'],
  ['gelateria'],
  ['sennhuette'],
];

const TOOLS = {
  getreide: { name: 'Getreide-Ernte', icon: '🌾', levels: [
    { name: 'Hände', speed: 1, price: 0, info: 'Halme mit der Hand abreissen – ganz schön mühsam!' },
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
    { name: 'Melkmaschine', speed: 5, price: 250, info: 'Melkbecher kommen auf die Zitzen. Eine Pumpe saugt im Takt (Pulsieren) – fast wie ein trinkendes Kalb. Die Milch fliesst durch Schläuche in einen Kühltank mit 4 °C.' },
    { name: 'Melkroboter', speed: 20, price: 1100, auto: true, info: 'Die Kuh geht selbst hinein, wann sie will! Ein Roboterarm mit Laser-Kamera findet die Zitzen, putzt sie und setzt die Becher an. MELKT AUTOMATISCH!' },
  ]},
  tragen: { name: 'Transport', icon: '🎒', levels: [
    { name: 'Hände', cap: 12, price: 0, info: 'Viel passt nicht in zwei Hände.' },
    { name: 'Korb', cap: 24, price: 15, info: 'Ein geflochtener Korb aus Weidenruten – leicht und stabil.' },
    { name: 'Schubkarre', cap: 50, price: 60, info: 'Ein Hebel auf Rädern! Die Last liegt nah am Rad, darum musst du nur einen Teil des Gewichts heben.' },
    { name: 'Leiterwagen', cap: 100, price: 200, info: 'Vier Räder tragen das ganze Gewicht – du musst nur noch ziehen.' },
    { name: 'Traktor mit Anhänger', cap: 240, price: 800, info: 'Ein Dieselmotor: Kraftstoff verbrennt im Zylinder und drückt einen Kolben. Die Kurbelwelle macht daraus eine Drehung, die über das Getriebe die riesigen Räder antreibt.' },
    { name: 'Grosser Traktor mit Kipper', cap: 500, price: 3000, info: 'Ein Kipper hat unter der Ladefläche einen Hydraulikzylinder. Er drückt die Mulde schräg nach oben – und die ganze Ladung rutscht auf einmal hinaus.' },
    { name: 'Riesentraktor mit Allrad', cap: 1000, price: 10000, info: 'Allradantrieb: Der Motor treibt alle vier Räder an, nicht nur die hinteren. So rutscht der schwere Traktor auch im Schlamm nicht. Mit GPS lenkt er sogar fast von selbst geradeaus.' },
  ]},
  reben: { name: 'Trauben-Ernte', icon: '🍇', land: 10, levels: [
    { name: 'Hände', speed: 1, price: 0, info: 'Trauben mit der Hand abreissen – dabei platzen viele Beeren.' },
    { name: 'Rebschere', speed: 2, price: 300, info: 'Eine kleine, scharfe Schere schneidet den Stiel sauber ab – die Traube bleibt ganz.' },
    { name: 'Traubenbutte', speed: 4, price: 900, info: 'Eine Butte ist ein grosser Korb, den man wie einen Rucksack trägt. Die Pflücker leeren ihre Eimer hinein – so muss niemand ständig hin und her laufen.' },
    { name: 'Traubenvollernter', speed: 20, price: 4000, auto: true, info: 'Eine hohe Maschine fährt über die Rebreihe wie ein Tor. Biegsame Stäbe rütteln die Reben, die Beeren fallen auf Förderbänder. ERNTET AUTOMATISCH!' },
  ]},
  fischen: { name: 'Fischfang', icon: '🎣', land: 20, levels: [
    { name: 'Hände', speed: 1, price: 0, info: 'Fische mit blossen Händen fangen? Die sind glitschig und schnell!' },
    { name: 'Angel', speed: 2, price: 500, info: 'Am Ende der Schnur hängt ein Haken mit einem Köder. Beisst ein Fisch an, taucht der Schwimmer unter – jetzt schnell die Rute hochziehen!' },
    { name: 'Netz', speed: 5, price: 1500, info: 'Ein Netz hat Maschen in einer bestimmten Grösse: Grosse Fische bleiben hängen, kleine schwimmen durch und können weiterwachsen.' },
    { name: 'Fischpumpe', speed: 20, price: 8000, auto: true, info: 'Eine Pumpe saugt die Fische mit viel Wasser sanft durch ein dickes Rohr in einen Sortierer. FÄNGT AUTOMATISCH!' },
  ]},
  stall: { name: 'Stallarbeit', icon: '🧺', land: 30, levels: [
    { name: 'Hände', speed: 1, price: 0, info: 'Eier einzeln aus dem Nest holen und Futter mit der Schaufel verteilen – das braucht Zeit.' },
    { name: 'Eierkorb', speed: 2, price: 800, info: 'Ein Drahtkorb mit Polster: Da passen viele Eier hinein, ohne dass sie zerbrechen.' },
    { name: 'Futterautomat', speed: 5, price: 3000, info: 'Ein Silo füllt das Futter von selbst in lange Rinnen nach. Die Tiere haben immer genug, und du sparst viele Wege.' },
    { name: 'Stallroboter', speed: 20, price: 12000, auto: true, info: 'Förderbänder rollen die Eier aus den Nestern zur Sammelstelle, ein Roboter fährt durch den Stall und verteilt Futter und Stroh. ARBEITET AUTOMATISCH!' },
  ]},
  terminal: { name: 'Container-Umschlag', icon: '🏗️', land: 35, levels: [
    { name: 'Hände', speed: 1, price: 0, info: 'Die schweren Jutesäcke einzeln aus dem Container schleppen – puh!' },
    { name: 'Sackkarre', speed: 2, price: 2000, info: 'Zwei Räder und ein Griff: Man kippt den Sack nach hinten, dann rollt er fast von selbst.' },
    { name: 'Gabelstapler', speed: 5, price: 7000, info: 'Zwei Gabeln fahren unter die Palette und heben sie mit Hydraulik hoch. Hinten hat der Stapler ein schweres Gegengewicht, damit er nicht nach vorne kippt.' },
    { name: 'Containerkran', speed: 20, price: 25000, auto: true, info: 'Ein riesiger Portalkran hebt ganze Container vom Zug oder Schiff – 30 Tonnen auf einmal. Ein Computer weiss genau, wo jeder Container steht. ARBEITET AUTOMATISCH!' },
  ]},
  imker: { name: 'Imkerei', icon: '🐝', land: 40, levels: [
    { name: 'Hände', speed: 1, price: 0, info: 'Waben mit blossen Händen herausholen? Die Bienen finden das gar nicht lustig – autsch!' },
    { name: 'Imkerschleier', speed: 2, price: 2500, info: 'Ein Hut mit feinem Netz vor dem Gesicht und dicke Handschuhe: So kommen die Bienen nicht an die Haut, und du kannst in Ruhe arbeiten.' },
    { name: 'Smoker', speed: 5, price: 8000, info: 'Ein kleiner Blasebalg pustet kühlen Rauch in den Kasten. Die Bienen denken, es brennt, und futtern schnell Honig als Vorrat – mit vollem Bauch stechen sie kaum.' },
    { name: 'Honigschleuder-Anlage', speed: 20, price: 28000, auto: true, info: 'Eine Maschine schneidet die Wachsdeckel von den Waben, dann dreht die Schleuder sie ganz schnell: Die Fliehkraft drückt den Honig heraus, die Waben bleiben ganz und kommen zurück zu den Bienen. ARBEITET AUTOMATISCH!' },
  ]},
  kartoffel: { name: 'Kartoffel-Ernte', icon: '🥔', land: 45, levels: [
    { name: 'Hände', speed: 1, price: 0, info: 'Mit den Händen in der Erde wühlen – du findest Kartoffeln, aber auch viele Würmer!' },
    { name: 'Grabgabel', speed: 2, price: 3000, info: 'Eine Gabel mit breiten Zinken hebt die ganze Pflanze aus dem Boden. Mit einer Schaufel würdest du viele Kartoffeln zerschneiden.' },
    { name: 'Kartoffelroder', speed: 5, price: 9500, info: 'Der Traktor zieht ein Schar unter den Damm. Ein rüttelndes Siebband schüttelt die Erde ab, die Kartoffeln bleiben oben liegen und man sammelt sie auf.' },
    { name: 'Kartoffel-Vollernter', speed: 20, price: 32000, auto: true, info: 'Hebt die Kartoffeln aus dem Boden, siebt Erde und Steine heraus und füllt sie direkt in einen grossen Bunker. Auf dem Band sortieren Leute noch Steine aus. ERNTET AUTOMATISCH!' },
  ]},
  kastanien: { name: 'Kastanien-Ernte', icon: '🌰', land: 50, levels: [
    { name: 'Hände', speed: 1, price: 0, info: 'Die Igel sind voller Stacheln – mit blossen Händen tut das weh!' },
    { name: 'Kastanienzange', speed: 2, price: 3500, info: 'Eine lange Holzzange: Damit packst du den stacheligen Igel und drückst ihn mit dem Schuh auf, ohne dich zu stechen.' },
    { name: 'Auffangnetze', speed: 5, price: 11000, info: 'Unter den Bäumen spannt man grosse Netze. Die Kastanien fallen hinein und rollen in eine Ecke – man muss sie nicht mehr im Laub suchen.' },
    { name: 'Kastanien-Sauger', speed: 20, price: 36000, auto: true, info: 'Eine Maschine wie ein riesiger Staubsauger saugt Kastanien und Igel vom Boden. Innen trennen Walzen die Früchte von Stacheln und Laub. ERNTET AUTOMATISCH!' },
  ]},
  geiss: { name: 'Geissen-Melken', icon: '🐐', land: 55, levels: [
    { name: 'Hände', speed: 1, price: 0, info: 'Die Geiss hält nicht still und meckert – und manchmal frisst sie dir den Hut vom Kopf!' },
    { name: 'Melkstand', speed: 2, price: 4000, info: 'Die Geiss steigt auf ein kleines Podest und frisst dort Futter, während du sie melkst. So stehst du bequem und sie hält still.' },
    { name: 'Melkmaschine', speed: 5, price: 13000, info: 'Kleine Melkbecher mit zwei Zitzen-Bechern (eine Geiss hat nur zwei!). Eine Pumpe saugt im Takt die Milch in einen Kühltank.' },
    { name: 'Melkkarussell', speed: 20, price: 40000, auto: true, info: 'Die Geissen stehen auf einer grossen Drehscheibe, die sich langsam dreht. Bei jeder Runde wird eine Geiss angesetzt und gemolken – viele auf einmal. MELKT AUTOMATISCH!' },
  ]},
  rueben: { name: 'Rüben-Ernte', icon: '🍠', land: 60, levels: [
    { name: 'Hände', speed: 1, price: 0, info: 'Die Rübe steckt tief im Boden – ziehen, ziehen, ziehen … plumps!' },
    { name: 'Rübengabel', speed: 2, price: 4500, info: 'Eine Gabel mit zwei dicken, stumpfen Zinken lockert die Erde, ohne die Rübe zu verletzen.' },
    { name: 'Rübenroder', speed: 5, price: 14000, info: 'Zuerst köpft ein Messer die Blätter ab, dann heben Scharen die Rüben aus der Erde und Siebsterne schleudern die Erde weg.' },
    { name: 'Rüben-Vollernter', speed: 20, price: 44000, auto: true, info: 'Ein riesiger Selbstfahrer mit sechs Reihen auf einmal: köpfen, roden, putzen und in einen Bunker für 30 Tonnen. ERNTET AUTOMATISCH!' },
  ]},
  kirschen: { name: 'Chriesi-Ernte', icon: '🍒', land: 65, levels: [
    { name: 'Hände', speed: 1, price: 0, info: 'Nur die untersten Chriesi erreichst du – und die Hälfte landet im Mund!' },
    { name: 'Chriesi-Chratte', speed: 2, price: 5000, info: 'Ein Korb mit einem Haken: Du hängst ihn an einen Ast und hast beide Hände frei zum Pflücken.' },
    { name: 'Chriesi-Leiter', speed: 5, price: 15000, info: 'Eine lange, oben schmale Holzleiter. Sie passt zwischen die Äste, und oben stehst du mitten in den Kirschen.' },
    { name: 'Kirschen-Rüttler', speed: 20, price: 48000, auto: true, info: 'Ein Rüttler packt den Stamm, ein umgedrehter Schirm fängt die Kirschen auf. Nach ein paar Sekunden ist der Baum leer. ERNTET AUTOMATISCH!' },
  ]},
  // Angestellter Transportunternehmer: holt alle <every> s bis zu <cap> Überschuss-Waren (kein Abnehmer hat Platz) und verkauft sie
  spedition: { name: 'Spediteur', icon: '🚚', levels: [
    { name: 'Kein Spediteur', cap: 0, price: 0, info: 'Noch trägst du alle fertigen Waren selbst zum Händler.' },
    { name: 'Bote mit Lastenrad', cap: 8, every: 30, price: 2500, info: 'Du stellst einen Boten an: Er holt fertige Waren aus deinen Gebäuden und verkauft sie für dich beim Händler. Ein Lastenrad hat vorne eine grosse Kiste – ohne Benzin, nur mit Muskelkraft. Angestellte bekommen Lohn, darum ist das teuer!' },
    { name: 'Lieferwagen', cap: 25, every: 25, price: 6000, info: 'Ein Lieferwagen hat hinten einen grossen Laderaum ohne Fenster. Mit Kühl-Lieferwagen bleiben Joghurt, Käse und Torten auch im Sommer frisch – innen sind es nur 4 °C.' },
    { name: 'Lastwagen', cap: 60, every: 20, price: 15000, info: 'Ein Lastwagen (LKW) darf bis zu 40 Tonnen wiegen – so viel wie 30 Autos! Der Fahrer braucht einen eigenen Führerschein und muss nach 4½ Stunden Fahrt eine Pause machen.' },
  ]},
};

// ===== Schweiz: Alpen-Panorama im Norden, See, Deko =====
const ALPS = 7;                                         // Kacheln Berge oberhalb der Welt (nur Kulisse)
const LAKE = { x: 9, y: 28, rx: 6, ry: 3.4 };        // See (Kacheln), man kann nicht hineinlaufen
const CHF = '<span class="chflag"></span>';             // Schweizer Fahne als HTML (Emoji 🇨🇭 fehlt unter Windows)

// Landschafts-Deko: hat keine Funktion – ist einfach schön und lustig.
// where: 'land' = du stellst sie selbst hin, 'see' = schwimmt auf dem See, 'luft' = fliegt, 'berg' = in den Alpen
const DECOS = {
  steinmann:  { name: 'Steinmann', icon: '🪨', price: 10, where: 'land',
    info: 'Ein Steinmann ist ein kleiner Turm aus aufeinandergelegten Steinen. In den Bergen zeigen Steinmänner den Wanderern den Weg – vor allem, wenn Nebel kommt. Wer vorbeigeht, legt oft noch einen Stein dazu.' },
  gartenzwerg: { name: 'Gartenzwerg', icon: '🧙', price: 15, where: 'land',
    info: 'Gartenzwerge passen auf den Garten auf – sagt man. Die ersten wurden vor fast 200 Jahren aus Ton gebrannt. Dieser hier hat heute frei und macht nichts. Gar nichts. 😄' },
  tanne:      { name: 'Tanne', icon: '🌲', price: 20, where: 'land',
    info: 'Ein Drittel der Schweiz ist Wald! In den Bergen wachsen vor allem Fichten und Tannen. Ihre Nadeln bleiben auch im Winter grün. Der Bergwald ist wichtig: Er schützt die Dörfer vor Lawinen und Steinschlag.' },
  wegweiser:  { name: 'Wanderweg-Schild', icon: '🪧', price: 20, where: 'land',
    info: 'Die gelben Wanderweg-Schilder kennt in der Schweiz jedes Kind! Sie zeigen, wie viele Stunden und Minuten man bis zum nächsten Ziel läuft. Die Schweiz hat über 65 000 km Wanderwege – damit käme man anderthalb Mal um die ganze Erde.' },
  edelweiss:  { name: 'Edelweiss-Beet', icon: '🤍', price: 25, where: 'land',
    info: 'Das Edelweiss wächst hoch oben in den Alpen zwischen Felsen. Seine Blüten sind mit feinen weissen Härchen bedeckt – wie ein Wollpulli. Die schützen vor Kälte und der starken Sonne in den Bergen. In der Natur darf man es nicht pflücken!' },
  schneemann: { name: 'Schneemann', icon: '⛄', price: 30, where: 'land',
    info: 'Dieser Schneemann kommt direkt vom Gletscher und schmilzt nie – nicht mal im Sommer! In echt wäre das schwierig: Schnee schmilzt schon bei 0 °C.' },
  fahne:      { name: 'Schweizer Fahne', icon: CHF, price: 40, where: 'land',
    info: 'Die Schweizer Fahne ist eine von nur zwei quadratischen Landesfahnen der Welt (die andere ist die vom Vatikan). Weisses Kreuz auf rotem Grund. Am 1. August, dem Nationalfeiertag, hängen überall Fahnen und es gibt Feuerwerk und Lampions.' },
  murmeltier: { name: 'Murmeltier', icon: '🐿️', price: 60, where: 'land',
    info: 'Murmeltiere leben in Erdhöhlen auf den Alpwiesen. Sieht eines einen Adler, pfeift es ganz laut – dann verschwinden alle blitzschnell im Bau. Im Winter schlafen sie fast 6 Monate lang und atmen dabei nur 2- bis 3-mal pro Minute.' },
  alphorn:    { name: 'Alphornbläser', icon: '🎺', price: 120, where: 'land',
    info: 'Das Alphorn ist bis zu 4 Meter lang und aus einem einzigen Fichtenstamm gemacht – ohne Löcher und ohne Tasten! Die Töne macht der Bläser nur mit den Lippen. Früher riefen die Hirten damit über die Berge zu den Kühen und zu anderen Alpen.' },
  bernhardiner: { name: 'Bernhardiner', icon: '🐕', price: 150, where: 'land',
    info: 'Bernhardiner kommen vom Grossen St. Bernhard, einem Pass in den Alpen. Die Mönche dort züchteten die starken Hunde, um Menschen im Schnee zu finden. Der berühmteste hiess Barry und rettete über 40 Menschen. Das Fässchen am Hals ist eher eine schöne Geschichte.' },
  fondue_tisch: { name: 'Fondue-Tisch', icon: '🍲', price: 180, where: 'land',
    info: 'Ein Tisch mit Bänken und einem dampfenden Fondue-Caquelon. Niemand isst – es duftet nur herrlich. Wer sein Brot im Käse verliert, muss singen!' },
  brunnen:    { name: 'Dorfbrunnen', icon: '⛲', price: 200, where: 'land',
    info: 'In Schweizer Dörfern plätschert fast überall ein Brunnen – oft mit Blumen geschmückt. Allein in der Stadt Basel gibt es über 170 Brunnen, und aus fast allen kann man Trinkwasser trinken!' },
  chalet:     { name: 'Chalet', icon: '🏡', price: 400, where: 'land',
    info: 'Ein Chalet ist ein Holzhaus aus den Bergen. Das breite Dach hält viel Schnee aus und schützt die Wände vor Regen. Auf den Balkonen blühen rote Geranien. Das Holz wird mit den Jahren von der Sonne fast schwarz.' },
  uhrturm:    { name: 'Uhrturm', icon: '🕰️', price: 500, where: 'land',
    info: 'Die Schweiz ist berühmt für ihre Uhren! Schon vor 400 Jahren bauten Uhrmacher in Genf und im Jura winzige Zahnräder von Hand. Dieser Turm zeigt die echte Uhrzeit – schau mal genau hin!' },
  schwan:     { name: 'Schwan', icon: '🦢', price: 80, where: 'see',
    info: 'Schwäne paddeln mit ihren grossen Schwimmfüssen. Sie bleiben ihr ganzes Leben mit demselben Partner zusammen. Ein Schwan wiegt bis zu 12 kg – er braucht einen langen Anlauf übers Wasser, um loszufliegen.' },
  segelboot:  { name: 'Segelboot', icon: '⛵', price: 250, where: 'see',
    info: 'Ein Segelboot fährt nur mit Wind! Das Segel ist gebogen wie ein Flugzeugflügel. Darum kann ein Boot sogar schräg gegen den Wind fahren – im Zickzack, das heisst „kreuzen“.' },
  dampfschiff: { name: 'Raddampfer', icon: '🛳️', price: 800, where: 'see',
    info: 'Auf Schweizer Seen fahren noch echte Raddampfer, manche über 100 Jahre alt! Eine Dampfmaschine dreht die zwei grossen Schaufelräder an der Seite. Durch die Fenster im Bauch des Schiffs sieht man die Maschine arbeiten.' },
  ballon:     { name: 'Heissluftballon', icon: '🎈', price: 600, where: 'luft', max: 6,
    info: 'Ein Brenner macht die Luft im Ballon heiss. Heisse Luft ist leichter als kalte – darum steigt der Ballon! Lenken kann man ihn nicht, er fliegt mit dem Wind. In Château-d’Oex treffen sich jeden Winter Ballone aus der ganzen Welt.' },
  gondelbahn: { name: 'Gondelbahn', icon: '🚡', price: 1500, where: 'berg', max: 1,
    info: 'Eine Gondelbahn hängt an einem dicken Stahlseil. Ein starker Motor in der Station zieht das Seil – die Gondeln fahren über Täler und Felsen bis auf den Berg. Die Schweiz hat über 2000 Seilbahnen!' },
};

const LAND_PRICES = [120, 300, 700, 1500, 3000];

// Bereiche = Bänder (Kacheln). Westlich der Hauptstrasse (x = ROAD_X) liegt der Hof mit Laden, Händler und See.
// Jedes Band füllt sich spaltenweise (rows Plätze untereinander) und wächst mit jedem Land nach Osten.
// Bereiche mit from kommen erst ab dieser Land-Stufe dazu – als neues Band im Süden. base + per*Landstufe = freie Plätze.
// cols = Band füllt zeilenweise (cols Plätze nebeneinander) und wächst nach Süden statt nach Osten.
// lane = Weg-Zeile(n) des Bandes (vom Hauptweg bis ans Bandende). hill = Hügel-Landschaft darunter.
const ROAD_X = 18;
const AREAS = {
  obst:  { name: 'Obstgarten', x: 20.4, y: 4.8,  rows: 3, dx: 1.6, dy: 2.1, base: 4, per: 3, lane: [10.2] },
  acker: { name: 'Acker',      x: 21.6, y: 36.6, rows: 5, dx: 5.3, dy: 3.3, base: 2, per: 2, lane: [52.1] },
  weide: { name: 'Weide',      x: 20.6, y: 29.5, rows: 3, dx: 2.2, dy: 2,   base: 2, per: 3 },
  dorf:  { name: 'Dorf',       x: 20.6, y: 15.2, rows: 3, dx: 3.3, dy: 5.1, base: 2, per: 2, lane: [16.1, 21.2, 26.3] },
  weinberg:  { name: 'Weinberg',    x: 20.4, y: 54.4, rows: 4, dx: 3.2, dy: 1.6, base: 3, per: 2, from: 10, lane: [52.1], hill: [53, 60] },
  fischerei: { name: 'Fischteiche', x: 4, y: 34.4, cols: 4, dx: 3.5, dy: 1.7, base: 2, per: 2, from: 20 }, // südlich vom See, wächst nach Süden
  tierhof:   { name: 'Tierhof',     x: 20.6, y: 62.6, rows: 2, dx: 3.4, dy: 1.8, base: 3, per: 2, from: 30, lane: [60.3] },
  terminal:  { name: 'Import-Terminal', x: 20.7, y: 67.7, rows: 2, dx: 3.6, dy: 1.5, base: 2, per: 2, from: 35, lane: [65.5] },
  imkerei:   { name: 'Imkerei',         x: 20.6, y: 72.8, rows: 2, dx: 3.4, dy: 1.6, base: 2, per: 2, from: 40, lane: [70.6] },
  kartoffelacker: { name: 'Kartoffelacker', x: 21, y: 77.9, rows: 2, dx: 3.6, dy: 1.3, base: 2, per: 2, from: 45, lane: [75.8] },
  selve:     { name: 'Kastanienhain',   x: 20.8, y: 83.6, rows: 2, dx: 2.6, dy: 2.5, base: 2, per: 2, from: 50, lane: [80.8] },
  geissenalp:  { name: 'Geissen-Alp',     x: 20.6, y: 90.6, rows: 2, dx: 3.4, dy: 1.7, base: 2, per: 2, from: 55, lane: [88.4] },
  ruebenacker: { name: 'Zuckerrüben-Acker', x: 21, y: 96.6, rows: 2, dx: 3.6, dy: 1.3, base: 2, per: 2, from: 60, lane: [94.5] },
  chriesigarten: { name: 'Chriesi-Garten', x: 20.8, y: 102.9, rows: 2, dx: 2.6, dy: 2.5, base: 2, per: 2, from: 65, lane: [100.1] },
};
// Bauernhof wird ausgebaut: ab diesen Land-Stufen kommt je ein Stück dazu
const HOF_LV = [2, 5, 10, 15, 20];
const SHOP_LV = [30, 40, 50, 60]; // danach wachsen Laden und Händler weiter in die Höhe
const HOF_ADD = ['einen Dorfbrunnen und eine Holzbeige', 'einen Kornspeicher', 'einen zweiten Stock mit Geranien-Balkon', 'ein Glockentürmchen auf dem Stall', 'eine eigene Kapelle'];
const PASTURE = { x: 19.2, y: 27.5, w: 10, h: 6.6 }; // Zaun (Kacheln), w wächst mit der Weide (fitWorld)

// Feste Orte (Kacheln, x/y = Mitte unten)
const FIXED = [
  { type: 'hof', name: 'Bauernhof', x: 9.5, y: 8.6, info: 'Dein Zuhause. Hier hat alles angefangen – mit einem Feld und zwei Apfelbäumen.' },
  { type: 'haendler', name: 'Händler', x: 12.5, y: 18.3, info: 'Beim Händler verkaufst du deine Waren. Er gibt dir dafür Geldscheine. Verarbeitete Waren (Mehl, Brot, Käse …) bringen viel mehr Geld als Rohstoffe – weil darin mehr Arbeit steckt!' },
  { type: 'laden', name: 'Laden', x: 5, y: 18.3, info: 'Im Laden kaufst du Tiere, Bäume, Felder, Werkzeuge, Gebäude und neues Land. Bring dein Geld hierher!' },
];

// Avatar-Baukasten (Startbildschirm → 🎨). Gespeichert werden nur die Nummern der Auswahl, Nummer 0 = Standard.
// Farben werden als Farbfeld gezeigt, Wörter als Knopf (übersetzt über lang/*.js → ui); 'auto' = T-Shirt wechselt mit dem Alter.
const LOOK = {
  skin:     ['Hautfarbe',     ['#f2c9a2', '#f8dcc2', '#e3ae84', '#c98e5e', '#9a6440', '#6e4429', '#4a2c1a']],
  face:     ['Gesichtsform',  ['Rund', 'Oval', 'Breit']],
  hair:     ['Haarfarbe',     ['#f2cf5b', '#e0a84a', '#b5652a', '#7a4520', '#3a2618', '#151515', '#d8432a', '#ececec', '#e870b0', '#4a7ae0']],
  style:    ['Frisur',        ['Kurz', 'Lang', 'Locken', 'Zopf', 'Igel', 'Glatze']],
  eyes:     ['Augenfarbe',    ['#2a4a7a', '#3f8fcf', '#4a7a3a', '#6b4423', '#2a2a2a']],
  freckles: ['Sommersprossen', ['Nein', 'Ja']],
  glasses:  ['Brille',        ['Keine', 'Brille', 'Sonnenbrille']],
  hat:      ['Kopfbedeckung', ['Keine', 'Sennenkäppi', 'Strohhut', 'Zipfelmütze', 'Velohelm']],
  shirt:    ['T-Shirt',       ['auto', '#e8483b', '#f29a2e', '#f2cf3b', '#2f8f4e', '#3a6fd8', '#6b4fa3', '#e870b0', '#f2f2f2', '#2a2a2a']],
  pants:    ['Hose',          ['#28406a', '#4a6aa8', '#3d3d3d', '#6b4a2b', '#2f6a3a', '#a83a3a']],
  shoes:    ['Schuhe',        ['#4a2f1e', '#1a1a1a', '#d23b2b', '#3a6fd8', '#f2f2f2']],
};

// Wachstum des Spielers: ab welchem Welt-Punktestand wie viele Jahre älter
const STAGES = [
  { score: 0, add: 0 }, { score: 8, add: 2 }, { score: 18, add: 5 }, { score: 32, add: 9 }, { score: 50, add: 16 },
];

// Wege im Hof-Bereich (Kacheln); die Band-Wege kommen aus AREAS.lane
const PATHS = [
  [[10.5, 9.2], [10.5, 10.2], [ROAD_X, 10.2]],   // Hof → Hauptstrasse
  [[4, 19.2], [ROAD_X, 19.2]],               // vor Laden und Händler
];
