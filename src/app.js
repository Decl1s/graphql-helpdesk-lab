import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { GraphQLError } from 'graphql';
import { createSchema, createYoga } from 'graphql-yoga';

const users = Object.freeze({
  'customer-a': { id: 'customer-a', label: 'Демо-клиент А', role: 'CUSTOMER' },
  'customer-b': { id: 'customer-b', label: 'Демо-клиент Б', role: 'CUSTOMER' },
  staff: { id: 'staff', label: 'Демо-сотрудник', role: 'STAFF' },
});
const error = (code, message) => new GraphQLError(message, { extensions: { code } });
const rejected = (code, field, message) => ({ ticket: null, userErrors: [{ code, field, message }] });

// Я создаю отдельное хранилище для каждого экземпляра стенда: проверки не делят состояние.
export function createApp({ trainingBug = false } = {}) {
  let tickets;
  let nextId;
  function reset() {
    tickets = new Map([
      ['T-1001', { id: 'T-1001', title: 'Не открывается учебный отчёт', description: 'Синтетический пример А', status: 'OPEN', ownerId: 'customer-a', internalNote: 'Проверить демо-конфигурацию' }],
      ['T-1002', { id: 'T-1002', title: 'Вопрос о демо-доставке', description: 'Синтетический пример Б', status: 'IN_PROGRESS', ownerId: 'customer-b', internalNote: 'Внутренняя учебная заметка' }],
      ['T-1003', { id: 'T-1003', title: 'Учебный доступ восстановлен', description: 'Синтетический пример В', status: 'RESOLVED', ownerId: 'customer-a', internalNote: 'Закрыто в демо-наборе' }],
    ]);
    nextId = 2001;
    return { count: tickets.size };
  }
  reset();
  function actor(context) {
    if (!context.actor) throw error('UNAUTHENTICATED', 'Я не выбрал известную демо-роль');
    return context.actor;
  }
  function staff(context) {
    const user = actor(context);
    if (user.role !== 'STAFF') throw error('FORBIDDEN', 'Действие доступно демо-сотруднику');
    return user;
  }
  const resolvers = {
    Query: {
      health: () => ({ status: 'ok', version: '0.1.1' }),
      me: (_, args, context) => actor(context),
      ticket: (_, { id }, context) => {
        const user = actor(context);
        const ticket = tickets.get(id);
        if (ticket && user.role !== 'STAFF' && ticket.ownerId !== user.id) {
          throw error('FORBIDDEN', 'Я не могу читать чужое демо-обращение');
        }
        return ticket ?? null;
      },
      tickets: (_, { status, first }, context) => {
        const user = actor(context);
        if (first < 1 || first > 20) throw error('BAD_USER_INPUT', 'first должен быть от 1 до 20');
        return [...tickets.values()].filter(t => (user.role === 'STAFF' || t.ownerId === user.id) && (!status || t.status === status)).slice(0, first);
      },
    },
    Ticket: {
      owner: ticket => users[ticket.ownerId],
      internalNote: (ticket, args, context) => {
        staff(context);
        return ticket.internalNote;
      },
    },
    Mutation: {
      resetDemo: (_, args, context) => { staff(context); return reset(); },
      createTicket: (_, { input }, context) => {
        const user = actor(context);
        const title = input.title.trim();
        if (title.length < 3 || title.length > 80) return rejected('TITLE_INVALID', 'title', 'Я ожидаю от 3 до 80 символов после удаления пробелов');
        if (input.description.length > 500) return rejected('DESCRIPTION_TOO_LONG', 'description', 'Я ожидаю не более 500 символов');
        const ticket = { id: `T-${nextId++}`, title, description: input.description, status: 'OPEN', ownerId: user.id, internalNote: 'Создано в учебном стенде' };
        tickets.set(ticket.id, ticket);
        return { ticket, userErrors: [] };
      },
      changeStatus: (_, { input }, context) => {
        // Я включаю намеренный дефект только отдельным явным флагом для упражнения.
        if (trainingBug) actor(context); else staff(context);
        const ticket = tickets.get(input.id);
        if (!ticket) return rejected('TICKET_NOT_FOUND', 'id', 'Демо-обращение не найдено');
        const transitions = { OPEN: 'IN_PROGRESS', IN_PROGRESS: 'RESOLVED' };
        if (transitions[ticket.status] !== input.status) return rejected('BAD_TRANSITION', 'status', 'Я разрешаю OPEN → IN_PROGRESS → RESOLVED');
        ticket.status = input.status;
        return { ticket, userErrors: [] };
      },
    },
  };
  const yoga = createYoga({
    schema: createSchema({ typeDefs: readFileSync(new URL('./schema.graphql', import.meta.url), 'utf8'), resolvers }),
    context: ({ request }) => {
      const key = request.headers.get('x-demo-actor');
      return { actor: Object.hasOwn(users, key) ? users[key] : null };
    },
    graphqlEndpoint: '/graphql', graphiql: false, landingPage: false,
    cors: false, maskedErrors: true, logging: false,
  });
  return createServer(yoga);
}

export async function listen({ port = 0, trainingBug = false } = {}) {
  const server = createApp({ trainingBug });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(port, '127.0.0.1', resolve); });
  return { server, baseUrl: `http://127.0.0.1:${server.address().port}`, close: () => new Promise((resolve, reject) => server.close(err => err ? reject(err) : resolve())) };
}
