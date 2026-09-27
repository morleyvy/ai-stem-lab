// Аккаунты и результаты через Supabase. Ключ anon публичный по задумке Supabase:
// доступ к данным ограничивают политики RLS в supabase/schema.sql, а не секретность ключа.

import { createClient } from '@supabase/supabase-js';
import { t } from './i18n.js';

// Частая ошибка — вставить адрес REST API (…/rest/v1/). Клиенту нужен корень проекта.
const URL = import.meta.env.VITE_SUPABASE_URL?.trim().replace(/\/(rest|auth)\/v1\/?$/, '').replace(/\/$/, '');
const ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const isConfigured = Boolean(URL && ANON_KEY);
const supabase = isConfigured ? createClient(URL, ANON_KEY) : null;
// Живой урок (src/live.js) работает через каналы Realtime этого же клиента: сессия входа уже в нём.
export const realtimeClient = () => supabase;

// Вход по телефону без СМС: номер превращается во внутренний логин-email.
// Упрощение MVP — СМС-подтверждение требует платного провайдера. Письма на этот адрес не отправляются.
const LOGIN_DOMAIN = 'phone.ai-stem-lab.local';

// Казахстанский номер: +7 XXX XXX XX XX, допускаем ввод с 8 в начале.
export function normalizePhone(raw) {
  let digits = String(raw ?? '').replace(/\D/g, '');
  if (digits.length === 11 && digits.startsWith('8')) digits = `7${digits.slice(1)}`;
  if (digits.length === 10) digits = `7${digits}`;
  return /^7\d{10}$/.test(digits) ? digits : null;
}

