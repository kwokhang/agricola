// Draw Things script: paint the 48 minor improvement cards for Agricola in one go.
//
// How to use
//   1. In Draw Things, pick the model / LoRA / sampler you used for the occupation cards.
//   2. Scripts panel → add a new script → paste this whole file → Run.
//   3. Images are saved to your Pictures folder as  agricola_minor_<name>.png
//      (the path is printed in the log). Move them into  resource/minorimprovement/
//      and run  python3 game/tools/build_card_images.py
//
// Re-running only some cards: put their English names in ONLY, e.g. ONLY = ['Basket', 'Loom'].
// Different result for one card: change its seed offset in SEED_OVERRIDE, or edit its prompt.

// ------------------------------------------------------------------ settings
const WIDTH = 1024, HEIGHT = 768;      // 4:3 landscape: the card's picture window
const BASE_SEED = 20260925;            // card i uses BASE_SEED + i, so a rerun gives the same picture
const ONLY = [];                       // empty = all 48
const SKIP_EXISTING_NOTE = 'Draw Things cannot check files; use ONLY to redo a few.';
const SEED_OVERRIDE = {};              // e.g. { 'Basket': 777 }
const FILE_PREFIX = 'agricola_minor_';

// true: use whatever is in the app's prompt box as the style (handy if you already tuned one).
const USE_APP_PROMPT_AS_STYLE = false;

const STYLE = 'anime illustration, soft watercolour and ink, Studio Ghibli inspired, ' +
  '17th century European farming village, warm afternoon light, cosy, detailed, ' +
  'still life, the object is the clear centre of the picture, ';
const NEGATIVE = 'text, letters, watermark, signature, frame, border, card, ui, ' +
  'close-up face, portrait, crowd, blurry, lowres, jpeg artifacts, deformed, extra limbs, ' +
  'modern objects, photo, 3d render';

