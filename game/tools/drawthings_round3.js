// Draw Things script, round 3: the occupations and action spaces still open after the second pick.
//
// Same use as drawthings_minors.js (model FLUX.2 [klein] 9B, Text to Image, paste → Run).
// Files land in Pictures as agricola_occ_<name>_a21.png ... and agricola_action_<name>_a1.png ...;
// then  python3 game/tools/build_picker.py  and pick in game/tools/picker.html.
//
// What the second pick (27/9 13:09) said:
//   Occupations  Rejected, mostly first-round pictures in the older, dirtier style: Adoptive Parents,
//                Greengrocer, Harpooner, Rough Caster, Seasonal Worker, Stonecutter, Storehouse
//                Keeper, Wall Builder (clothes cleaner, faces relaxed); Conjurer (the costume can be
//                showy); Pastor (no pastor feel); Sheep Whisperer (no whisperer feel); House Steward
//                (undecided: no steward feel). Frame Builder (fingers wrong) and Small-Scale Farmer
//                were kept for now and get another go.
//   Actions      Rejected: Grain Utilization, Major Improvement, Pig Market (the boar's colour is
//                wrong), Urgent Family Growth. The other 20 were kept and cropped to their middle,
//                so these four are drawn in the same watercolour with the subject in the middle.

// First run (13:14) stopped when Draw Things quit, after 19 images: Adoptive Parents, Conjurer,
// Greengrocer, Harpooner, House Steward and Pastor done, Rough Caster attempt 1 done. ONLY and
// FROM_ATTEMPT below pick up from there; the files already made are not painted again.
// Since then it runs through the API server with drawthings_api.py, which skips existing files.

// ------------------------------------------------------------------ settings
const GROUPS = ['occ', 'action'];
const ONLY = [];                       // English names; empty = everything in GROUPS
// Only for the app's Scripts panel, which cannot see the folder: attempts to start from, by card.
// drawthings_api.py skips files that already exist, so leave this empty there.
const FROM_ATTEMPT = {};
const ATTEMPTS = 3;                    // pictures per card; attempt a uses seed + (a - 1) * 1000
const SEED_OVERRIDE = { 'Conjurer': 20261103 };   // new seeds for the new Conjurer prompt
const BASE_SEED = 20261003;

const SIZE = { occ: [768, 1088], action: [1152, 768] };
// Numbers go on from the earlier rounds, so every attempt keeps its own file in the picker.
const FIRST = { occ: 21, action: 1 };
// Conjurer's retry is numbered on from its round-3 attempts.
const FIRST_BY_CARD = { 'Conjurer': 24 };

const STYLE = {
  // The round-2 style, which gave the pictures that won.
  occ: 'Full-art trading card game illustration, Japanese anime style: clean line art and gentle cel ' +
    'shading, a muted, earthy, natural colour palette of browns, ochres, olive greens and faded blues, ' +
    'soft natural daylight, no glow, no sparkles, no glossy shine. Shallow depth of field so the ' +
    'background is softly blurred. The character is big and close to the camera, seen whole from the ' +
    'head to the feet, in a simple, natural, believable pose with well-drawn hands with five fingers ' +
    'each, and a relaxed, friendly, confident expression, never straining or grimacing; the face and ' +
    'hands are in the upper half. 18th century European country folk; unless said otherwise below, ' +
    'in simple, clean, well-kept clothes of linen and wool in plain earthy colours, neat and tidy, not ' +
    'dirty or ragged. The background is rustic countryside: fields, barns, thatched cottages, a ' +
    'village lane, the place of their work. ',
  // The kept action tiles: watercolour, cropped to the middle, so the subject goes there.
  action: 'Japan anime style, hand drawing in the manner of Hayao Miyazaki, soft watercolour colours ' +
    'with fine ink lines, an 18th century western European farming village, warm afternoon light, ' +
    'cosy and detailed. A medium shot: the main subject is large and sits in the middle of the ' +
    'picture, with a little space around it. ',
};
const ENDING = ' Everything belongs to the 1700s: no cars, no aerials, no electric lights, no power ' +
  'lines, no factory chimneys, no church towers, no hoodies, zips or modern clothes and tools. ' +
  'No text, no letters, no writing on boards, signs or paper, no signature, no border, no frame.';

