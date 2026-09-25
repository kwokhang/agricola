// Draw Things diagnostic: runs each step of the batch script once, logging as it goes, so
// if something is unsupported the log shows exactly which step and why.
// Paste into the Scripts panel, Run, and copy the whole log back.

function step(name, fn) {
  try {
    const r = fn();
    console.log('OK   ' + name + (r !== undefined ? '  → ' + JSON.stringify(r).slice(0, 200) : ''));
    return r;
  } catch (e) {
    console.log('FAIL ' + name + '  → ' + e);
    throw e;
  }
}

console.log('--- Draw Things script test ---');
step('typeof pipeline', () => typeof pipeline);
step('typeof canvas', () => typeof canvas);
step('typeof filesystem', () => typeof filesystem);
const cfg = step('read pipeline.configuration', () => pipeline.configuration);
step('configuration keys', () => Object.keys(cfg));
step('current model', () => cfg.model);
step('pictures path', () => filesystem.pictures.path);
step('set size', () => { cfg.width = 1024; cfg.height = 768; return [cfg.width, cfg.height]; });
step('set seed', () => { cfg.seed = 12345; return cfg.seed; });
step('clear loras', () => { cfg.loras = []; return cfg.loras; });
step('set strength', () => { cfg.strength = 1.0; return cfg.strength; });
step('clear canvas', () => canvas.clear());
step('run one image', () => pipeline.run({
  configuration: cfg,
  prompt: 'Japan anime style, hand drawing in the manner of Hayao Miyazaki, an 18th century western ' +
    'European farming village. A woven wicker basket full of split firewood. No text.',
  negativePrompt: '',
}));
step('save image', () => canvas.saveImage(filesystem.pictures.path + '/agricola_test.png', true));
console.log('--- done: look for agricola_test.png in ' + filesystem.pictures.path + ' ---');
