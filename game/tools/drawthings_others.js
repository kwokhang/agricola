// Draw Things script: paint the occupation, major improvement and action space pictures.
//
// Same use as drawthings_minors.js (model FLUX.2 [klein] 9B, Text to Image, paste → Run).
// Files land in your Pictures folder as
//   agricola_occ_<name>_a1.png, agricola_major_<name>_a1.png, agricola_action_<name>_a1.png ...
// Pick one attempt per card, save it without the _aN suffix and the agricola_<kind>_ prefix
// into resource/occupation/, resource/majorimprovement/ or resource/action/ (replacing the old
// file of the same name), then run  python3 game/tools/build_card_images.py
//
// What is in here, and why:
//   Occupations  all 48, redone as full-art trading-card characters: the whole figure from head
//                to boots, caught mid-action, the job told by the scene. The old set was head-and-
//                shoulder portraits, 14 cards had no picture, sizes were mixed (square, 3:4, 2x),
//                and several had modern or Asian-script clutter (Manservant, Paper Maker, Tutor,
//                Master Bricklayer).
//   Majors       Well only: a blue car in the lane and a fountain spouting out of the well.
//   Actions      all 24, as close-ups: the tiles are small and the wide village scenes could not
//                be read there. Also fixes Lessons (strip lights, scribbled blackboards), Grain
//                Utilization (digging, not sowing and baking), Day Laborer (a harbour, clashed with
//                Fishing), Urgent Family Growth (read as grandparents), Pig Market (pink farm pigs,
//                the game has wild boar), Sheep and Cattle Market (just pasture, no market).
//
// First occupation run (12 cards, Conjurer to Wood Cutter): too watercolour and storybook,
// figures small, the same village street behind everyone, a factory chimney (Firewood Collector
// a2) and a church (Hedge Keeper a1), pink farm piglets for Pig Breeder. The style line is now
// anime key visual, as on Pokemon TCG full-art cards.
//
// Style test, 4 cards (Wood Cutter, Lutenist, Grocer, Oven Firing Boy): anime look right, but
// oversaturated, sparkly and costume-like, not rural (a hoodie on the oven boy, Grocer a2 turned
// young). Now muted earthy colours, no sparkles, real peasant working clothes, farmland behind.
//
// Re-running only some: put their English names in ONLY, or trim GROUPS.

// ------------------------------------------------------------------ settings
const GROUPS = ['occ'];                      // which groups to paint: 'occ', 'major', 'action'
const ONLY = [];                             // English names; empty = everything in GROUPS
const ATTEMPTS = 2;                          // pictures per card; attempt a uses seed + (a - 1) * 1000
const SEED_OVERRIDE = {};                    // e.g. { 'Wood Cutter': 777 }
const BASE_SEED = 20260930;           // changed with each new occupation style

// Sizes are multiples of 64. An occupation fills the whole 5:7 card; an action tile is 3:2.
const SIZE = { occ: [768, 1088], major: [1024, 1024], action: [1152, 768] };
const PREFIX = { occ: 'agricola_occ_', major: 'agricola_major_', action: 'agricola_action_' };

