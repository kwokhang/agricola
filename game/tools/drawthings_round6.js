// Draw Things script, round 6: five occupations whose style still did not sit right.
// Run it through the API server:  python3 game/tools/drawthings_api.py game/tools/drawthings_round6.js
//
// Two different prompts per card, one picture each: a41 is a close, lively working moment,
// a42 a calmer character portrait in their workplace. Same round-2 look as the winners.
// 14:26 pick: Paper Maker a41 and Plow Driver a42 kept. Cottager, Frame Builder and Roof
// Ballaster rejected, so ROUND2 below tries two new ideas each (a43, a44); set ROUND = 2.

const BASE_SEED = 20261106;
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

// [English name, prompt A (a41), prompt B (a42)]
const CARDS = [
  ['Frame Builder',
    'A young carpenter kneeling on a big oak beam of a half-built timber house frame, driving a wooden ' +
    'peg into a joint with a mallet held in both hands, sawdust in the air, the tall timber frame ' +
    'rising around him against the sky',
    'A young carpenter standing proudly in front of the finished oak timber frame of a new cottage, ' +
    'one hand resting on an upright post, a mallet hanging from his belt and a carpenter\'s square ' +
    'under his arm, smiling at the camera'],
  ['Cottager',
    'A middle-aged man halfway up a wooden ladder against his small cottage, one arm hugging a bundle ' +
    'of golden thatching reed on his shoulder, the other hand pushing reed into the roof, his wife ' +
    'handing up another bundle from below',
    'A middle-aged man standing at the door of his small whitewashed cottage with a fresh thatched ' +
    'roof, wiping his hands on his apron with a satisfied smile, a spare bundle of reed and a wooden ' +
    'rake leaning against the wall'],
  ['Paper Maker',
    'A middle-aged woman in an apron at a wooden vat in a timber workshop, lifting a rectangular ' +
    'wooden paper mould flat out of the milky pulp with both hands, water streaming off it, a fresh ' +
    'white sheet forming on the mesh',
    'A middle-aged woman in an apron in a bright paper workshop, hanging a sheet of blank white paper ' +
    'on a drying line with wooden pegs, rows of blank sheets drying behind her, a stack of finished ' +
    'paper on the table, calm and pleased'],
  ['Plow Driver',
    'A young woman walking behind a wooden plough pulled by a brown ox, both hands firmly on the two ' +
    'plough handles, a straight dark furrow opening behind the iron blade, the stone farmhouse far ' +
    'behind in the morning light',
    'A young woman standing in a freshly ploughed field beside her resting ox, one hand on the ox\'s ' +
    'neck and the other holding the plough handle, straw hat pushed back, looking out over the neat ' +
    'furrows with a smile'],
  ['Roof Ballaster',
    'A young woman kneeling on the ridge of a thatched roof, setting a heavy round stone into a rope ' +
    'net that holds the thatch down, a coil of rope over her shoulder, the wind blowing her hair and ' +
    'skirt, fields far below',
    'A young woman standing in front of a cottage whose thatched roof is weighed down by rows of ' +
    'stones hanging on ropes, holding one more round stone in both hands, looking up at the roof with ' +
    'a satisfied smile'],
];

// Second try for the three still open: a43 from a low angle mid-job with a teammate, a44 a
// friendly pause with the tools of the trade, looking at the viewer.
// 14:29 pick: Cottager a43 and Frame Builder a43 kept, both the low-angle mid-job idea with a
// helper. Roof Ballaster rejected again, so ROUND3 gives it two more takes on that same idea.
const ROUND = 3;
const ROUND3 = [
  ['Roof Ballaster',
    'Seen from a low angle, a young woman standing on the roof of a thatched cottage, catching a rope ' +
    'with a round stone tied to it that her father throws up from below, and hanging it over the ridge ' +
    'beside a row of stones already holding the thatch down, a windy sky behind, her hair blowing',
    'Seen from a low angle, a young woman and her younger brother on top of a thatched roof, together ' +
    'lifting a heavy flat stone onto the rope that runs across the thatch, laughing, the wind tugging ' +
    'at the straw, fields far below'],
];
const ROUND2 = [
  ['Frame Builder',
    'Seen from a low angle, a young carpenter standing high on the timber frame of a new barn, one ' +
    'foot on a crossbeam, guiding a long oak beam that a friend below pushes up to him, the sky ' +
    'bright behind them',
    'A young carpenter sitting on a stack of squared oak beams in his timber yard, a mallet across ' +
    'his knees and a wooden peg in his hand, taking a break, smiling at the viewer, the timber frame ' +
    'of a house standing behind him'],
  ['Cottager',
    'Seen from a low angle, a middle-aged man sitting on the roof of his little cottage beside the ' +
    'chimney, tying a new bundle of thatching reed into place with twine, his son climbing the ladder ' +
    'with another bundle',
    'A middle-aged man in a vegetable garden in front of his tiny thatched cottage, leaning on a spade, ' +
    'a hen at his feet and a basket of fresh vegetables beside him, smiling at the viewer'],
  ['Roof Ballaster',
    'Seen from a low angle, a young woman on a ladder against a thatched cottage, hoisting a round ' +
    'stone tied to a rope up onto the roof, where a row of stones already hangs on ropes across the ' +
    'thatch, a windy sky behind',
    'A young woman sitting on a low stone wall in front of her cottage, a heavy round stone in her ' +
    'lap and a coil of rope beside her, the thatched roof behind held down by stones hanging on ropes, ' +
    'smiling at the viewer'],
];

const slug = (en) => en.toLowerCase().replace(/[^a-z0-9]/g, '');
const outDir = filesystem.pictures.path;
(ROUND === 3 ? ROUND3 : ROUND === 2 ? ROUND2 : CARDS).forEach(([en, a, b], i) => {
  [a, b].forEach((subject, k) => {
    const configuration = pipeline.configuration;
    configuration.width = 768;
    configuration.height = 1088;
    configuration.seed = BASE_SEED + i * 10 + k + (ROUND === 3 ? 900 : ROUND === 2 ? 500 : 0);
    configuration.loras = [];
    configuration.strength = 1.0;
    canvas.clear();
    console.log(`${en}  prompt ${k ? 'B' : 'A'}`);
    pipeline.run({ configuration, prompt: STYLE + subject + '.' + ENDING, negativePrompt: '' });
    canvas.saveImage(outDir + '/agricola_occ_' + slug(en) + '_a' + ((ROUND === 3 ? 45 : ROUND === 2 ? 43 : 41) + k) + '.png', true);
  });
});
