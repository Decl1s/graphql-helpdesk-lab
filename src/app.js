// Я беру HTTP-сервер из самого Node.js: он принимает сетевой запрос и передаёт его Yoga.
import { createServer } from 'node:http';
// Я читаю текст схемы с диска один раз при создании стенда, а не при каждом запросе.
import { readFileSync } from 'node:fs';
// Я использую GraphQLError для ожидаемых отказов поля; Yoga оформляет их в errors ответа.
import { GraphQLError } from 'graphql';
// Я поручаю библиотеке разбор GraphQL и HTTP. Своими функциями я описываю только правила обращений.
import { createSchema, createYoga } from 'graphql-yoga';

// Я задаю три вымышленные персоны. Ключ слева совпадает со значением заголовка X-Demo-Actor.
const users = Object.freeze({
  'customer-a': { id: 'customer-a', label: 'Демо-клиент А', role: 'CUSTOMER' },
  'customer-b': { id: 'customer-b', label: 'Демо-клиент Б', role: 'CUSTOMER' },
  staff: { id: 'staff', label: 'Демо-сотрудник', role: 'STAFF' },
});
// Я добавляю машинный code к сообщению. В проверках я сравниваю code, а не весь русский текст.
const error = (code, message) => new GraphQLError(message, { extensions: { code } });
// Я возвращаю ожидаемый бизнес-отказ внутри data: ticket отсутствует, userErrors объясняет причину.
const rejected = (code, field, message) => ({ ticket: null, userErrors: [{ code, field, message }] });

