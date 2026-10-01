// Проверка отзыва до отправки: те же ограничения стоят в базе (supabase/007_feedback.sql),
// расхождение означало бы непонятную ошибку сервера вместо подсказки в форме
import test from 'node:test';
import assert from 'node:assert/strict';
import { FEEDBACK_MAX, validateFeedback } from '../src/feedback.js';

test('нормальный отзыв проходит и обрезается по краям', () => {
  const { data, error } = validateFeedback({ kind: 'idea', message: '  Добавьте опыт с магнитом  ', screen: 'menu' });
  assert.equal(error, undefined);
  assert.deepEqual(data, { kind: 'idea', message: 'Добавьте опыт с магнитом', screen: 'menu' });
});

test('вид отзыва — только из списка', () => {
  assert.equal(validateFeedback({ kind: 'spam', message: 'Текст отзыва', screen: 'menu' }).error, 'fb.errKind');
  assert.equal(validateFeedback({ kind: undefined, message: 'Текст отзыва', screen: 'menu' }).error, 'fb.errKind');
});

test('слишком короткий и слишком длинный текст', () => {
  assert.equal(validateFeedback({ kind: 'bug', message: '  ок  ', screen: 'menu' }).error, 'fb.errShort');
  assert.equal(validateFeedback({ kind: 'bug', message: 'а'.repeat(FEEDBACK_MAX + 1), screen: 'menu' }).error, 'fb.errLong');
  assert.equal(validateFeedback({ kind: 'bug', message: 'а'.repeat(FEEDBACK_MAX), screen: 'menu' }).error, undefined);
});

test('пустые строки подряд схлопываются', () => {
  const { data } = validateFeedback({ kind: 'other', message: 'раз\n\n\n\n\nдва', screen: 'menu' });
  assert.equal(data.message, 'раз\n\nдва');
});

test('неизвестный экран заменяется на other — база отклонила бы его', () => {
  assert.equal(validateFeedback({ kind: 'idea', message: 'Текст отзыва', screen: 'Menu<script>' }).data.screen, 'other');
  assert.equal(validateFeedback({ kind: 'idea', message: 'Текст отзыва', screen: undefined }).data.screen, 'other');
});
