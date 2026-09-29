// Draw Things script, round 4: what the 13:32 pick still rejected.
// Run it through the API server:  python3 tools/drawthings_api.py tools/drawthings_round4.js
//
//   Conjurer           doves are enough: no rabbit
//   Rough Caster       the action made no sense (trowel stuck in the wall, board held any way):
//                      now side-on to the wall, board of plaster in one hand, trowel pressed flat
//   Grain Utilization  the "sower" sat in the field with a sack: now standing, mid-throw
//   Pig Market         the boar was huge: now knee-high to the farmers, piglets striped

const ATTEMPTS = 3;
const BASE_SEED = 20261104;

const OCC_STYLE = 'Full-art trading card game illustration, Japanese anime style: clean line art and gentle cel ' +
  'shading, a muted, earthy, natural colour palette of browns, ochres, olive greens and faded blues, ' +
  'soft natural daylight, no glow, no sparkles, no glossy shine. Shallow depth of field so the ' +
  'background is softly blurred. The character is big and close to the camera, seen whole from the ' +
  'head to the feet, in a simple, natural, believable pose with well-drawn hands with five fingers ' +
  'each, and a relaxed, friendly, confident expression; the face and hands are in the upper half. ' +
  '18th century European country folk; unless said otherwise below, in simple, clean, well-kept ' +
  'clothes of linen and wool in plain earthy colours. The background is rustic countryside. ';
const ACTION_STYLE = 'Japan anime style, hand drawing in the manner of Hayao Miyazaki, soft watercolour colours ' +
  'with fine ink lines, an 18th century western European farming village, warm afternoon light, ' +
  'cosy and detailed. A medium shot: the main subject is large and sits in the middle of the ' +
  'picture, with a little space around it. ';
const ENDING = ' Everything belongs to the 1700s: no cars, no aerials, no electric lights, no power ' +
  'lines, no factory chimneys, no church towers, no modern clothes and tools. ' +
  'No text, no letters, no signature, no border, no frame.';

// [kind, English name, first attempt number, subject]
const CARDS = [
  ['occ', 'Conjurer', 31, 'A charming young woman, a travelling stage conjurer, the one splendid figure among ' +
    'plain country folk: a deep crimson velvet tailcoat with gold embroidery, a black cape lined with red ' +
    'silk, white lace cuffs and a tall black top hat with a feather. She holds the top hat out in one hand ' +
    'and a magic wand in the other, and three white doves burst up out of the hat into the air. Only doves, ' +
    'no rabbit. Villagers watch in wonder on the green'],
  ['occ', 'Rough Caster', 31, 'A spry old man with white stubble, a plasterer, standing side-on to a clay ' +
    'cottage wall. His left hand holds a flat square wooden board loaded with wet lime plaster at chest ' +
    'height; his right hand presses a flat steel trowel against the wall, smoothing a fresh stripe of ' +
    'plaster onto it. Half the wall is already plastered smooth and pale, half is bare clay. A bucket of ' +
    'plaster at his feet, a content smile'],
  ['action', 'Grain Utilization', 11, 'On the left a farmer walks upright across a ploughed field with a ' +
    'seed bag slung at his hip, his arm swinging wide as a spray of grain seed flies through the air from ' +
    'his hand; on the right a woman slides a wooden peel with round loaves out of an outdoor clay bread oven'],
  ['action', 'Pig Market', 11, 'A village pig market: in a low wooden pen, a medium-sized European wild ' +
    'boar that only comes up to the farmers\' knees, dark grey-brown bristly coat, long snout, small ' +
    'tusks, with four small piglets that have cream and brown stripes along their backs; not pink farm ' +
    'pigs. Two farmers stand beside the pen shaking hands on a sale'],
];

const slug = (en) => en.toLowerCase().replace(/[^a-z0-9]/g, '');
const outDir = filesystem.pictures.path;
CARDS.forEach(([kind, en, first, subject], i) => {
  for (let a = 1; a <= ATTEMPTS; a++) {
    const configuration = pipeline.configuration;
    configuration.width = kind === 'occ' ? 768 : 1152;
    configuration.height = kind === 'occ' ? 1088 : 768;
    configuration.seed = BASE_SEED + i + (a - 1) * 1000;
    configuration.loras = [];
    configuration.strength = 1.0;
    canvas.clear();
    console.log(`${kind} ${en}  attempt ${a}/${ATTEMPTS}`);
    pipeline.run({ configuration, prompt: (kind === 'occ' ? OCC_STYLE : ACTION_STYLE) + subject + '.' + ENDING, negativePrompt: '' });
    canvas.saveImage(outDir + '/agricola_' + kind + '_' + slug(en) + '_a' + (first + a - 1) + '.png', true);
  }
});
