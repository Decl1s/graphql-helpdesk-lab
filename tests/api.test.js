import test from 'node:test';
import assert from 'node:assert/strict';
import { listen } from '../src/app.js';

async function fixture(t, trainingBug = false) {
  const app = await listen({ trainingBug });
  t.after(() => app.close());
  return async (query, variables = {}, actor = 'customer-a') => {
    const response = await fetch(`${app.baseUrl}/graphql`, { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/graphql-response+json', ...(actor ? { 'X-Demo-Actor': actor } : {}) }, body: JSON.stringify({ query, variables }) });
    return { status: response.status, body: await response.json() };
  };
}

test('Я получаю только свои обращения и ограничиваю список', async t => {
  const send = await fixture(t);
  const { body } = await send('query { tickets { id owner { id } } }');
  assert.deepEqual(body.data.tickets.map(x => x.id), ['T-1001', 'T-1003']);
  for (const first of [0, 21, null]) {
    const bad = await send('query($first: Int) { tickets(first: $first) { id } }', { first });
    assert.equal(bad.body.errors[0].extensions.code, 'BAD_USER_INPUT');
  }
});
test('Я сохраняю частичный ответ и путь ошибки приватного поля', async t => {
  const send = await fixture(t);
  const { status, body } = await send('query { ticket(id:"T-1001") { id internalNote } }');
  assert.equal(status, 200);
  assert.equal(body.data.ticket.id, 'T-1001');
  assert.equal(body.data.ticket.internalNote, null);
  assert.deepEqual(body.errors[0].path, ['ticket', 'internalNote']);
  assert.equal(body.errors[0].extensions.code, 'FORBIDDEN');
});
test('Я отклоняю чужое обращение, неизвестную роль и отсутствующую роль', async t => {
  const send = await fixture(t);
  assert.equal((await send('query { ticket(id:"T-1002") { id } }')).body.errors[0].extensions.code, 'FORBIDDEN');
  for (const actor of [null, 'unknown', 'constructor', '__proto__']) {
    assert.equal((await send('query { me { id } }', {}, actor)).body.errors[0].extensions.code, 'UNAUTHENTICATED');
  }
});
test('Я проверяю границы title и description без расходования ID на отказ', async t => {
  const send = await fixture(t);
  const query = 'mutation($input: CreateTicketInput!) { createTicket(input:$input) { ticket { id title } userErrors { code } } }';
  for (const title of ['', 'ab', 'x'.repeat(81)]) {
    assert.equal((await send(query, { input: { title, description: '' } })).body.data.createTicket.userErrors[0].code, 'TITLE_INVALID');
  }
  assert.equal((await send(query, { input: { title: 'abc', description: 'x'.repeat(501) } })).body.data.createTicket.userErrors[0].code, 'DESCRIPTION_TOO_LONG');
  const created = await send(query, { input: { title: '  abc  ', description: 'x'.repeat(500) } });
  assert.equal(created.body.data.createTicket.ticket.id, 'T-2001');
  assert.equal(created.body.data.createTicket.ticket.title, 'abc');
  assert.equal((await send(query, { input: { title: 'x'.repeat(80), description: '' } })).body.data.createTicket.userErrors.length, 0);
});
test('Я проверяю автомат статусов и отсутствие записи после отказа', async t => {
  const send = await fixture(t);
  const query = 'mutation($input: ChangeStatusInput!) { changeStatus(input:$input) { ticket { status } userErrors { code } } }';
  const change = (id, status, actor = 'staff') => send(query, { input: { id, status } }, actor);
  assert.equal((await change('T-1001', 'IN_PROGRESS', 'customer-a')).body.errors[0].extensions.code, 'FORBIDDEN');
  assert.equal((await change('T-9999', 'IN_PROGRESS')).body.data.changeStatus.userErrors[0].code, 'TICKET_NOT_FOUND');
  for (const status of ['IN_PROGRESS', 'RESOLVED']) assert.equal((await change('T-1001', status)).body.data.changeStatus.ticket.status, status);
  assert.equal((await change('T-1001', 'OPEN')).body.data.changeStatus.userErrors[0].code, 'BAD_TRANSITION');
  assert.equal((await send('query { ticket(id:"T-1001") { status } }')).body.data.ticket.status, 'RESOLVED');
});
test('Я отличаю ошибку GraphQL-контракта от выполнения mutation', async t => {
  const send = await fixture(t);
  for (const [query, variables] of [
    ['query { health { unknown } }', {}],
    ['query($id:ID!) { ticket(id:$id) { id } }', { id: true }],
    ['mutation($input:ChangeStatusInput!) { changeStatus(input:$input) { ticket { id } } }', { input: { id: 'T-1001', status: 'ARCHIVED' } }],
  ]) {
    const result = await send(query, variables, 'staff');
    assert.equal(result.status, 400);
    assert.equal(result.body.data, undefined);
    assert.ok(result.body.errors.length);
  }
  assert.equal((await send('query { ticket(id:"T-1001") { status } }')).body.data.ticket.status, 'OPEN');
});
test('Я сбрасываю состояние только сотрудником и не делю его между серверами', async t => {
  const send = await fixture(t);
  assert.equal((await send('mutation { resetDemo { count } }')).body.errors[0].extensions.code, 'FORBIDDEN');
  await send('mutation { changeStatus(input:{id:"T-1001",status:IN_PROGRESS}) { ticket { id } } }', {}, 'staff');
  const other = await fixture(t);
  assert.equal((await other('query { ticket(id:"T-1001") { status } }')).body.data.ticket.status, 'OPEN');
  assert.equal((await send('mutation { resetDemo { count } }', {}, 'staff')).body.data.resetDemo.count, 3);
  assert.equal((await send('query { ticket(id:"T-1001") { status } }')).body.data.ticket.status, 'OPEN');
});
test('Я воспроизвожу намеренный дефект только явным флагом', async t => {
  const send = await fixture(t, true);
  const { body } = await send('mutation { changeStatus(input:{id:"T-1001",status:IN_PROGRESS}) { ticket { status } } }');
  assert.equal(body.data.changeStatus.ticket.status, 'IN_PROGRESS');
  assert.equal(body.errors, undefined);
});
