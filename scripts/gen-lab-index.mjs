// Пересобирает реестры src/data/labs/index.js и src/i18n/kk/labs/index.js по списку работ.
//   node scripts/gen-lab-index.mjs id1 id2 ...
// Порядок аргументов — порядок работ внутри предмета (по нему выставляются номера работ).
import { writeFileSync } from 'node:fs';

const ids = process.argv.slice(2);
if (!ids.every((id) => /^[a-z0-9_-]{1,40}$/.test(id))) throw new Error('неверный id работы');
const name = (id) => id.replace(/[-_](\w)/g, (m, c) => c.toUpperCase());

writeFileSync(new URL('../src/data/labs/index.js', import.meta.url), `// Работы, добавленные по одной на файл. У каждой работы <id> четыре файла:
//   src/sims/<id>.js          — модель опыта (export default),
//   src/svg/scenes/<id>.js    — рисунок установки,
//   src/data/labs/<id>.js     — шаги работы (export default) и частые вопросы для офлайн-Шоқана (export const faq),
//   src/i18n/kk/labs/<id>.js  — казахский перевод (export default словарь, export const patterns).
// Так работы можно добавлять независимо друг от друга, не правя общие файлы.
// Файл собирается командой node scripts/gen-lab-index.mjs — руками не править.

${ids.map((id) => `import ${name(id)}Sim from '../../sims/${id}.js';\nimport ${name(id)}, { faq as ${name(id)}Faq } from './${id}.js';`).join('\n')}

export const LAB_SIMS = [${ids.map((id) => `${name(id)}Sim`).join(', ')}];
export const LAB_LESSONS = [${ids.map(name).join(', ')}];
export const LAB_FAQ = [${ids.map((id) => `...${name(id)}Faq`).join(', ')}];
`);

writeFileSync(new URL('../src/i18n/kk/labs/index.js', import.meta.url), `// Казахские словари работ из src/data/labs (по файлу на работу), собранные в один.
// Файл собирается командой node scripts/gen-lab-index.mjs — руками не править.

${ids.map((id) => `import * as ${name(id)} from './${id}.js';`).join('\n')}

const LABS = [${ids.map(name).join(', ')}];

export default Object.assign({}, ...LABS.map((m) => m.default));
// Шаблоны разных работ могут совпасть на одной строке («3 из 20»): сначала пробуем более длинные,
// то есть более конкретные, — общий шаблон одной работы не перебьёт точный перевод другой
export const patterns = LABS.flatMap((m) => m.patterns ?? []).sort((a, b) => b[0].source.length - a[0].source.length);
`);
console.log(`в реестре ${ids.length} работ`);
