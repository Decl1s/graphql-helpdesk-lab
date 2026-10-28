import { listen } from './app.js';

const args = process.argv.slice(2);
if (args.some(arg => arg !== '--training-bug')) {
  console.error('Я поддерживаю только необязательный флаг --training-bug');
  process.exitCode = 2;
} else {
  try {
    const app = await listen({ port: 8767, trainingBug: args.includes('--training-bug') });
    console.log(`Учебный GraphQL: ${app.baseUrl}/graphql`);
    console.log('Я выбираю роль заголовком X-Demo-Actor. Это не настоящая аутентификация.');
    if (args.includes('--training-bug')) console.log('Я включил намеренный дефект прав: ожидаю красную регрессию.');
    for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => app.close().catch(() => { process.exitCode = 1; }));
  } catch (err) {
    console.error(err.code === 'EADDRINUSE' ? 'Порт 8767 занят. Я останавливаю предыдущий стенд и повторяю запуск.' : `Я не запустил стенд: ${err.message}`);
    process.exitCode = 1;
  }
}