// Я создаю отдельное хранилище для каждого экземпляра стенда: проверки не делят состояние.
// Я создаю независимый экземпляр приложения. Значение trainingBug по умолчанию false.
export function createApp({ trainingBug = false } = {}) {
  // Я храню обращения в Map внутри этой функции. Другой экземпляр получает другой Map.
  let tickets;
  // Я храню счётчик следующего ID; он сбрасывается вместе с набором.
  let nextId;
  // Я восстанавливаю три исходных обращения. Это удаляет созданные мной демо-записи.
  function reset() {
    // Я использую ключ → объект, чтобы получить обращение через tickets.get(id).
    tickets = new Map([
      ['T-1001', { id: 'T-1001', title: 'Не открывается учебный отчёт', description: 'Синтетический пример А', status: 'OPEN', ownerId: 'customer-a', internalNote: 'Проверить демо-конфигурацию' }],
      ['T-1002', { id: 'T-1002', title: 'Вопрос о демо-доставке', description: 'Синтетический пример Б', status: 'IN_PROGRESS', ownerId: 'customer-b', internalNote: 'Внутренняя учебная заметка' }],
      ['T-1003', { id: 'T-1003', title: 'Учебный доступ восстановлен', description: 'Синтетический пример В', status: 'RESOLVED', ownerId: 'customer-a', internalNote: 'Закрыто в демо-наборе' }],
    ]);
    // Я начинаю новые ID с T-2001. Поэтому запросы коллекции воспроизводимы после reset.
    nextId = 2001;
    return { count: tickets.size };
  }
  // Я подготавливаю данные сразу при запуске, ещё до первого сетевого запроса.
  reset();
  // Я проверяю наличие известной персоны в контексте текущего запроса. Это учебная имитация входа.
  function actor(context) {
    // Я прерываю выполнение поля, если персону не выбрал. throw отличается от return с userErrors.
    if (!context.actor) throw error('UNAUTHENTICATED', 'Я не выбрал известную демо-роль');
    return context.actor;
  }
  // Я сначала проверяю персону, затем требую роль STAFF. Эту функцию я переиспользую для закрытых действий.
  function staff(context) {
    const user = actor(context);
    if (user.role !== 'STAFF') throw error('FORBIDDEN', 'Действие доступно демо-сотруднику');
    return user;
  }
  // Я связываю имена полей схемы с функциями. Так GraphQL знает, где взять значение каждого поля.
  const resolvers = {
    // Я собираю здесь операции чтения. Я не изменяю обращения в Query.
    Query: {
      // Я возвращаю доступность без выбора роли; это первый простой запрос коллекции.
      health: () => ({ status: 'ok', version: '0.1.0' }),
      // Я возвращаю текущую демо-персону. Неиспользуемые аргументы называю _ и args.
      me: (_, args, context) => actor(context),
      // Я получаю id из аргументов запроса, а персону — из context. Это разные источники данных.
      ticket: (_, { id }, context) => {
        const user = actor(context);
        // Я ищу по ключу. Если записи нет, Map.get вернёт undefined.
        const ticket = tickets.get(id);
        // Я запрещаю чтение существующей чужой записи; сотрудник проходит эту проверку.
        if (ticket && user.role !== 'STAFF' && ticket.ownerId !== user.id) {
          throw error('FORBIDDEN', 'Я не могу читать чужое демо-обращение');
        }
        // Я превращаю отсутствие записи в null. Для неизвестного ID я не создаю ошибку.
        return ticket ?? null;
      },
      // Я сначала фильтрую по владельцу и статусу, затем применяю ограничение first.
      tickets: (_, { status, first }, context) => {
        const user = actor(context);
        // Я отклоняю first вне 1–20; явный null тоже отклоняется из-за сравнения с 1.
        if (first < 1 || first > 20) throw error('BAD_USER_INPUT', 'first должен быть от 1 до 20');
        // Я превращаю значения Map в массив, оставляю подходящие объекты и беру первые first.
        return [...tickets.values()].filter(t => (user.role === 'STAFF' || t.ownerId === user.id) && (!status || t.status === status)).slice(0, first);
      },
    },
    // Я описываю вычисление вложенных полей Ticket отдельно от поиска самого обращения.
    Ticket: {
      // Я превращаю ownerId из хранилища в объект DemoUser, который можно запросить вложенно.
      owner: ticket => users[ticket.ownerId],
      // Я повторно проверяю право на конкретное поле: доступ к своему ticket не даёт доступ к заметке.
      internalNote: (ticket, args, context) => {
        staff(context);
        return ticket.internalNote;
      },
    },
    // Я собираю здесь действия, меняющие состояние: reset, createTicket и changeStatus.
    Mutation: {
      // Я разрешаю сброс только сотруднику. В коллекции это подготовка чистого начала.
      resetDemo: (_, args, context) => { staff(context); return reset(); },
      // Я беру input, проверяю персону, затем бизнес-ограничения до записи в Map.
      createTicket: (_, { input }, context) => {
        const user = actor(context);
        // Я удаляю пробелы только по краям title. Сам input от этого не переписываю.
        const title = input.title.trim();
        // Я проверяю длину уже очищенного title; неудачный ввод ещё не расходует новый ID.
        if (title.length < 3 || title.length > 80) return rejected('TITLE_INVALID', 'title', 'Я ожидаю от 3 до 80 символов после удаления пробелов');
        // Я ограничиваю description 500 кодовыми единицами UTF-16. Эмодзи может занимать две.
        if (input.description.length > 500) return rejected('DESCRIPTION_TOO_LONG', 'description', 'Я ожидаю не более 500 символов');
        // Я создаю объект; nextId++ использует текущее число и увеличивает счётчик на единицу.
        const ticket = { id: `T-${nextId++}`, title, description: input.description, status: 'OPEN', ownerId: user.id, internalNote: 'Создано в учебном стенде' };
        // Я сохраняю объект в память. Только здесь создание начинает менять хранилище.
        tickets.set(ticket.id, ticket);
        return { ticket, userErrors: [] };
      },
      // Я проверяю право до поиска и изменения. У клиента не должно быть возможности менять статус.
      changeStatus: (_, { input }, context) => {
        // Я включаю намеренный дефект только отдельным явным флагом для упражнения.
        // Я намеренно пропускаю проверку STAFF только в режиме дефекта. В обычном режиме вызываю staff.
        if (trainingBug) actor(context); else staff(context);
        // Я ищу обращение после проверки права. Отсутствие здесь — бизнес-отказ mutation.
        const ticket = tickets.get(input.id);
        if (!ticket) return rejected('TICKET_NOT_FOUND', 'id', 'Демо-обращение не найдено');
        // Я записал разрешённый следующий статус для каждого незавершённого состояния.
        const transitions = { OPEN: 'IN_PROGRESS', IN_PROGRESS: 'RESOLVED' };
        // Я сверяю именно переход, а не просто наличие enum. RESOLVED не имеет следующего статуса.
        if (transitions[ticket.status] !== input.status) return rejected('BAD_TRANSITION', 'status', 'Я разрешаю OPEN → IN_PROGRESS → RESOLVED');
        // Я меняю объект только после всех проверок. До этой строки отказ не должен менять состояние.
        ticket.status = input.status;
        return { ticket, userErrors: [] };
      },
    },
  };
  // Я собираю GraphQL-обработчик и передаю ему схему, резолверы и способ выбора персоны.
  const yoga = createYoga({
    // Я читаю SDL относительно самого app.js: запуск из другой папки не меняет расположение схемы.
    schema: createSchema({ typeDefs: readFileSync(new URL('./schema.graphql', import.meta.url), 'utf8'), resolvers }),
    // Я создаю контекст заново для каждого HTTP-запроса. Туда я кладу выбранную персону.
    context: ({ request }) => {
      // Я читаю HTTP-заголовок; его имя не зависит от регистра. Значение роли сравнивается точно.
      const key = request.headers.get('x-demo-actor');
      // Я принимаю только собственные ключи users; constructor и __proto__ не становятся ролями.
      return { actor: Object.hasOwn(users, key) ? users[key] : null };
    },
    // Я принимаю GraphQL по /graphql. Встроенные страницы я отключил: мой клиент — Bruno.
    graphqlEndpoint: '/graphql', graphiql: false, landingPage: false,
    // Я не включаю CORS, маскирую неожиданные ошибки и отключаю шумные логи; это не полноценная защита API.
    cors: false, maskedErrors: true, logging: false,
  });
  // Я возвращаю сервер, который ещё не слушает порт. Его запускает функция listen ниже.
  return createServer(yoga);
}

// Я запускаю стенд. port=0 означает: операционная система выбирает свободный локальный порт.
export async function listen({ port = 0, trainingBug = false } = {}) {
  const server = createApp({ trainingBug });
  // Я жду успешного listen или ошибки. 127.0.0.1 ограничивает адрес прослушивания этой машиной.
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(port, '127.0.0.1', resolve); });
  // Я возвращаю адрес и функцию close. Вызывающий код обязан завершить временный сервер.
  return { server, baseUrl: `http://127.0.0.1:${server.address().port}`, close: () => new Promise((resolve, reject) => server.close(err => err ? reject(err) : resolve())) };
}
