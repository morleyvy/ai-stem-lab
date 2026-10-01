// Обратная связь из подвала: идея, ошибка или другое. Отзывы пишутся в таблицу feedback
// (миграция supabase/007_feedback.sql), читает их команда в панели Supabase.
// Контакты не спрашиваем: пользователи — школьники, лишние личные данные нам не нужны.
// Если человек вошёл, база сама подставит его id — по нему можно найти профиль.

export const FEEDBACK_KINDS = ['idea', 'bug', 'other'];
export const FEEDBACK_MIN = 5;
export const FEEDBACK_MAX = 1000;

// Те же ограничения стоят в базе — здесь они ради понятной ошибки до отправки
export function validateFeedback({ kind, message, screen }) {
  const text = String(message ?? '').trim().replace(/\n{3,}/g, '\n\n');
  if (!FEEDBACK_KINDS.includes(kind)) return { error: 'fb.errKind' };
  if (text.length < FEEDBACK_MIN) return { error: 'fb.errShort' };
  if (text.length > FEEDBACK_MAX) return { error: 'fb.errLong' };
  return { data: { kind, message: text, screen: typeof screen === 'string' && /^[a-z]{1,20}$/.test(screen) ? screen : 'other' } };
}

export function initFeedback({ $, t, lang, toast, send, currentScreen }) {
  const dialog = $('feedbackDialog');
  const form = $('feedbackForm');
  const error = $('feedbackError');
  const counter = $('feedbackCount');
  const submit = form.querySelector('button[type=submit]');

  const updateCount = () => {
    counter.textContent = t('fb.count', { n: form.message.value.length, max: FEEDBACK_MAX });
  };
  form.message.maxLength = FEEDBACK_MAX;
  form.message.addEventListener('input', () => {
    updateCount();
    error.hidden = true;
  });

  function open() {
    error.hidden = true;
    updateCount();
    dialog.showModal();
    form.message.focus();
  }

  $('feedbackClose').addEventListener('click', () => dialog.close());
  // Клик по затемнению вокруг окна закрывает его, как в других окнах сайта
  dialog.addEventListener('click', (e) => {
    if (e.target === dialog) dialog.close();
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const { data, error: key } = validateFeedback({
      kind: form.kind.value,
      message: form.message.value,
      screen: currentScreen(),
    });
    if (key) {
      error.textContent = t(key, { min: FEEDBACK_MIN, max: FEEDBACK_MAX });
      error.hidden = false;
      return;
    }
    if (!navigator.onLine) {
      error.textContent = t('fb.errOffline');
      error.hidden = false;
      return;
    }
    submit.disabled = true;
    const res = await send({ ...data, lang });
    submit.disabled = false;
    if (!res.ok) {
      error.textContent = res.error;
      error.hidden = false;
      return;
    }
    form.reset();
    dialog.close();
    toast(t('fb.thanks'));
  });

  return { open };
}
