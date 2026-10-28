// Я импортирую готовую функцию запуска; здесь я не дублирую бизнес-правила.
import { listen } from './app.js';

// Я убираю первые два элемента argv: путь Node и путь этого файла. Остаются мои флаги.
const args = process.argv.slice(2);
// Я отклоняю неизвестные флаги, чтобы опечатка не включила другой режим молча.
if (args.some(arg => arg !== '--training-bug')) {
  console.error('Я поддерживаю только необязательный флаг --training-bug');
  // Я ставлю ненулевой код для ошибки аргументов. Это полезно для автоматического запуска.
  process.exitCode = 2;
} else {
  try {
    // Я выбираю фиксированный порт 8767 для Bruno Local; --training-bug включает учебную ошибку.
    const app = await listen({ port: 8767, trainingBug: args.includes('--training-bug') });
    console.log(`Учебный GraphQL: ${app.baseUrl}/graphql`);
    console.log('Я выбираю роль заголовком X-Demo-Actor. Это не настоящая аутентификация.');
    if (args.includes('--training-bug')) console.log('Я включил намеренный дефект прав: ожидаю красную регрессию.');
    // Я реагирую на Ctrl+C и просьбу завершения: закрываю сервер, а не оставляю его работать.
    for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => app.close().catch(() => { process.exitCode = 1; }));
  // Я показываю понятную причину отказа запуска. EADDRINUSE означает уже занятый порт.
  } catch (err) {
    console.error(err.code === 'EADDRINUSE' ? 'Порт 8767 занят. Я останавливаю предыдущий стенд и повторяю запуск.' : `Я не запустил стенд: ${err.message}`);
    process.exitCode = 1;
  }
}