// ------------------------------------------------------------------ occupations (14)
// [English name, who, what they are doing]
const OCC = [
  ['Adoptive Parents', 'a warm middle-aged couple, a man and a woman, with a small adopted boy',
    'walking hand in hand along a field path, the boy between them smiling up at his new parents and ' +
    'carrying a tiny rake, all three calm and happy'],
  // Round 3b (13:24 pick): the costume can be grander, and a conjurer pulls a rabbit or doves
  // out of a hat, not straw.
  ['Conjurer', 'a charming young woman',
    'a travelling stage conjurer, the one splendid figure among plain country folk: a grand tailcoat ' +
    'of deep crimson velvet with gold embroidery and gold buttons, a jewelled brooch, a flowing black ' +
    'cape lined with red silk, white lace cuffs and a tall black top hat with a feather; smiling as she ' +
    'lifts a white rabbit out of the top hat with one hand while two white doves fly up from it, a ' +
    'magic wand in her other hand, villagers watching in wonder on the green'],
  ['Greengrocer', 'a cheerful young woman',
    'at her vegetable stall in a village market, holding up a fine cabbage to a customer with a smile, ' +
    'baskets of carrots, turnips, beans and cabbages around her'],
  ['Harpooner', 'a strong middle-aged man with a grey-streaked beard',
    'standing steady in a small wooden boat on a calm lake, holding a long wooden harpoon ready at his ' +
    'shoulder, a bundle of reeds and a fish basket in the boat, calm and focused'],
  ['House Steward', 'a dignified old man with neat grey hair',
    'the steward of a big farmhouse: a smart dark coat, a buttoned waistcoat, a white cravat and a big ' +
    'ring of keys at his belt; standing upright in the front hall with a ledger under his arm, pointing ' +
    'a servant to carry firewood inside, polite and in command'],
  ['Pastor', 'a kind middle-aged man',
    'a country pastor in a long black coat with white preaching bands at his collar and a black ' +
    'broad-brimmed hat, a small closed book in his hand, greeting a young family at the door of their ' +
    'tiny two-room cottage with a warm smile, gifts of wood, clay, reed and stone by the door'],
  ['Rough Caster', 'a spry old man with a white stubble',
    'spreading lime plaster smoothly onto a clay cottage wall with a trowel, a plasterer\'s board in ' +
    'his other hand, content with his work'],
  ['Seasonal Worker', 'a cheerful teenage boy',
    'walking home along a field path at harvest time with a small sack of grain over one shoulder and ' +
    'a basket of carrots and cabbages on his arm, whistling'],
  ['Sheep Whisperer', 'a girl of about ten',
    'kneeling in a meadow whispering into the ear of a sheep, one hand gently on its neck, the whole ' +
    'flock quietly gathered round her and listening, a lamb resting its head on her knee'],
  ['Stonecutter', 'a sturdy middle-aged man',
    'at a quarry face, tapping a chisel into a stone block with a mallet, calm and precise, neat cut ' +
    'blocks stacked behind him'],
  ['Storehouse Keeper', 'a young man',
    'in a well-ordered barn full of grain sacks and stacks of clay bricks, checking the goods with a ' +
    'tally stick in one hand, a ring of keys at his belt, friendly and organised'],
  ['Wall Builder', 'a young man',
    'setting a stone block into place on a half-built wall with both hands, a trowel resting on the ' +
    'wall, a new room of the house rising behind him, pleased with his work'],
  ['Frame Builder', 'a young man',
    'carrying an oak beam on his shoulder with one hand, the other hand holding a mallet, walking past ' +
    'the timber frame of a new house'],
  ['Small-Scale Farmer', 'a young woman',
    'at the gate of her tiny two-room cottage with a vegetable patch, a small bundle of firewood under ' +
    'one arm, waving with the other hand, smiling'],
];

// ------------------------------------------------------------------ action spaces (4)
const ACTION = [
  ['Grain Utilization', 'a farmer sowing grain by hand from a seed bag across a ploughed field, and ' +
    'beside him a woman taking round loaves out of an outdoor clay bread oven'],
  ['Major Improvement', 'a village craftsman proudly finishing a new brick bread oven with a fire ' +
    'glowing inside, a potter\'s wheel and woven baskets in his open workshop behind'],
  ['Pig Market', 'a village pig market: wooden pens holding true European wild boar, dark grey-brown ' +
    'to almost black with coarse bristly hair, a long snout, small tusks and a ridge of bristles along ' +
    'the back, and their piglets striped cream and brown; not pink farm pigs. Two farmers shake hands ' +
    'on a sale'],
  ['Urgent Family Growth', 'inside a small crowded one-room cottage: a young mother sits up in bed ' +
    'holding a newborn baby, the young father kneels beside her, two small children peek in, spare ' +
    'blankets laid on the floor because there is no more room'],
];

// ------------------------------------------------------------------ run
const slug = (en) => en.toLowerCase().replace(/[^a-z0-9]/g, '');
const outDir = filesystem.pictures.path;
const all = OCC.map((c, i) => ({ kind: 'occ', en: c[0], subject: c[1] + ', ' + c[2], i }))
  .concat(ACTION.map((c, i) => ({ kind: 'action', en: c[0], subject: c[1], i: 100 + i })));
const todo = all.filter((c) => GROUPS.includes(c.kind) && (!ONLY.length || ONLY.includes(c.en)));
const total = todo.reduce((n, c) => n + ATTEMPTS - (FROM_ATTEMPT[c.en] || 1) + 1, 0);
console.log('Saving to: ' + outDir + '   ' + todo.length + ' cards, ' + total + ' images');

todo.forEach((c, k) => {
  const seed0 = SEED_OVERRIDE[c.en] != null ? SEED_OVERRIDE[c.en] : BASE_SEED + c.i;
  const subject = c.subject.charAt(0).toUpperCase() + c.subject.slice(1) + '.';
  for (let a = FROM_ATTEMPT[c.en] || 1; a <= ATTEMPTS; a++) {
    const configuration = pipeline.configuration;
    configuration.width = SIZE[c.kind][0];
    configuration.height = SIZE[c.kind][1];
    configuration.seed = seed0 + (a - 1) * 1000;
    configuration.loras = [];
    configuration.strength = 1.0;
    canvas.clear();
    console.log(`(${k + 1}/${todo.length}) ${c.kind} ${c.en}  attempt ${a}/${ATTEMPTS}  seed ${configuration.seed}`);
    pipeline.run({ configuration, prompt: STYLE[c.kind] + subject + ENDING, negativePrompt: '' });
    canvas.saveImage(outDir + '/agricola_' + c.kind + '_' + slug(c.en) + '_a' + ((FIRST_BY_CARD[c.en] || FIRST[c.kind]) + a - 1) + '.png', true);
  }
});
console.log('Done: ' + total + ' images.');