const WORLD = 'an 18th century western European farming village, warm afternoon light. ';
const STYLE = {
  // Second try. The first, "watercolour, in the manner of Miyazaki", came out as a pale sepia
  // storybook with sketchy lines, small figures and the same village street behind everyone.
  // The target is a modern Pokemon TCG full-art card: anime key-visual rendering, not paint.
  // Third try. The second (vivid, glossy, sparkles) got the anime look but was oversaturated and
  // read as fantasy costume: bright red and blue dresses, clean clothes, a hoodie on the oven boy.
  occ: 'Full-art trading card game illustration, Japanese anime style: clean line art and gentle ' +
    'cel shading, but a muted, earthy, natural colour palette of browns, ochres, olive greens and ' +
    'faded blues, soft natural daylight, no glow, no sparkles, no glossy shine. Shallow depth of ' +
    'field so the background is softly blurred. The character is big and close to the camera, ' +
    'filling most of the picture, seen whole from the head to the boots, caught in a dynamic action ' +
    'pose with a strong diagonal and an expressive face; the face and hands are in the upper half. ' +
    'A real 18th century European peasant: plain working clothes of coarse undyed linen and wool, ' +
    'patched and faded, sleeves rolled, dirt and sweat from work, sun-tanned skin, worn leather ' +
    'boots or wooden clogs, a straw hat, cap or headscarf. The background is rustic farmland: ' +
    'fields, barns, thatched cottages, muddy lanes, the place of their work. ',
  major: 'Japan anime style, hand drawing in the manner of Hayao Miyazaki, soft watercolour ' +
    'colours with fine ink lines, ' + WORLD + 'Cosy and detailed. ',
  // Action tiles are small, carry their name along the top and rules along the bottom: one big,
  // simple subject in the middle band reads at that size, a wide scene does not.
  action: 'Japan anime style, hand drawing in the manner of Hayao Miyazaki, soft watercolour ' +
    'colours with fine ink lines, bold clear shapes, ' + WORLD + 'A close-up: the main subject is ' +
    'big and fills the middle of the picture, the background is simple and softly blurred, the top ' +
    'and bottom edges are quiet. ',
};
// Actions and the Well keep the watercolour look of the minor improvements and the other majors,
// which sit next to them on the table.
// Everything that went wrong in the first sets, said outright (FLUX ignores negative prompts).
const ENDING = ' Everything belongs to the 1700s: no cars, no aerials, no electric lights, no power ' +
  'lines, no factory chimneys, no church towers, no hoodies, zips or modern clothes and tools, ' +
  'no religious symbols. ' +
  'No text, no letters, no writing on boards, signs or paper, no signature, no border, no frame.';

