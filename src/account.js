// Аккаунты и результаты через Supabase. Ключ anon публичный по задумке Supabase:
// доступ к данным ограничивают политики RLS в supabase/schema.sql, а не секретность ключа.

import { createClient } from '@supabase/supabase-js';

// Частая ошибка — вставить адрес REST API (…/rest/v1/). Клиенту нужен корень проекта.
const URL = import.meta.env.VITE_SUPABASE_URL?.trim().replace(/\/(rest|auth)\/v1\/?$/, '').replace(/\/$/, '');
const ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const isConfigured = Boolean(URL && ANON_KEY);
const supabase = isConfigured ? createClient(URL, ANON_KEY) : null;

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
  if (!['student', 'teacher'].includes(role)) errors.push('Выберите роль.');
  const name = String(fullName ?? '').trim().replace(/\s+/g, ' ');
  if (name.length < 2 || name.length > 80 || !/^[\p{L}\s\-']+$/u.test(name)) errors.push('Укажите имя и фамилию (только буквы).');
  const cls = String(grade ?? '').trim().toUpperCase().replace(/\s+/g, '');
  if (!/^(?:[1-9]|1[01])[А-ЯЁA-Z]?$/.test(cls)) errors.push('Класс в формате «8А» или «9».');
  const phoneNorm = normalizePhone(phone);
  if (!phoneNorm) errors.push('Номер телефона в формате +7 7XX XXX XX XX.');
  if (String(password ?? '').length < 8) errors.push('Пароль — не короче 8 символов.');
  const code = String(classCode ?? '').trim().toUpperCase();
  if (code && !/^[A-Z0-9]{6}$/.test(code)) errors.push('Код класса — 6 символов (буквы и цифры).');
  return { errors, data: { role, fullName: name, grade: cls, phone: phoneNorm, password, classCode: code } };
}

const emailFor = (phone) => `${phone}@${LOGIN_DOMAIN}`;

function humanError(error) {
  const msg = error?.message ?? String(error);
  if (/already registered|already exists/i.test(msg)) return 'Этот номер уже зарегистрирован. Войдите.';
  if (/invalid login credentials/i.test(msg)) return 'Неверный номер или пароль.';
  if (/class not found/i.test(msg)) return 'Класс с таким кодом не найден. Проверьте код у учителя.';
  if (/relation .*assignments.* does not exist|assignments/i.test(msg) && /exist|schema cache/i.test(msg)) return 'В базе нет таблицы заданий: выполните supabase/002_classes_assignments.sql в Supabase.';
  if (/rate limit|too many/i.test(msg)) return 'Слишком много попыток. Подождите минуту.';
  if (/fetch|network/i.test(msg)) return 'Нет связи с сервером. Проверьте интернет.';
  if (/(signups|logins) are disabled/i.test(msg)) return 'Вход отключён в настройках Supabase: включите провайдер Email (Authentication → Sign In / Providers).';
  if (/email confirmation/i.test(msg)) return 'Регистрация не настроена: отключите подтверждение email в Supabase (см. README).';
  console.error('[account]', error);
  return 'Не удалось выполнить действие. Попробуйте ещё раз.';
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
    if (role === 'student' && classCode) unwrap(await supabase.rpc('join_class', { p_code: classCode }));
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
    unwrap(await supabase.rpc('join_class', { p_code: code }));
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
      ? unwrap(await supabase.from('results').select('user_id, lesson_id, hyp_ok, hyp_total, q_ok, q_total, completed_at').in('user_id', ids).order('completed_at'))
      : [];
    return { students, results };
  });
}

// ---------- Ученик: полные результаты и задания ----------

export function loadMyScores(userId) {
  return run(async () => unwrap(await supabase.from('results')
    .select('lesson_id, hyp_ok, hyp_total, q_ok, q_total, completed_at')
    .eq('user_id', userId).order('completed_at')));
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
  return run(async () => unwrap(await supabase.from('classes').update({ name: String(name).trim().slice(0, 10) }).eq('id', classId)));
}

export function deleteClass(classId) {
  return run(async () => unwrap(await supabase.from('classes').delete().eq('id', classId)));
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
