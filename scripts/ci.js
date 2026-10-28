import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { runCollection } from './run-collection.js';
import { packageRelease } from './package-release.js';

const unit = spawnSync(process.execPath, ['--test', 'tests/api.test.js'], { stdio: 'inherit' });
assert.equal(unit.status, 0, 'Я ожидаю зелёные API-проверки');
function summary(report) {
  const results = report.flatMap(x => x.results);
  return { results, assertions: results.flatMap(x => x.assertionResults) };
}
const baseline = await runCollection();
const normal = summary(baseline.report);
assert.equal(baseline.code, 0);
assert.equal(normal.results.length, 22);
assert.equal(normal.assertions.length, 83);
assert.ok(normal.results.every(x => x.status === 'pass'));
assert.ok(normal.assertions.every(x => x.status === 'pass'));

// Я проверяю чувствительность именно настоящей коллекции, а не её программной копии.
const mutated = await runCollection({ trainingBug: true, reportName: 'training-bug' });
assert.notEqual(mutated.code, 0, 'Я ожидаю ненулевой код на намеренном дефекте');
const permission = summary(mutated.report).results.find(x => x.test.filename === '15-customer-forbidden.bru');
assert.ok(permission, 'Я ожидаю запрос проверки прав в отчёте');
assert.equal(permission.response.status, 200);
assert.equal(permission.response.data.data.changeStatus.ticket.status, 'IN_PROGRESS');
assert.ok(permission.assertionResults.some(x => x.lhsExpr === 'res.body.data.changeStatus' && x.status === 'fail'));
console.log('Я подтвердил: коллекция обнаруживает намеренный дефект прав.');
console.log(await packageRelease());
