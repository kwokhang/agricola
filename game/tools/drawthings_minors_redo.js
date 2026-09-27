// Draw Things script: repaint the 9 minor improvement pictures that failed review.
//
// Same use as drawthings_minors.js (model FLUX.2 [klein] 9B, Text to Image, paste → Run).
// The files overwrite the old names, so after moving them into resource/minorimprovement/
// run  python3 game/tools/build_card_images.py
//
// What was wrong with each, so a retry can be judged against it:
//   Brook               TV aerial on a roof
//   Mantelpiece         a glass vase standing in the fire
//   Junk Room           an empty glass vase as the centre of the picture
//   Large Greenhouse    a cross on the roof ridge, an electric lamp inside
//   Moldboard Plow      drawn as a modern disc harrow, horse not hitched to it
//   Clay Pipe           a modern brown briar pipe instead of a white clay pipe
//   Canoe               a plank rowing boat with seats, not a dugout
//   Young Animal Market a grown cow instead of a calf
//   Three-Field Rotation  a fake signature in the bottom right corner
//
// Second run (fixed: Brook, Mantelpiece, Junk Room, Large Greenhouse, Three-Field Rotation).
// Still wrong, so their prompts were rewritten and ONLY is set to them:
//   Canoe               still a plank boat with seats and oars
//   Clay Pipe           white now, but a short bent pipe and the smoke rises from the mouthpiece
//   Young Animal Market the "calf" has horns and an udder
//   Moldboard Plow      two blades, no handles, ploughing the village street
//
// Third run, 3 attempts each: Canoe a2 and Clay Pipe a2 kept (seeds in SEED_OVERRIDE).
//   Moldboard Plow      every attempt puts the blade behind the farmer, two have wheels, one an aerial
//   Young Animal Market every "calf" is a grown cow with an udder; asking for a bull calf instead
//
// Fourth run: Moldboard Plow a3 and Young Animal Market a1 kept. All 9 are now done, so ONLY is
// empty and ATTEMPTS is 1: a rerun repaints exactly the kept pictures from their seeds.
//
// Re-running only some: put their English names in ONLY. Still wrong: bump SEED_OVERRIDE.
// ATTEMPTS > 1 paints each card that many times with different seeds, saved as
// agricola_minor_<name>_a1.png, _a2.png ... Pick the best, rename it to agricola_minor_<name>.png
// before moving it into resource/, and note its seed (printed in the log) in SEED_OVERRIDE.

// ------------------------------------------------------------------ settings
const WIDTH = 1024, HEIGHT = 768;
const BASE_SEED = 20260927;            // a new base, so the first run already differs from the old pictures
const ONLY = [];
const SEED_OVERRIDE = {                // the kept pictures; the rest use BASE_SEED + index
  'Canoe': 20261933, 'Clay Pipe': 20261932, 'Moldboard Plow': 20262931, 'Young Animal Market': 20260934,
};
const ATTEMPTS = 1;                    // pictures per card; attempt a uses seed + (a - 1) * 1000
const FILE_PREFIX = 'agricola_minor_';

const STYLE = 'Japan anime style, hand drawing in the manner of Hayao Miyazaki, ' +
  'soft watercolour colours with fine ink lines, an 18th century western European farming village, ' +
  'warm afternoon light, cosy and detailed. ';
// The failures were modern objects, stray glassware and scribbled text, so say all of it outright.
const ENDING = ' The object is the clear centre of the picture. Everything belongs to the 1700s: ' +
  'no cars, no aerials, no electric lights, no power lines, no modern tools, no religious symbols. ' +
  'No glass vases or glass jars anywhere. No text, no letters, no signature, no border, no frame.';
const NEGATIVE = '';

// ------------------------------------------------------------------ the 9 cards
const CARDS = [
  ['Brook', 'a clear babbling brook running over stones through a meadow, crossed by a small wooden ' +
    'footbridge, thatched cottages behind with plain thatched roofs'],
  ['Mantelpiece', 'a carved stone mantelpiece above an open hearth, candles, clay jugs and small ' +
    'pewter ornaments standing on the mantel shelf, logs burning on iron firedogs in the hearth'],
  ['Junk Room', 'a cluttered attic storage room crammed with old tools, barrels, wooden crates, ' +
    'a broken chair, coils of rope and baskets piled up to the rafters, dusty light from a small window'],
  ['Large Greenhouse', 'a large old timber-framed glasshouse, much wider than it is tall, full of ' +
    'vegetables and leafy plants in rows, a plain ridge with no ornament, lit only by the sun'],
  ['Moldboard Plow', 'side view of a field outside the village, left to right in one line: a draft ' +
    'horse, then a long wooden beam from its harness to the plough, then the plough itself, then the ' +
    'farmer holding the two handles at its back end. The curved iron blade is under the middle of the ' +
    'plough, buried in the ground between the horse and the farmer, lifting a ribbon of dark soil. ' +
    'No wheels, no second blade, nothing behind the farmer'],
  ['Clay Pipe', 'an old white clay tobacco pipe lying on a wooden table: a very long, thin, almost ' +
    'straight white stem as long as a forearm, with a tiny bowl at one end; a thin wisp of smoke ' +
    'rises only from the small bowl'],
  ['Canoe', 'a primitive dugout log canoe drawn up on a quiet river bank among reeds: one whole ' +
    'tree trunk hollowed out with rough adze marks, bark still on the round outside, no planks, ' +
    'no ribs, no benches, no oars; a fishing net and one short wooden paddle lie inside'],
  ['Young Animal Market', 'a village livestock market; in front, a farm girl leads a tiny newborn ' +
    'bull calf on a rope, the calf no taller than her waist, with a short stubby muzzle, oversized ' +
    'ears, a fluffy coat and long wobbly legs; big grown cattle stand in the wooden pens behind'],
  ['Three-Field Rotation', 'three strip fields side by side: ripe grain, rows of vegetables, and ' +
    'bare fallow earth'],
];

// ------------------------------------------------------------------ run
const fileName = (en, a) => FILE_PREFIX + en.toLowerCase().replace(/[^a-z0-9]/g, '') +
  (ATTEMPTS > 1 ? '_a' + a : '') + '.png';
const outDir = filesystem.pictures.path;
console.log('Saving to: ' + outDir);

const todo = CARDS.map((c, i) => ({ en: c[0], subject: c[1], i }))
  .filter((c) => !ONLY.length || ONLY.includes(c.en));

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
    pipeline.run({ configuration, prompt: STYLE + subject + ENDING, negativePrompt: NEGATIVE });
    canvas.saveImage(outDir + '/' + fileName(c.en, a), true);
  }
});
console.log('Done: ' + todo.length * ATTEMPTS + ' images.');