// ------------------------------------------------------------------ occupations (48)
// [English name, who (gender and age, fixed so the set is mixed: 22 women, 24 men, 2 couples;
//  8 children or teenagers, 12 old), what they are doing]
// Left to itself the model draws a young man every time, so who is always said first.
const OCC = [
  ['Conjurer', 'a young woman', 'a travelling conjurer in a patched coloured coat leaping on the ' +
    'village green, pulling a bundle of firewood and a sheaf of wheat out of a big hat'],
  ['Harpooner', 'a burly middle-aged man with a grey-streaked beard', 'braced in a small boat on a ' +
    'lake throwing a long wooden harpoon, spray flying, a bundle of reeds in the bow'],
  ['Animal Dealer', 'a jolly old man with white whiskers', 'striding through a market with a lamb ' +
    'under one arm, leading a cow and a bristly wild boar on ropes, coin purse swinging'],
  ['Lutenist', 'a young woman', 'mid-song with one foot up on a barrel, strumming a lute, hair ' +
    'flying, villagers dancing behind'],
  ['Braggart', 'a plump middle-aged man in a fancy waistcoat', 'standing on a crate with arms flung ' +
    'wide, showing off the ovens, workshops and well of his farm behind him, chin in the air'],
  ['Pig Breeder', 'a sturdy middle-aged woman', 'laughing as she wrestles a squirming brown wild ' +
    'boar piglet in her arms in a muddy pen, a big dark tusked boar and brown striped wild piglets ' +
    '(not pink farm pigs) round her boots'],
  ['Wood Cutter', 'a strong young man', 'swinging an axe high overhead at a thick tree trunk, wood ' +
    'chips flying, split logs at his feet in a sunny forest'],
  ['Hedge Keeper', 'a wiry old man', 'bending and weaving living hazel branches into a field hedge, ' +
    'a billhook in hand, stepping along the half-finished hedge'],
  ['Firewood Collector', 'a girl of about ten', 'carrying a huge bundle of dry sticks on her back, ' +
    'bending to pick up one more branch at the edge of a freshly sown field'],
  ['Scythe Worker', 'a young woman with her sleeves rolled up', 'mid-swing with a long scythe, golden ' +
    'wheat falling in a sweeping arc, body twisted with the stroke'],
  ['Seasonal Worker', 'a cheerful teenage boy', 'running along a field path with a sack of grain on ' +
    'one shoulder and a basket of carrots and cabbages on the other hip'],
  ['Clay Hut Builder', 'a strong middle-aged woman', 'slapping a big handful of wet clay onto the ' +
    'wattle wall of a new cottage, mud splashing, a bucket of clay beside her'],
  ['Grocer', 'a lively old woman with grey hair and a wrinkled face', 'behind a market stall, reaching up to take the top item off a ' +
    'tall teetering stack of goods: a cabbage, a reed bundle, a clay brick, a stone, a grain sack, a log'],
  ['Stable Architect', 'a middle-aged woman in a long coat', 'pointing with a rolled-up plan at a row ' +
    'of little wooden stables going up in a meadow, a horse peering out of one'],
  ['Wall Builder', 'a young man', 'heaving a big stone block onto a half-built wall with both arms, ' +
    'a trowel in his teeth, a new room of the house rising behind him'],
  ['Rough Caster', 'a spry old man', 'flinging rough lime plaster from a trowel onto a clay house ' +
    'wall, the mix spattering, a plasterer\'s board in the other hand'],
  ['Adoptive Parents', 'a middle-aged couple, a man and a woman, with a small adopted boy', 'walking ' +
    'to the fields swinging the child between them by the hands, the child laughing with a tiny rake'],
  ['Mushroom Collector', 'a kindly old woman', 'kneeling on the mossy forest floor lifting a big ' +
    'mushroom up to the light, a basket overflowing with mushrooms and a few sticks of wood'],
  ['Plow Driver', 'a determined young woman', 'leaning hard into the handles of a wooden plough ' +
    'pulled by an ox, the iron blade cutting a furrow, soil curling up, a stone house behind'],
  ['Animal Tamer', 'a teenage girl', 'in a cottage doorway, a sheep, a wild boar and a calf crowding ' +
    'happily round her as she raises a hand like a conductor'],
  ['Stonecutter', 'a muscular middle-aged man', 'hammering a chisel into a big block in a quarry, ' +
    'stone chips flying, cut blocks stacked behind'],
  ['Conservator', 'a determined old woman', 'on a ladder replacing the old boards of a wooden house ' +
    'with stone, a stone block in her hands, the wall half wood and half stone'],
  ['Frame Builder', 'a young man', 'hoisting a heavy oak beam onto his shoulder, the timber frame of ' +
    'a new house standing behind him, a mallet on his belt'],
  ['Priest', 'an old man in a black cassock', 'hurrying along a lane to bless a family at the door ' +
    'of their small clay house, bundles of reed and clay bricks by the door'],
  ['Paper Maker', 'a middle-aged woman in an apron', 'lifting a dripping wooden mould out of a vat ' +
    'of pulp, a fresh blank sheet on the screen, blank sheets drying on lines in a timber workshop'],
  ['Storehouse Keeper', 'a young man', 'rolling a barrel through a busy barn full of grain sacks ' +
    'and piles of clay bricks, keys jangling at his belt'],
  ['Cattle Feeder', 'a teenage boy', 'tossing an armful of hay over a fence to hungry cows, a sack of ' +
    'grain seed slung at his hip'],
  ['Greengrocer', 'a young woman', 'laughing as she swings a big basket heaped with vegetables onto a ' +
    'cart, a carrot tumbling out'],
  ['Brushwood Collector', 'a bent but tough old man', 'dragging a big bundle of brushwood tied with ' +
    'rope across a heath, leaning into the load'],
  ['Consultant', 'a sharp young woman in a smart coat', 'walking beside a farmer, counting on her ' +
    'fingers and pointing across the farmyard at grain, clay, reed and sheep'],
  ['House Steward', 'a dignified old man in a tidy waistcoat', 'marching down the hall of a big ' +
    'farmhouse carrying a pile of firewood, a ring of keys swinging'],
  ['Sheep Whisperer', 'a girl of about ten', 'crouching in a meadow with a finger to her lips, a flock ' +
    'of sheep gently gathering round her, a lamb nuzzling her hand'],
  ['Pastor', 'a warm middle-aged man in a dark coat', 'with open arms welcoming a family into a tiny ' +
    'two-room cottage, gifts of wood, clay, reed and stone piled at the door'],
  ['Assistant Tiller', 'a skinny teenage boy', 'pushing a small wooden hand plough through a field ' +
    'with all his weight, sleeves rolled up, soil flying'],
  ['Groom', 'a boy of about twelve', 'leading a prancing horse out of a small wooden stable by the ' +
    'halter, a stone house in the background'],
  ['Master Bricklayer', 'an old man with a white beard', 'on wooden scaffolding laying red bricks at ' +
    'speed, trowel flashing, building a brick oven'],
  ['Carpenter', 'a middle-aged woman', 'mid-stroke sawing a plank on trestles, sawdust flying, a new ' +
    'wooden room being built behind her'],
  ['Small-Scale Farmer', 'a young woman', 'carrying a bundle of firewood and waving from the gate of ' +
    'her tiny two-room cottage with a vegetable patch'],
  ['Cottager', 'a middle-aged man', 'climbing a ladder with a bundle of thatching reed on his shoulder ' +
    'to fix the roof of his cottage'],
  ['Roof Ballaster', 'a young woman', 'kneeling on a thatched roof placing heavy stones on ropes ' +
    'across the thatch to hold it down, hair and clothes blowing in the wind'],
  ['Tutor', 'a young man in a long coat', 'walking through a meadow with two children, pointing up at ' +
    'a bird while they hold open picture books, no writing'],
  ['Oven Firing Boy', 'a boy of about ten', 'feeding a log into a roaring brick bread oven, cheeks ' +
    'puffed as he blows on the fire, a pile of firewood beside him'],
  ['Organic Farmer', 'a cheerful middle-aged man', 'running through a wide pasture with a few happy ' +
    'sheep and pigs, lots of open grass around them'],
  ['Manservant', 'a young man in livery', 'hurrying across the hall of a stone house carrying a tray ' +
    'piled with bread, cheese and a roast, coat tails flying'],
  ['Childless', 'an old couple, a man and a woman', 'dancing together in the big empty room of their ' +
    'three-room house, a table set with bread and vegetables'],
  ['Geologist', 'an old woman with spectacles', 'crouching at a riverbank tapping a rock with a small ' +
    'hammer and holding up a lump of clay, a satchel of stones, reeds around'],
  ['Scholar', 'a young woman', 'in a stone house reading aloud while pacing, a heavy book open in ' +
    'one hand, the other hand raised, shelves of books behind, no writing visible'],
  ['Sheep Walker', 'a weathered middle-aged woman', 'striding along a country road with a crook, a ' +
    'flock of sheep trotting ahead, a traveller offering a vegetable and a stone to trade'],
];