export function validateRegistration({ role, fullName, grade, phone, password, classCode }) {
  const errors = [];
  if (!['student', 'teacher'].includes(role)) errors.push(t('err.role'));
  const name = String(fullName ?? '').trim().replace(/\s+/g, ' ');
  if (name.length < 2 || name.length > 80 || !/^[\p{L}\s\-']+$/u.test(name)) errors.push(t('err.name'));
  const cls = String(grade ?? '').trim().toUpperCase().replace(/\s+/g, '');
  if (!/^(?:[1-9]|1[01])[А-ЯЁA-Z]?$/.test(cls)) errors.push(t('err.grade'));
  const phoneNorm = normalizePhone(phone);
  if (!phoneNorm) errors.push(t('err.phone'));
  if (String(password ?? '').length < 8) errors.push(t('err.password'));
  const code = String(classCode ?? '').trim().toUpperCase();
  if (code && !/^[A-Z0-9]{6}$/.test(code)) errors.push(t('err.code'));
  return { errors, data: { role, fullName: name, grade: cls, phone: phoneNorm, password, classCode: code } };
}

const emailFor = (phone) => `${phone}@${LOGIN_DOMAIN}`;

// join_class при неверном коде возвращает пустой ответ, а не ошибку: иначе откатилась бы запись попытки,
// по которой база ограничивает подбор кодов (миграция 003).
async function rpcJoin(code) {
  const rows = unwrap(await supabase.rpc('join_class', { p_code: code }));
  if (!rows?.length) throw new Error('class not found');
}

function humanError(error) {
  const msg = error?.message ?? String(error);
  if (/already registered|already exists/i.test(msg)) return t('err.registered');
  if (/invalid login credentials/i.test(msg)) return t('err.credentials');
  if (/class not found or no access/i.test(msg)) return t('err.noAccess');
  if (/class not found/i.test(msg)) return t('err.classNotFound');
  // Раньше проверки заданий: без миграции 004 учителю нужна именно она, а не 002
  if (/custom_lessons/i.test(msg) && /exist|schema cache/i.test(msg)) return t('err.noCustomLessons');
  if (/custom lessons limit/i.test(msg)) return t('err.customLimit');
  if (/relation .*assignments.* does not exist|assignments/i.test(msg) && /exist|schema cache/i.test(msg)) return t('err.noAssignments');
  if (/rate limit|too many/i.test(msg)) return t('err.rateLimit');
  if (/fetch|network/i.test(msg)) return t('err.network');
  if (/(signups|logins) are disabled/i.test(msg)) return t('err.disabled');
  if (/email confirmation/i.test(msg)) return t('err.emailConfirm');
  console.error('[account]', error);
  return t('err.generic');
}

async function run(fn) {
  try {
    return { ok: true, value: await fn() };
  } catch (error) {
    return { ok: false, error: humanError(error) };
  }
}

const unwrap = ({ data, error }) => {
  if (error) throw error;
  return data;
};

// Supabase отдаёт не больше «Max rows» строк за запрос и молча обрезает остальное,
// поэтому длинные выборки (история класса за год) дочитываем страницами — до пустой страницы,
// чтобы не зависеть от того, какой лимит выставлен в проекте.
const PAGE = 1000;
async function fetchAll(makeQuery) {
  const rows = [];
  for (;;) {
    const page = unwrap(await makeQuery().range(rows.length, rows.length + PAGE - 1));
    if (!page.length) return rows;
    rows.push(...page);
  }
}

// RLS не даёт ошибку, если строка чужая или уже удалена, — просто 0 затронутых строк.
// Без проверки учитель увидел бы «успех», хотя ничего не изменилось.
const requireRows = (data) => {
  if (!data?.length) throw new Error('class not found or no access');
  return data;
};

export function register(input) {
  return run(async () => {
    const { role, fullName, grade, phone, password, classCode } = input;
    let auth;
    const signUp = await supabase.auth.signUp({ email: emailFor(phone), password });
    if (signUp.error && /already registered|already exists/i.test(signUp.error.message)) {
      // Прошлая регистрация могла оборваться после создания аккаунта, но до профиля — даём её завершить.
      auth = unwrap(await supabase.auth.signInWithPassword({ email: emailFor(phone), password }));
      if (await loadProfile()) throw signUp.error;
    } else {
      auth = unwrap(signUp);
    }
    if (!auth.session) {
      // Включено подтверждение email — в настройках Supabase его нужно выключить (см. README).
      throw new Error('email confirmation is enabled');
    }
    unwrap(await supabase.from('profiles').insert({ id: auth.user.id, role, full_name: fullName, grade }));
    if (role === 'teacher') unwrap(await supabase.rpc('create_teacher_class', { p_name: grade }));
    if (role === 'student' && classCode) await rpcJoin(classCode);
    return loadProfile();
  });
}

export function login(phoneRaw, password) {
  return run(async () => {
    const phone = normalizePhone(phoneRaw);
    if (!phone) throw new Error('Invalid login credentials');
    unwrap(await supabase.auth.signInWithPassword({ email: emailFor(phone), password }));
    return loadProfile();
  });
}

export async function logout() {
  await supabase?.auth.signOut();
}

export function joinClass(code) {
  return run(async () => {
    await rpcJoin(code);
    return loadProfile();
  });
}

// Профиль текущего пользователя вместе с классом (для учителя — ещё и код класса).
export async function loadProfile() {
  if (!supabase) return null;
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return null;
  const profile = unwrap(await supabase.from('profiles').select('id, role, full_name, grade, class_id').eq('id', session.user.id).maybeSingle());
  if (!profile) return null;
  let klass = null;
  if (profile.role === 'teacher') {
    klass = unwrap(await supabase.from('classes').select('id, name, code').eq('teacher_id', profile.id).order('created_at').limit(1).maybeSingle());
  } else if (profile.class_id) {
    klass = unwrap(await supabase.from('classes').select('id, name').eq('id', profile.class_id).maybeSingle());
  }
  return { ...profile, class: klass };
}

export function saveResult(lessonId, stats) {
  return run(async () => unwrap(await supabase.from('results').insert({
    lesson_id: lessonId,
    hyp_ok: stats.hypOk,
    hyp_total: stats.hypTotal,
    q_ok: stats.qOk,
    q_total: stats.qTotal,
  })));
}

export function loadMyResults(userId) {
  return run(async () => unwrap(await supabase.from('results').select('lesson_id, completed_at').eq('user_id', userId)));
}

// Для учителя: ученики его класса и их результаты (RLS сама отсекает чужих).
export function loadClassResults(classId) {
  return run(async () => {
    const students = unwrap(await supabase.from('profiles').select('id, full_name, grade').eq('class_id', classId).eq('role', 'student').order('full_name'));
    const ids = students.map((s) => s.id);
    const results = ids.length
      ? await fetchAll(() => supabase.from('results').select('user_id, lesson_id, hyp_ok, hyp_total, q_ok, q_total, completed_at').in('user_id', ids).order('completed_at').order('id'))
      : [];
    return { students, results };
  });
}

// ---------- Ученик: полные результаты и задания ----------

export function loadMyScores(userId) {
  return run(() => fetchAll(() => supabase.from('results')
    .select('lesson_id, hyp_ok, hyp_total, q_ok, q_total, completed_at')
    .eq('user_id', userId).order('completed_at').order('id')));
}

export function loadClassAssignments(classId) {
  return run(async () => unwrap(await supabase.from('assignments')
    .select('id, lesson_id, due_date, created_at').eq('class_id', classId).order('created_at')));
}

export function leaveClass() {
  return run(async () => {
    unwrap(await supabase.rpc('leave_class'));
    return loadProfile();
  });
}

// ---------- Учитель: классы и задания ----------

export function loadTeacherClasses(teacherId) {
  return run(async () => unwrap(await supabase.from('classes')
    .select('id, name, code, created_at').eq('teacher_id', teacherId).order('created_at')));
}

export function createClass(name) {
  return run(async () => unwrap(await supabase.rpc('create_teacher_class', { p_name: String(name).trim().slice(0, 10) })));
}

export function renameClass(classId, name) {
  return run(async () => requireRows(unwrap(await supabase.from('classes')
    .update({ name: String(name).trim().slice(0, 10) }).eq('id', classId).select('id'))));
}

export function deleteClass(classId) {
  return run(async () => requireRows(unwrap(await supabase.from('classes').delete().eq('id', classId).select('id'))));
}

// Старый код перестаёт работать — так учитель закрывает класс от тех, кому код утёк
// или кого он убрал из класса. Кто уже в классе, остаётся.
export function regenerateCode(classId) {
  return run(async () => unwrap(await supabase.rpc('regenerate_class_code', { p_class: classId })));
}

export function assignLesson(classId, lessonId, dueDate) {
  return run(async () => unwrap(await supabase.from('assignments')
    .upsert({ class_id: classId, lesson_id: lessonId, due_date: dueDate || null }, { onConflict: 'class_id,lesson_id' })));
}

export function unassign(assignmentId) {
  return run(async () => unwrap(await supabase.from('assignments').delete().eq('id', assignmentId)));
}

export function removeStudent(studentId) {
  return run(async () => unwrap(await supabase.rpc('remove_student', { p_student: studentId })));
}

// ---------- Работы из конструктора (миграция 004) ----------

const CUSTOM_COLUMNS = 'id, lesson_id, title, subject, grade, lang, lesson, created_at';

// Учителю RLS отдаёт его работы, ученику — работы учителя его класса.
// lessonIds — только нужные (ученику — назначенные), чтобы не тянуть лишнее.
export function loadCustomLessons(lessonIds = null) {
  return run(async () => {
    let query = supabase.from('custom_lessons').select(CUSTOM_COLUMNS).order('created_at', { ascending: false }).limit(200);
    if (lessonIds) query = query.in('lesson_id', lessonIds);
    return unwrap(await query);
  });
}

export function saveCustomLesson(lesson) {
  return run(async () => unwrap(await supabase.from('custom_lessons')
    .insert({ title: lesson.title, subject: lesson.subject, grade: lesson.grade, lang: lesson.lang, lesson })
    .select(CUSTOM_COLUMNS).single()));
}

// Вместе с работой снимаем её задания: иначе у учеников осталось бы задание, которое нечем открыть.
// Результаты учеников остаются — это история их работы.
export function deleteCustomLesson(row) {
  return run(async () => {
    requireRows(unwrap(await supabase.from('custom_lessons').delete().eq('id', row.id).select('id')));
    unwrap(await supabase.from('assignments').delete().eq('lesson_id', row.lesson_id));
  });
}
