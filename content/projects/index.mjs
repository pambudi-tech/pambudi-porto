// Every written case study, by work id.
import ocean from './ocean.mjs';
import bcaPrioritas from './bca-prioritas.mjs';
import bcaCoId from './bca-co-id.mjs';
import runrise from './runrise.mjs';
import truenoSagrado from './trueno-sagrado.mjs';
import mandalika from './mandalika.mjs';
import standInGallery from './stand-in.mjs';

export const PROJECTS = { ocean, 'bca-prioritas': bcaPrioritas, 'bca-co-id': bcaCoId, runrise, 'trueno-sagrado': truenoSagrado, mandalika };

// Works with a page but no case study yet borrow this one's cover details.
export const STAND_IN = 'ocean';

// A work with no gallery of its own yet shows this one.
export const STAND_IN_GALLERY = standInGallery;
