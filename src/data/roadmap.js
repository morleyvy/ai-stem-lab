// План «Скоро»: разделы школьной программы РК, для которых лабораторных работ пока нет.
// Показываются на дашборде некликабельными плитками, когда в выбранном классе работ по предмету мало.
// Только реальные названия разделов из учебников и программ — без выдуманного содержимого.
// Казахские названия — в src/i18n/kk/content-roadmap.js.
//
// Источники (оглавления учебников по обновлённому содержанию):
//   химия 7 — https://kzgdz.com/7-class/himiya-ospanova-8-2018-7-class/ (Оспанова, Мектеп)
//   химия 8 — https://kzgdz.com/8-class/himiya-ospanova-8-2018/
//   химия 10 — https://kzgdz.com/10-class/himija-ospanova-10-klass-2019/
//   химия 11 — https://kzgdz.com/11-class/himiya-chast-1-ospanova-m-k-11-emn-klass-2019/
//   физика 7 — https://kzgdz.com/7-class/fizika-zakirova-n-a-7-klass-2017/ (Закирова, Арман-ПВ)
//   физика 9 — https://kzgdz.com/9-class/fizika-zakirova-9-klass-2019/
//   физика 10 — https://kzgdz.com/10-class/fizika-zakirova-n-a-10-emn-klass-2019/
//   физика 11 — https://kzgdz.com/11-class/fizika-tujakbaev-11-klass-emn-2019/
//   биология 7 — https://kzgdz.com/7-class/biologija-soloveva-7-klass-2017/ (Соловьёва, Атамұра)
//   биология 8 — https://kzgdz.com/8-class/biologija-soloveva-a-8-klass-2018/
//   биология 10–11 (ЕМН) — названия разделов в суммативном оценивании, https://rao.kz/ (СОР 10 и 11 кл.)

export const ROADMAP = [
  { subject: 'chemistry', grade: 7, title: 'Чистые вещества и смеси' },
  { subject: 'chemistry', grade: 7, title: 'Воздух. Реакция горения' },
  { subject: 'chemistry', grade: 7, title: 'Изменение состояния вещества' },
  { subject: 'chemistry', grade: 8, title: 'Энергия в химических реакциях' },
  { subject: 'chemistry', grade: 8, title: 'Водород. Кислород. Озон' },
  { subject: 'chemistry', grade: 8, title: 'Растворы и растворимость' },
  { subject: 'chemistry', grade: 10, title: 'Строение атома' },
  { subject: 'chemistry', grade: 10, title: 'Химическая кинетика' },
  { subject: 'chemistry', grade: 10, title: 'Химическое равновесие' },
  { subject: 'chemistry', grade: 10, title: 'Окислительно-восстановительные реакции' },
  { subject: 'chemistry', grade: 11, title: 'Соединения ароматического ряда' },
  { subject: 'chemistry', grade: 11, title: 'Карбонильные соединения' },
  { subject: 'chemistry', grade: 11, title: 'Амины и аминокислоты' },
  { subject: 'chemistry', grade: 11, title: 'Синтетические полимеры' },

  { subject: 'physics', grade: 7, title: 'Механическое движение' },
  { subject: 'physics', grade: 7, title: 'Плотность' },
  { subject: 'physics', grade: 7, title: 'Работа и мощность. Энергия' },
  { subject: 'physics', grade: 9, title: 'Основы кинематики' },
  { subject: 'physics', grade: 9, title: 'Основы динамики' },
  { subject: 'physics', grade: 9, title: 'Законы сохранения' },
  { subject: 'physics', grade: 9, title: 'Атомное ядро' },
  { subject: 'physics', grade: 10, title: 'Кинематика' },
  { subject: 'physics', grade: 10, title: 'Динамика' },
  { subject: 'physics', grade: 10, title: 'Газовые законы' },
  { subject: 'physics', grade: 10, title: 'Постоянный ток' },
  { subject: 'physics', grade: 11, title: 'Электромагнитные колебания' },
  { subject: 'physics', grade: 11, title: 'Переменный ток' },
  { subject: 'physics', grade: 11, title: 'Волновая оптика' },
  { subject: 'physics', grade: 11, title: 'Физика атомного ядра' },

  { subject: 'biology', grade: 7, title: 'Дыхание растений' },
  { subject: 'biology', grade: 7, title: 'Нервная система' },
  { subject: 'biology', grade: 7, title: 'Размножение растений' },
  { subject: 'biology', grade: 8, title: 'Состав и функции крови' },
  { subject: 'biology', grade: 8, title: 'Газообмен' },
  { subject: 'biology', grade: 8, title: 'Пищеварительная система человека' },
  { subject: 'biology', grade: 8, title: 'Опорно-двигательная система' },
  { subject: 'biology', grade: 10, title: 'Транспорт веществ' },
  { subject: 'biology', grade: 10, title: 'Выделение' },
  { subject: 'biology', grade: 10, title: 'Закономерности наследственности и изменчивости' },
  { subject: 'biology', grade: 10, title: 'Координация и регуляция' },
  { subject: 'biology', grade: 11, title: 'Клеточная биология' },
  { subject: 'biology', grade: 11, title: 'Биотехнология' },
  { subject: 'biology', grade: 11, title: 'Рост и развитие' },
];
