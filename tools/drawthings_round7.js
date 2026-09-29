// Draw Things script, round 7: five more occupations to redo.
// Run it through the API server:  python3 tools/drawthings_api.py tools/drawthings_round7.js
//
// Two different prompts per card, one picture each. a51 uses the idea that won round 6 (Cottager,
// Frame Builder): a low camera angle, in the middle of the job, with a helper. a52 is a second
// take: the character alone, mid-job, from eye level with the workplace wide behind them.

const BASE_SEED = 20261107;
const STYLE = 'Full-art trading card game illustration, Japanese anime style: clean line art and gentle cel ' +
  'shading, a muted, earthy, natural colour palette of browns, ochres, olive greens and faded blues, ' +
  'soft natural daylight, no glow, no sparkles, no glossy shine. Shallow depth of field so the ' +
  'background is softly blurred. The character is big and close to the camera, seen whole from the ' +
  'head to the feet, in a simple, natural, believable pose with well-drawn hands with five fingers ' +
  'each, and a relaxed, friendly, confident expression; the face and hands are in the upper half. ' +
  '18th century European country folk in simple, clean, well-kept clothes of linen and wool in plain ' +
  'earthy colours. ';
const ENDING = ' Everything belongs to the 1700s: no cars, no aerials, no electric lights, no power ' +
  'lines, no modern clothes and tools. No text, no letters, no signature, no border, no frame.';

// [English name, prompt A (a51), prompt B (a52)]
const CARDS = [
  ['Small-Scale Farmer',
    'Seen from a low angle, a young woman carrying an armful of firewood through the gate of her tiny ' +
    'two-room cottage, while her little sister holds the gate open for her, a small vegetable patch ' +
    'and a few hens around them',
    'A young woman kneeling in the small vegetable patch in front of her tiny two-room cottage, ' +
    'pulling up a bunch of carrots with a smile, a basket of greens and a small stack of firewood ' +
    'beside her'],
  ['Plow Driver',
    'Seen from a low angle, a young woman walking behind a wooden plough gripping both handles, a ' +
    'strong ox pulling ahead while a boy leads the ox by its halter, a fresh dark furrow curling ' +
    'open, a stone farmhouse far behind',
    'A young woman at the end of a furrow turning the ox and plough round, one hand on the plough ' +
    'handle and the other on the ox\'s back, neat ploughed rows stretching away behind her, a stone ' +
    'house on the hill'],
  ['Clay Hut Builder',
    'Seen from a low angle, a strong middle-aged woman pressing a handful of wet clay into the woven ' +
    'wattle wall of a new hut, while her son hands her the next lump from a wooden bucket, the half ' +
    'daubed wall rising beside them',
    'A strong middle-aged woman standing proudly in front of a freshly finished clay hut with a ' +
    'thatched roof, wiping her clay-smeared hands on a cloth, a wooden bucket of clay and a trowel at ' +
    'her feet'],
  ['Organic Farmer',
    'Seen from a low angle, a cheerful middle-aged man opening a wooden gate into a wide green ' +
    'pasture while his daughter leads a few sheep and brown pigs through it, plenty of open grass ' +
    'beyond',
    'A cheerful middle-aged man sitting on a wooden fence rail at the edge of a wide pasture, feeding ' +
    'a handful of grass to a sheep, a few brown pigs grazing in the open field behind him'],
  ['Conservator',
    'Seen from a low angle, a determined old woman on a ladder against a house whose wall is half ' +
    'old wooden boards and half new stone, fitting a stone block into the wall, while her grandson ' +
    'passes another stone up to her',
    'A determined old woman with a mason\'s trowel standing in front of her house, the wall behind her ' +
    'half weathered timber and half freshly laid stone, one hand resting on the new stonework, ' +
    'looking pleased'],
];

const slug = (en) => en.toLowerCase().replace(/[^a-z0-9]/g, '');
const outDir = filesystem.pictures.path;
CARDS.forEach(([en, a, b], i) => {
  [a, b].forEach((subject, k) => {
    const configuration = pipeline.configuration;
    configuration.width = 768;
    configuration.height = 1088;
    configuration.seed = BASE_SEED + i * 10 + k;
    configuration.loras = [];
    configuration.strength = 1.0;
    canvas.clear();
    console.log(`${en}  prompt ${k ? 'B' : 'A'}`);
    pipeline.run({ configuration, prompt: STYLE + subject + '.' + ENDING, negativePrompt: '' });
    canvas.saveImage(outDir + '/agricola_occ_' + slug(en) + '_a' + (51 + k) + '.png', true);
  });
});
