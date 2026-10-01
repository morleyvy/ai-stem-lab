// Проверка одной новой работы до того, как её внесут в реестр:
//   node scripts/check-lab.mjs <id>
// Читает src/sims/<id>.js, src/data/labs/<id>.js и src/i18n/kk/labs/<id>.js (см. src/data/labs/index.js).

import { checkLab } from './labCheck.js';

const id = process.argv[2];
if (!/^[a-z0-9_-]{1,40}$/.test(id ?? '')) {
  console.error('Использование: node scripts/check-lab.mjs <id>');
  process.exit(2);
}

const load = async (path) => {
  try {
    return await import(new URL(path, import.meta.url));
  } catch (e) {
    console.error(`Не удалось загрузить ${path}: ${e.message}`);
    process.exit(1);
  }
};

const simMod = await load(`../src/sims/${id}.js`);
const lessonMod = await load(`../src/data/labs/${id}.js`);
const kkMod = await load(`../src/i18n/kk/labs/${id}.js`);

const { errors, warn } = checkLab({ sim: simMod.default, lesson: lessonMod.default, kk: kkMod.default ?? {}, kkPatterns: kkMod.patterns ?? [], strict: true });

const faq = lessonMod.faq ?? [];
if (!faq.length) warn.push('нет faq — офлайн-Шоқан не ответит на вопросы по этой работе');
for (const [i, f] of faq.entries()) {
  if (!f.q?.length || !f.qk?.length || !f.a || !f.ak) errors.push(`faq[${i}]: нужны q[], qk[], a, ak`);
  if (f.scope !== id) errors.push(`faq[${i}].scope должен быть «${id}»`);
}

for (const w of warn) console.log(`предупреждение: ${w}`);
if (errors.length) {
  for (const e of errors) console.log(`ОШИБКА: ${e}`);
  console.log(`\n${errors.length} ошибок`);
  process.exit(1);
}
console.log(`${id}: проверка пройдена`);
