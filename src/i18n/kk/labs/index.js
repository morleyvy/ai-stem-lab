// Казахские словари работ из src/data/labs (по файлу на работу), собранные в один.
// Файл собирается командой node scripts/gen-lab-index.mjs — руками не править.

import * as mixtures from './mixtures.js';
import * as states from './states.js';
import * as combustion from './combustion.js';
import * as gases from './gases.js';
import * as thermochem from './thermochem.js';
import * as solubility from './solubility.js';
import * as kinetics from './kinetics.js';
import * as equilibrium from './equilibrium.js';
import * as redox from './redox.js';
import * as atom from './atom.js';
import * as aromatic from './aromatic.js';
import * as carbonyl from './carbonyl.js';
import * as amines from './amines.js';
import * as polymers from './polymers.js';
import * as motion from './motion.js';
import * as density from './density.js';
import * as workPower from './work-power.js';
import * as kinematics9 from './kinematics9.js';
import * as dynamics9 from './dynamics9.js';
import * as conservation from './conservation.js';
import * as nucleus9 from './nucleus9.js';
import * as kinematics10 from './kinematics10.js';
import * as dynamics10 from './dynamics10.js';
import * as gasLaws from './gas-laws.js';
import * as dcCircuit from './dc-circuit.js';
import * as emOscillations from './em-oscillations.js';
import * as acCurrent from './ac-current.js';
import * as waveOptics from './wave-optics.js';
import * as nucleus11 from './nucleus11.js';
import * as respiration from './respiration.js';
import * as nervous from './nervous.js';
import * as plantReproduction from './plant-reproduction.js';
import * as digestion from './digestion.js';
import * as blood from './blood.js';
import * as gasExchange from './gas-exchange.js';
import * as musculoskeletal from './musculoskeletal.js';
import * as transport from './transport.js';
import * as excretion from './excretion.js';
import * as variation from './variation.js';
import * as glucoseRegulation from './glucose-regulation.js';
import * as mitosis from './mitosis.js';
import * as electrophoresis from './electrophoresis.js';
import * as phototropism from './phototropism.js';
import * as itBinaryCode from './it-binary-code.js';
import * as itMemoryUnits from './it-memory-units.js';
import * as itNetworkTopology from './it-network-topology.js';
import * as itRobotBranching from './it-robot-branching.js';
import * as itAlphabetApproach from './it-alphabet-approach.js';
import * as itBandwidth from './it-bandwidth.js';
import * as itLoopTrace from './it-loop-trace.js';
import * as itArraySorting from './it-array-sorting.js';
import * as itNumberSystems from './it-number-systems.js';
import * as itLogicGates from './it-logic-gates.js';
import * as itPcAssembly from './it-pc-assembly.js';

const LABS = [mixtures, states, combustion, gases, thermochem, solubility, kinetics, equilibrium, redox, atom, aromatic, carbonyl, amines, polymers, motion, density, workPower, kinematics9, dynamics9, conservation, nucleus9, kinematics10, dynamics10, gasLaws, dcCircuit, emOscillations, acCurrent, waveOptics, nucleus11, respiration, nervous, plantReproduction, digestion, blood, gasExchange, musculoskeletal, transport, excretion, variation, glucoseRegulation, mitosis, electrophoresis, phototropism, itBinaryCode, itMemoryUnits, itNetworkTopology, itRobotBranching, itAlphabetApproach, itBandwidth, itLoopTrace, itArraySorting, itNumberSystems, itLogicGates, itPcAssembly];

export default Object.assign({}, ...LABS.map((m) => m.default));
// Шаблоны разных работ могут совпасть на одной строке («3 из 20»): сначала пробуем более длинные,
// то есть более конкретные, — общий шаблон одной работы не перебьёт точный перевод другой
export const patterns = LABS.flatMap((m) => m.patterns ?? []).sort((a, b) => b[0].source.length - a[0].source.length);
