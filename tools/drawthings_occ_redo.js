// Draw Things script: repaint the occupations that failed the first pick in picker.html.
//
// Same use as drawthings_minors.js (model FLUX.2 [klein] 9B, Text to Image, paste → Run).
// Files land in Pictures as agricola_occ_<name>_a11.png, _a12, _a13; then run
//   python3 tools/build_picker.py   and pick in tools/picker.html as before.
//
// What the pick said (27/9), and what changed:
//   Everyone     clothes too dirty, faces straining, some poses odd or hands wrong. The style now
//                asks for clean, well-kept working clothes, relaxed friendly faces and simple
//                natural poses; the scenes stay rural and the palette stays muted.
//   Rejected     Animal Dealer (no merchant feel), Animal Tamer (no taming feel), Braggart (hands),
//                Childless (too much action), Conjurer.
//   Kept for now but worth another go, with a note: Lutenist, Organic Farmer (odd pose),
//                Paper Maker (odd action), Plow Driver. Their current pictures stay unless a new
//                one wins in the picker.

// ------------------------------------------------------------------ settings
const ONLY = [];                       // English names; empty = all below
const ATTEMPTS = 3;                    // pictures per card; attempt a uses seed + (a - 1) * 1000
const SEED_OVERRIDE = {};
const BASE_SEED = 20261001;
const WIDTH = 768, HEIGHT = 1088;      // the card's 5:7

const STYLE = 'Full-art trading card game illustration, Japanese anime style: clean line art and ' +
  'gentle cel shading, a muted, earthy, natural colour palette of browns, ochres, olive greens and ' +
  'faded blues, soft natural daylight, no glow, no sparkles, no glossy shine. Shallow depth of field ' +
  'so the background is softly blurred. The character is big and close to the camera, seen whole ' +
  'from the head to the feet, in a simple, natural, believable pose with well-drawn hands, and a ' +
  'relaxed, friendly, confident expression, never straining or grimacing; the face and hands are in ' +
  'the upper half. 18th century European country folk in simple, clean, well-kept clothes of linen ' +
  'and wool in plain earthy colours, neat and tidy, not dirty or ragged. The background is rustic ' +
  'countryside: fields, barns, thatched cottages, a village lane, the place of their work. ';
const ENDING = ' Everything belongs to the 1700s: no cars, no aerials, no electric lights, no power ' +
  'lines, no factory chimneys, no church towers, no hoodies, zips or modern clothes and tools, ' +
  'no religious symbols. No text, no letters, no writing on boards, signs or paper, no signature, ' +
  'no border, no frame.';

// ------------------------------------------------------------------ the cards
// [English name, who, what they are doing]
const CARDS = [
  ['Animal Dealer', 'a prosperous jolly old man with white whiskers',
    'a livestock trader in a good brown coat, waistcoat and tricorn hat at a busy village livestock ' +
    'market, shaking hands on a deal with a farmer, a coin purse at his belt; a cow, a sheep and a ' +
    'brown wild boar on ropes beside him'],
  ['Animal Tamer', 'a teenage girl',
    'standing calm and proud in a farmyard with one hand raised, while a sheep, a brown wild boar and ' +
    'a calf sit obediently in a neat row in front of her, looking up at her; a small treat in her ' +
    'other hand, a gentle smile'],
  ['Braggart', 'a plump middle-aged man in a fancy embroidered waistcoat',
    'standing proudly with both fists on his hips and his chest puffed out, chin up, grinning, in ' +
    'front of his fine farm with a brick bread oven, a workshop and a stone well'],
  ['Childless', 'a contented old couple, a man and a woman',
    'standing arm in arm in the doorway of their roomy three-room cottage, the woman holding a basket ' +
    'of bread and vegetables, both smiling calmly'],
  ['Conjurer', 'a cheerful young woman',
    'a travelling conjurer in a bright patched coat and a tall hat on the village green, smiling as ' +
    'she pulls a bundle of firewood and a sheaf of wheat out of a big hat with a flourish, a few ' +
    'villagers watching in wonder'],
  ['Lutenist', 'a young woman',
    'playing a lute and singing with one foot up on a barrel, hair moving, villagers dancing in the ' +
    'lane behind'],
  ['Organic Farmer', 'a cheerful middle-aged man',
    'walking easily through a wide green pasture with a few happy sheep and brown pigs grazing around ' +
    'him, one hand resting on a sheep\'s back, a lot of open grass around them'],
  ['Paper Maker', 'a middle-aged woman in an apron',
    'standing at a wooden vat in a timber workshop, holding a wooden paper mould level in both hands, ' +
    'lifting a fresh blank sheet out of the pulp and looking at it with satisfaction; blank sheets ' +
    'drying on lines behind'],
  ['Plow Driver', 'a young woman',
    'walking behind a wooden plough pulled by an ox, both hands on its two handles, the iron blade ' +
    'turning a furrow, calm and focused, a stone house in the distance'],
];

// ------------------------------------------------------------------ run
const slug = (en) => en.toLowerCase().replace(/[^a-z0-9]/g, '');
const outDir = filesystem.pictures.path;
const todo = CARDS.map((c, i) => ({ en: c[0], subject: c[1] + ', ' + c[2], i }))
  .filter((c) => !ONLY.length || ONLY.includes(c.en));
console.log('Saving to: ' + outDir + '   ' + todo.length + ' cards × ' + ATTEMPTS + ' = ' + todo.length * ATTEMPTS + ' images');

todo.forEach((c, k) => {
  const seed0 = SEED_OVERRIDE[c.en] != null ? SEED_OVERRIDE[c.en] : BASE_SEED + c.i;
  const subject = c.subject.charAt(0).toUpperCase() + c.subject.slice(1) + '.';
  for (let a = 1; a <= ATTEMPTS; a++) {
    const configuration = pipeline.configuration;
    configuration.width = WIDTH;
    configuration.height = HEIGHT;
    configuration.seed = seed0 + (a - 1) * 1000;
    configuration.loras = [];
    configuration.strength = 1.0;
    canvas.clear();
    console.log(`(${k + 1}/${todo.length}) ${c.en}  attempt ${a}/${ATTEMPTS}  seed ${configuration.seed}`);
    pipeline.run({ configuration, prompt: STYLE + subject + ENDING, negativePrompt: '' });
    // numbered a11, a12, a13 so they sit apart from the first round's a1 and a2 in the picker
    canvas.saveImage(outDir + '/agricola_occ_' + slug(c.en) + '_a' + (a + 10) + '.png', true);
  }
});
console.log('Done: ' + todo.length * ATTEMPTS + ' images.');