// ------------------------------------------------------------------ major improvements
const MAJOR = [
  ['Well', 'a round stone village well in a cobbled square, with a small thatched roof on two posts ' +
    'and a wooden windlass; a rope and a wooden bucket hang down into the dark water deep inside, ' +
    'a village woman turning the handle. The water lies still inside the well, no spout or fountain'],
];

// ------------------------------------------------------------------ action spaces (24)
// All 24, as close-ups: the tiles are small, and the wide village scenes read as mush there.
// The file name comes from the English name and build_card_images.py matches it to the space.
const ACTION = [
  // the six fixed spaces
  ['Farm Expansion', 'close-up of two hands setting a new timber beam onto a half-built cottage wall, ' +
    'a small wooden stable beside it'],
  ['Meeting Place', 'close-up of two villagers clasping hands across a table in a tavern, a wooden ' +
    'start-player token and a small crafted tool lying between them'],
  ['Grain Seeds', 'close-up of an open burlap sack of golden wheat grain, a hand scooping out a handful'],
  ['Farmland', 'close-up of a wooden plough blade cutting through dark earth, the soil curling over ' +
    'into a fresh furrow'],
  ['Lessons', 'close-up of an old farmer\'s hands guiding a boy\'s hands on the handle of a sickle, ' +
    'both faces concentrating'],
  ['Day Laborer', 'close-up of a labourer\'s rough hands receiving a loaf of bread and a small wrapped ' +
    'cheese as his day\'s pay, a sack on his shoulder'],
  // the accumulation spaces
  ['Forest', 'close-up of a stack of freshly split logs in front of tall tree trunks, an axe stuck ' +
    'in the chopping block'],
  ['Clay Pit', 'close-up of wet red-brown clay being dug with a wooden spade, glistening lumps piled ' +
    'in a basket'],
  ['Reed Bank', 'close-up of tall golden reeds by the water, a bundle of cut reeds tied with string ' +
    'in the front'],
  ['Fishing', 'close-up of a fishing net being hauled out of the water full of silver fish, water ' +
    'dripping'],
  // the round cards
  ['Major Improvement', 'close-up of a brick bread oven with its door open and fire glowing inside, ' +
    'a finished pot and a woven basket beside it'],
  ['Sheep Market', 'close-up of two woolly sheep behind a wooden market pen rail, a hand passing coins ' +
    'to another hand above them'],
  ['Fencing', 'close-up of a hand hammering a wooden fence rail onto a post, a row of new fence ' +
    'running into a green pasture'],
  ['Grain Utilization', 'close-up of a hand scattering grain seed over dark soil on the left, and ' +
    'on the right a fresh round loaf being pulled out of an oven on a wooden peel'],
  ['Family Growth', 'close-up of a mother and father smiling down at a newborn baby wrapped in a ' +
    'blanket in a wooden cradle'],
  ['House Redevelopment', 'close-up of a cottage wall half wooden planks and half fresh clay plaster, ' +
    'a trowel spreading the clay over the wood'],
  ['Western Quarry', 'close-up of a grey stone block being split with a hammer and chisel, chips ' +
    'flying, in a quarry lit by the low sun from the west'],
  ['Vegetable Seeds', 'close-up of a hand pressing seeds into a soil row next to fresh carrots and a ' +
    'cabbage just pulled up'],
  ['Pig Market', 'close-up of a brown bristly wild boar with small tusks and two striped piglets ' +
    'behind a wooden market pen, a rope halter on the boar'],
  ['Cattle Market', 'close-up of a brown and white cow\'s head over a wooden market pen, a rope ' +
    'halter being handed from one farmer to another'],
  ['Eastern Quarry', 'close-up of big cut stone blocks stacked on a wooden sledge in a quarry, lit ' +
    'by the morning sun from the east'],
  ['Cultivation', 'close-up of a plough furrow with a hand dropping seeds into it right behind the ' +
    'blade, young green shoots in the next row'],
  ['Urgent Family Growth', 'close-up of a young mother in a cramped cottage holding a newborn, two ' +
    'small children squeezed in on either side of her, very little space'],
  ['Farm Redevelopment', 'close-up of a stone cottage wall going up beside new wooden fences, a ' +
    'mason\'s trowel and a coil of fence rope in front'],
];

