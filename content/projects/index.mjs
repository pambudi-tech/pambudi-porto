// Every written case study, by work id.
import ocean from './ocean.mjs';
import bcaPrioritas from './bca-prioritas.mjs';
import bcaCoId from './bca-co-id.mjs';
import runrise from './runrise.mjs';
import truenoSagrado from './trueno-sagrado.mjs';
import mandalika from './mandalika.mjs';

export const PROJECTS = { ocean, 'bca-prioritas': bcaPrioritas, 'bca-co-id': bcaCoId, runrise, 'trueno-sagrado': truenoSagrado, mandalika };

// Works with a page but no case study yet, or a case study with no gallery
// yet, borrow this one's gallery.
export const STAND_IN = 'ocean';
