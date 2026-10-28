# Какие технологии я использую

Я закрепляю версии прямых пакетов в package.json, полное дерево, integrity и URL загрузки — в package-lock.json. Я устанавливаю его через npm ci. Для основных действий в Bruno я не пишу JavaScript. JavaScript я использую в готовом стенде и обслуживающих проверках.

| Компонент | Версия | Зачем я выбрал | Официальный источник |
| --- | --- | --- | --- |
| Node.js | 24.22.0 | Я запускаю один локальный процесс; использую встроенные HTTP, fetch, fs, crypto, child_process и node:test | [Node](https://nodejs.org/docs/latest-v24.x/api/) |
| npm | локально 11.19.1 | Я устанавливаю lock и проверяю известные уязвимости; версия npm в CI зависит от поставки Node | [npm ci](https://docs.npmjs.com/cli/v11/commands/npm-ci) |
| JavaScript ESM | реализация Node 24 | Я разделяю запуск, резолверы и инструменты без компилятора | [Modules](https://nodejs.org/docs/latest-v24.x/api/esm.html) |
| GraphQL.js | 17.0.2 | Я проверяю схему, переменные и исполняю GraphQL | [GraphQL.js](https://www.graphql-js.org/docs/) |
| GraphQL Yoga | 6.0.1 | Я получаю HTTP-обработчик, контекст и маскирование неожиданных ошибок | [Yoga v6](https://the-guild.dev/graphql/yoga-server/docs) |
| Bruno CLI | 4.3.0 | Я запускаю те же .bru, что открываю в интерфейсе, и получаю три вида отчётов | [CLI](https://www.usebruno.com/product/cli), [исходники](https://github.com/usebruno/bruno) |
| Bruno Desktop | устанавливаю отдельно; не закрепляю бинарник | Я редактирую запросы, Variables и декларативные Assert. Я не запускал Desktop в этой среде | [Загрузка](https://www.usebruno.com/downloads), [Assert](https://github.com/usebruno/bruno-tutorials/blob/main/tutorial/content/Lesson%203/04-testing-assertions.md) |
| fflate | 0.8.3, dev dependency | Я создаю ZIP и проверяю распаковку без отдельной системной утилиты | [Исходники](https://github.com/101arrowz/fflate) |
| GitHub Actions | checkout 7.0.1, setup-node 7.1.0 | Я закрепляю actions полными SHA; проверяю Linux/Windows и выпускаю source-only release после успешной матрицы | [checkout](https://github.com/actions/checkout), [setup-node](https://github.com/actions/setup-node) |
| Markdown, JSON, SDL, Bru, YAML | форматы, без отдельного runtime | Я храню объяснения, контракт, запросы и CI как текст | [GraphQL SDL](https://graphql.org/learn/schema/), [Bruno](https://github.com/usebruno/bruno) |

## Как я закрепил исправления вложенных зависимостей

Я использую overrides: axios 1.21.0, csv-parse 7.0.3, form-data 4.0.6, js-yaml 4.3.2, uuid 11.1.1, yaml 2.9.1, @faker-js/faker 10.6.0, @azure/msal-node 7.1.2. Это пакеты дерева Bruno, а не дополнительные бизнес-функции моего API. Официальные метаданные я беру из [npm registry](https://registry.npmjs.org/), полный фактический состав — из lock. Я не использую Azure, Faker или CSV в сценариях лаборатории; они приходят с универсальным клиентом.

Я получил ноль известных уязвимостей npm после обновления; это снимок базы advisory на 28 октября 2026 года, а не обещание отсутствия любых дефектов. Я проверил нужный маршрут Bruno после overrides и оставил audit в CI, чтобы будущие объявления не проходили незаметно.

Я убрал из lock необязательные тексты deprecated из метаданных реестра: один из них содержал контакт сопровождающего стороннего пакета. Я сохранил версии, resolved, integrity и дерево зависимостей; npm ci продолжает устанавливать именно закреплённый состав. Я не включаю контакты в содержимое проекта.

Я не использую облачную БД, платный SaaS, Docker, внешние персональные данные или аккаунт Bruno. Я отключил встроенную GraphiQL, чтобы сценарий не зависел от подгрузки её веб-ресурсов. Для HTTP-ожиданий я ориентируюсь на [GraphQL over HTTP](https://graphql.org/learn/serving-over-http/) и [модель response/errors](https://graphql.org/learn/response/).