// ------------------------------------------------------------------ run
const slug = (en) => en.toLowerCase().replace(/[^a-z0-9]/g, '');
const outDir = filesystem.pictures.path;
console.log('Saving to: ' + outDir);

const all = []
  .concat(OCC.map((c, i) => ({ kind: 'occ', en: c[0], subject: c[1] + ', ' + c[2], i })))
  .concat(MAJOR.map((c, i) => ({ kind: 'major', en: c[0], subject: c[1], i: 100 + i })))
  .concat(ACTION.map((c, i) => ({ kind: 'action', en: c[0], subject: c[1], i: 200 + i })));
const todo = all.filter((c) => GROUPS.includes(c.kind) && (!ONLY.length || ONLY.includes(c.en)));
console.log(todo.length + ' cards × ' + ATTEMPTS + ' attempts = ' + todo.length * ATTEMPTS + ' images');

todo.forEach((c, k) => {
  const seed0 = SEED_OVERRIDE[c.en] != null ? SEED_OVERRIDE[c.en] : BASE_SEED + c.i;
  const subject = c.subject.charAt(0).toUpperCase() + c.subject.slice(1) + '.';
  for (let a = 1; a <= ATTEMPTS; a++) {
    const configuration = pipeline.configuration;
    configuration.width = SIZE[c.kind][0];
    configuration.height = SIZE[c.kind][1];
    configuration.seed = seed0 + (a - 1) * 1000;
    configuration.loras = [];
    configuration.strength = 1.0;
    canvas.clear();
    console.log(`(${k + 1}/${todo.length}) ${c.kind} ${c.en}  attempt ${a}/${ATTEMPTS}  seed ${configuration.seed}`);
    pipeline.run({ configuration, prompt: STYLE[c.kind] + subject + ENDING, negativePrompt: '' });
    const suffix = ATTEMPTS > 1 ? '_a' + a : '';
    canvas.saveImage(outDir + '/' + PREFIX[c.kind] + slug(c.en) + suffix + '.png', true);
  }
});
console.log('Done: ' + todo.length * ATTEMPTS + ' images.');
