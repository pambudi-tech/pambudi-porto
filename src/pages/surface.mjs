import { preparePortfolio } from '../surface/scene.mjs';

const scene = await preparePortfolio({ surfaceOnly: true });
scene.start();
document.getElementById('surface').setAttribute('aria-busy', 'false');
