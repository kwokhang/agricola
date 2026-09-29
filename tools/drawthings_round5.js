// Draw Things script, round 5: what the 13:44 pick rejected.
// Run it through the API server:  python3 tools/drawthings_api.py tools/drawthings_round5.js
//
//   Bread Paddle       the peel's shape made no sense
//   Loam Pit           an odd cart down in the pit
//   Loom               the woven cloth looked wrong
//   Thick Forest       a forest needs no houses
//   Grain Utilization  the woman on the right was placed all wrong (round 4)
//   Pig Market         the boar should all be babies (round 4)
// Minors keep the minor improvements' watercolour; the two action tiles keep theirs.

const ATTEMPTS = 3;
const BASE_SEED = 20261105;

const STYLE = 'Japan anime style, hand drawing in the manner of Hayao Miyazaki, soft watercolour colours ' +
  'with fine ink lines, an 18th century western European farming village, warm afternoon light, ' +
  'cosy and detailed. ';
const MINOR_END = ' The object is the clear centre of the picture.';
const ACTION_END = ' A medium shot: the main subject is large and sits in the middle of the picture, ' +
  'with a little space around it.';
const ENDING = ' Everything belongs to the 1700s: no cars, no aerials, no electric lights, no power ' +
  'lines, no modern tools. No text, no letters, no signature, no border, no frame.';

// [kind, English name, first attempt number, subject]
const CARDS = [
  ['minor', 'Bread Paddle', 11, 'A baker\'s bread peel: one flat, thin, wide wooden blade shaped like a ' +
    'rounded shovel, on a single long straight wooden handle, carrying a round golden loaf out of the ' +
    'arched mouth of a brick bread oven, embers glowing inside'],
  ['minor', 'Loam Pit', 11, 'A shallow open pit dug into a hillside of rich brown loam soil, a wooden ' +
    'spade stuck in the earth and two woven baskets heaped with loam at the edge of the pit; nothing ' +
    'else inside the pit, no carts, no wheels'],
  ['minor', 'Loom', 11, 'A wooden floor loom in a cottage room, with a long length of plain woollen ' +
    'cloth in neat even stripes of cream and brown being woven on it, straight warp threads running ' +
    'into it, a wooden shuttle resting on the cloth, balls of yarn in a basket beside it'],
  ['minor', 'Thick Forest', 11, 'Deep inside a dense old forest with no buildings at all: tall thick ' +
    'tree trunks crowded together, ferns and moss on the ground, sunbeams through the leaves, and a ' +
    'neat stack of cut logs in a small clearing'],
  ['action', 'Grain Utilization', 21, 'Two farm workers side by side outdoors: on the left a farmer ' +
    'walks across a ploughed field scattering grain seed from a bag at his hip; on the right, standing ' +
    'on the grass in front of a small outdoor clay bread oven, a woman faces the oven and slides a ' +
    'wooden peel with a round loaf into its open mouth'],
  ['action', 'Pig Market', 21, 'A village market pen full of baby wild boar piglets only: six small ' +
    'wild boar piglets with cream and brown stripes running along their backs, no grown boar at all, ' +
    'tumbling in the straw of a low wooden pen; a farmer leans on the rail handing coins to another ' +
    'farmer who holds one striped piglet in his arms'],
];

const slug = (en) => en.toLowerCase().replace(/[^a-z0-9]/g, '');
const outDir = filesystem.pictures.path;
CARDS.forEach(([kind, en, first, subject], i) => {
  for (let a = 1; a <= ATTEMPTS; a++) {
    const configuration = pipeline.configuration;
    configuration.width = kind === 'minor' ? 1024 : 1152;
    configuration.height = 768;
    configuration.seed = BASE_SEED + i + (a - 1) * 1000;
    configuration.loras = [];
    configuration.strength = 1.0;
    canvas.clear();
    console.log(`${kind} ${en}  attempt ${a}/${ATTEMPTS}`);
    pipeline.run({ configuration, negativePrompt: '',
      prompt: STYLE + subject + '.' + (kind === 'minor' ? MINOR_END : ACTION_END) + ENDING });
    canvas.saveImage(outDir + '/agricola_' + kind + '_' + slug(en) + '_a' + (first + a - 1) + '.png', true);
  }
});
