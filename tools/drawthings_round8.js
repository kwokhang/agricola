// Draw Things script, round 8: Plow Driver, Conservator and Clay Hut Builder again, and the Well.
// Run it through the API server:  python3 tools/drawthings_api.py tools/drawthings_round8.js
//
// No batch of attempts this time: one picture at a time, looked at, the prompt fixed, painted again,
// at most five per card. What each try fixed, and the picture that was kept:
//   Plow Driver (4 tries)   round 7 had her walking in front of the plough. Side view with the ox
//                         ahead and her at the handles fixed that; then the ox had an udder and faced
//                         the camera, so: a bull ox with horns and a yoke, "udder" in the negatives.
//   Conservator (2 tries)   round 7 doubled the grandson and stood her still. One old man, alone,
//                         mid-job; then one single block (it drew two fused) and a smile.
//   Clay Hut Builder (4)   the wattle wall read as a mess. Brick-making instead; kneeling hid the
//                         feet, so he carries bricks; then solid mud bricks (it drew modern holed ones).
//   Well (3 tries)          the old one had a car in the lane and water pouring down the chain. A
//                         farmyard, no people (it drew two girls), a log windlass with rope wound on
//                         it, and the water out of sight down a dark shaft.
// Only the kept prompt is here; the seed reproduces the kept picture with the app's settings then.

const OCC_STYLE = 'Full-art trading card game illustration, Japanese anime style: clean line art and gentle cel ' +
  'shading, a muted, earthy, natural colour palette of browns, ochres, olive greens and faded blues, ' +
  'soft natural daylight, no glow, no sparkles, no glossy shine. Shallow depth of field so the ' +
  'background is softly blurred. The character is big and close to the camera, seen whole from the ' +
  'head to the feet, in a simple, natural, believable pose with well-drawn hands with five fingers ' +
  'each, and a relaxed, friendly, confident expression; the face and hands are in the upper half. ' +
  '18th century European country folk in simple, clean, well-kept clothes of linen and wool in plain ' +
  'earthy colours. ';
const MAJOR_STYLE = 'Japan anime style, hand drawing in the manner of Hayao Miyazaki, soft watercolour ' +
  'colours with fine ink lines, an 18th century western European farming village, warm afternoon light. ' +
  'Cosy and detailed. ';
const ENDING = ' Everything belongs to the 1700s: no cars, no aerials, no electric lights, no power ' +
  'lines, no modern clothes and tools. No text, no letters, no signature, no border, no frame.';
const MAJOR_ENDING = ' Everything belongs to the 1700s: no cars, no aerials, no electric lights, no power ' +
  'lines, no factory chimneys, no modern clothes and tools. No text, no letters, no signature, no border, no frame.';

// [English name, label, seed, subject, negative prompt]
const OCC = [
  ["Plow Driver", "a56", 20261203,
    "Side view from a little below: a young woman in a linen dress and apron walking behind a simple wooden plough, both her hands gripping the two wooden handles of the plough, the plough blade cutting a dark furrow in the earth at her feet; in front of the plough, on the left side of the picture, a big strong brown bull ox with short horns and a heavy wooden yoke over its neck, leaning forward and pulling the plough by a wooden pole; the woman is behind the plough and the ox is ahead of it; a stone farmhouse far away on a hill",
    "udder, cow, dairy cow, teats, extra people, child, two oxen, extra legs, deformed animal"],
  ["Conservator", "a54", 20261211,
    "Seen from a little below: a wiry grey-haired old man with a short white beard and a leather apron, smiling contentedly, in the middle of rebuilding the wall of his cottage, setting one single smooth rectangular stone block with both hands onto a half-built wall of neat new stones; the part of the wall not yet rebuilt is old weathered grey wooden planks, and a pile of pulled-off old planks lies on the ground beside him; a wooden bucket of mortar at his feet",
    "extra people, child, duplicate person, knife, extra fingers, worried, frowning"],
  ["Clay Hut Builder", "a56", 20261223,
    "Full body shot seen from a little below, his whole figure from head to boots in the picture: a sturdy young man with his sleeves rolled up and a canvas apron, walking towards the half-built wall of a small house carrying a stack of four solid orange-brown sun-dried mud bricks in both arms, only his hands a little muddy; the house has walls of the same solid mud bricks, half built, with a wooden roof frame waiting for thatch; rows of solid drying mud bricks and a wooden brick mould on the ground",
    "hollow bricks, bricks with holes, modern bricks, extra people, child, duplicate person, extra fingers, messy, spots on skin, wounds, cropped legs, close-up"],
];
const MAJOR = [
  ["Well", "a55", 20261232,
    "In a sunny farmyard beside a thatched stone farmhouse, no people: a round stone well with a knee-high wall of grey fieldstones in the middle of the picture, a small shingled wooden roof on two stout posts above it; between the two posts a thick round wooden log turns as a windlass, with rope wound round it and an iron crank handle on one end; the rope hangs down to a wooden bucket full of water standing on the edge of the well wall; the opening of the well is a black hole of darkness, deep, no water visible; hens peck on the ground, a wooden water trough and a clay jug beside the well",
    "people, person, girl, fountain, water jet, pouring water, water surface, metal can, car, modern, text"],
];

const slug = (en) => en.toLowerCase().replace(/[^a-z0-9]/g, '');
const outDir = filesystem.pictures.path;
const paint = (kind, style, ending, w, h) => ([en, label, seed, subject, negative]) => {
  const configuration = pipeline.configuration;
  configuration.width = w;
  configuration.height = h;
  configuration.seed = seed;
  configuration.loras = [];
  configuration.strength = 1.0;
  canvas.clear();
  console.log(`${en}  ${label}`);
  pipeline.run({ configuration, prompt: style + subject + '.' + ending, negativePrompt: negative });
  canvas.saveImage(`${outDir}/agricola_${kind}_${slug(en)}_${label}.png`, true);
};
OCC.forEach(paint('occ', OCC_STYLE, ENDING, 768, 1088));
MAJOR.forEach(paint('major', MAJOR_STYLE, MAJOR_ENDING, 1024, 1024));