// ------------------------------------------------------------------ the 48 cards
// [English name (file name comes from this), subject]
const CARDS = [
  ['Basket', 'a woven wicker basket full of split firewood beside a woodpile'],
  ['Clay Embankment', 'a riverbank of wet red clay with a wooden spade stuck in it'],
  ['Large Greenhouse', 'a large old glass greenhouse full of vegetables and leafy plants'],
  ["Shepherd's Crook", "a wooden shepherd's crook leaning on a fence, a flock of sheep in a green pasture"],
  ['Manger', 'a wooden feeding trough full of hay in a fenced pasture'],
  ['Sleeping Corner', 'a snug wooden sleeping nook with quilts and a small cradle by a window'],
  ['Clearing Spade', 'an iron spade digging into a vegetable field with young sprouts'],
  ['Wool Blankets', 'a stack of thick folded wool blankets on a wooden chest in a timber house'],
  ['Canoe', 'a wooden dugout canoe on a quiet river bank among reeds, a fishing net inside'],
  ['Big Country', 'a wide sweeping countryside view of rolling fields and a far village'],
  ['Junk Room', 'a cluttered storage room full of tools, barrels, crates and old furniture'],
  ['Drinking Trough', 'a long wooden water trough in a pasture with sheep drinking'],
  ['Young Animal Market', 'a village livestock market with a young calf on a rope and wooden pens'],
  ['Clay Pipe', 'a clay tobacco pipe with a thin wisp of smoke on a wooden table'],
  ['Lumber Mill', 'a water-powered lumber mill sawing logs, stacked planks outside'],
  ['Shifting Cultivation', 'a freshly cleared and ploughed patch of field at the edge of a forest'],
  ['Pond Hut', 'a small wooden hut on stilts beside a pond, fish drying on a line'],
  ['Corn Scoop', 'a wooden grain scoop in an open sack of golden grain'],
  ['Rammed Clay', 'a rammed earth clay wall being built between wooden boards'],
  ['Threshing Board', 'a wooden threshing board with sheaves of wheat and scattered grain on a barn floor'],
  ['Dutch Windmill', 'a Dutch windmill with turning sails above golden fields'],
  ['Stone Tongs', 'heavy iron stone tongs gripping a cut stone block in a quarry'],
  ['Handplow', 'a simple wooden hand plough resting in a field furrow'],
  ['Milk Jug', 'a tall milk jug and a pail of fresh milk in a dairy, a cow in the background'],
  ['Mantelpiece', 'a carved stone mantelpiece above a hearth with candles and small ornaments'],
  ['Herring Pot', 'a ceramic pot of pickled herring on a kitchen shelf with onions and herbs'],
  ['Scullery', 'a small scullery with a stone sink, washed dishes and copper pans'],
  ['Mining Hammer', 'a heavy mining hammer and chisel on a rock face'],
  ['Hard Porcelain', 'glazed white and blue porcelain bowls and vases on a potter shelf'],
  ['Caravan', 'a painted wooden caravan wagon with a round roof parked by a meadow'],
  ['Loam Pit', 'a pit of rich brown loam soil with baskets of earth being carried out'],
  ['Loom', 'a wooden weaving loom with woollen cloth and skeins of yarn'],
  ['Moldboard Plow', 'an iron moldboard plough turning dark soil, a draft horse harness nearby'],
  ['Mini Pasture', 'one tiny square pasture fenced with fresh wooden rails, a single sheep inside'],
  ['Pitchfork', 'a wooden pitchfork stuck in a haystack beside a field'],
  ['Lasso', 'a coiled rope lasso hanging on a fence post near grazing cattle'],
  ['Bottles', 'a row of old glass bottles and clay flasks on a windowsill in sunlight'],
  ['Three-Field Rotation', 'three strip fields side by side: grain, vegetables, and bare fallow earth'],
  ['Market Stall', 'a wooden market stall piled with vegetables under a striped awning'],
  ['Beanfield', 'a lush bean field with climbing bean plants on wooden poles'],
  ['Butter Churn', 'a wooden butter churn with a pat of butter and a jug of cream'],
  ["Carpenter's Parlor", 'a carpenter workshop with a workbench, planes, saws and wood shavings'],
  ['Acorn Basket', 'a basket overflowing with acorns under an oak tree, a wild boar nearby'],
  ['Strawberry Patch', 'a strawberry patch with ripe red strawberries and a small basket'],
  ['Thick Forest', 'a dense old forest with tall trees and stacked logs in a clearing'],
  ['Bread Paddle', 'a long wooden bread peel pulling a fresh loaf out of a brick oven'],
  ['Brook', 'a clear babbling brook over stones through a meadow with a wooden footbridge'],
  ['Sack Cart', 'a small wooden hand cart loaded with sacks of grain'],
];

// ------------------------------------------------------------------ run
const fileName = (en) => FILE_PREFIX + en.toLowerCase().replace(/[^a-z0-9]/g, '') + '.png';
const style = USE_APP_PROMPT_AS_STYLE ? (pipeline.prompts.prompt || '') + ', ' : STYLE;
const outDir = filesystem.pictures.path;
console.log('Saving to: ' + outDir + '   (' + SKIP_EXISTING_NOTE + ')');

const todo = CARDS.map((c, i) => ({ en: c[0], subject: c[1], i }))
  .filter((c) => !ONLY.length || ONLY.includes(c.en));

todo.forEach((c, k) => {
  const configuration = pipeline.configuration;
  configuration.width = WIDTH;
  configuration.height = HEIGHT;
  configuration.seed = SEED_OVERRIDE[c.en] != null ? SEED_OVERRIDE[c.en] : BASE_SEED + c.i;
  canvas.clear();
  console.log(`(${k + 1}/${todo.length}) ${c.en}`);
  pipeline.run({ configuration, prompt: style + c.subject, negativePrompt: NEGATIVE });
  canvas.saveImage(outDir + '/' + fileName(c.en), true);
});
console.log('Done: ' + todo.length + ' images.');
