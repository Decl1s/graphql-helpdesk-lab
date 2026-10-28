import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { runCollection } from './run-collection.js';
import { packageRelease } from './package-release.js';

// Я сначала запускаю дополнительные API-проверки стенда и останавливаю gate при их отказе.
const unit = spawnSync(process.execPath, ['--test', 'tests/api.test.js'], { stdio: 'inherit' });
assert.equal(unit.status, 0, 'Я ожидаю зелёные API-проверки');
// Я собираю результаты и Assert из структуры JSON-отчёта Bruno в плоские массивы.
function summary(report) {
  const results = report.flatMap(x => x.results);
  return { results, assertions: results.flatMap(x => x.assertionResults) };
}
// Я запускаю исправный стенд и требую полный зелёный набор, а не только нулевой exit code.
const baseline = await runCollection();
const normal = summary(baseline.report);
assert.equal(baseline.code, 0);
// Я проверяю число запросов: случайно пустая или неполная коллекция не должна считаться успешной.
assert.equal(normal.results.length, 22);
assert.equal(normal.assertions.length, 83);
assert.ok(normal.results.every(x => x.status === 'pass'));
assert.ok(normal.assertions.every(x => x.status === 'pass'));

// Я проверяю чувствительность именно настоящей коллекции, а не её программной копии.
// Я запускаю ту же коллекцию на отдельном стенде с намеренной ошибкой права.
const mutated = await runCollection({ trainingBug: true, reportName: 'training-bug' });
// Я ожидаю красный итог именно этого промежуточного запуска.
assert.notEqual(mutated.code, 0, 'Я ожидаю ненулевой код на намеренном дефекте');
// Я нахожу конкретный запрос 15. Любая другая ошибка сама по себе не доказывает найденный дефект.
const permission = summary(mutated.report).results.find(x => x.test.filename === '15-customer-forbidden.bru');
assert.ok(permission, 'Я ожидаю запрос проверки прав в отчёте');
assert.equal(permission.response.status, 200);
// Я подтверждаю фактическое запрещённое изменение, а не сетевой таймаут.
assert.equal(permission.response.data.data.changeStatus.ticket.status, 'IN_PROGRESS');
// Я проверяю, что Assert на null обнаружил подмену отказа успешным объектом.
assert.ok(permission.assertionResults.some(x => x.lhsExpr === 'res.body.data.changeStatus' && x.status === 'fail'));
console.log('Я подтвердил: коллекция обнаруживает намеренный дефект прав.');
// Я собираю исходники после проверок. Сам архиватор повторно сверяет содержимое ZIP.
console.log(await packageRelease());
