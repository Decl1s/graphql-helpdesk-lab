import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { packageRelease, root } from './package-release.js';

const repo = 'Decl1s/graphql-helpdesk-lab';
const pkg = JSON.parse(await readFile(resolve(root, 'package.json'), 'utf8'));
const tag = `v${pkg.version}`;
const sha = process.env.GITHUB_SHA;
if (process.env.GITHUB_REPOSITORY !== repo || process.env.GITHUB_EVENT_NAME !== 'push' || process.env.GITHUB_REF !== 'refs/heads/main' || !/^[a-f0-9]{40}$/.test(sha ?? '')) throw new Error('Я разрешаю публикацию только из push main этого репозитория');
if (execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim() !== sha) throw new Error('Я обнаружил несовпадение HEAD');
execFileSync('git', ['diff', '--exit-code', 'HEAD', '--'], { cwd: root });
async function api(path, method = 'GET', value, raw) {
  const url = path.startsWith('/upload/') ? `https://uploads.github.com/repos/${repo}/releases/${path.slice(8)}` : `https://api.github.com/repos/${repo}${path}`;
  const response = await fetch(url, { method, headers: { Authorization: `Bearer ${process.env.GITHUB_TOKEN}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', 'Content-Type': raw ? 'application/octet-stream' : 'application/json' }, body: raw ?? (value === undefined ? undefined : JSON.stringify(value)), signal: AbortSignal.timeout(90_000) });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`Я получил GitHub HTTP ${response.status}`);
  return response.json();
}
const evidence = await packageRelease();
const ref = await api(`/git/ref/tags/${tag}`);
if (ref && (ref.object.type !== 'commit' || ref.object.sha !== sha)) throw new Error('Я не перемещаю существующий тег');
let release = await api(`/releases/tags/${tag}`);
if (!release) {
  const drafts = (await api('/releases?per_page=100')).filter(x => x.tag_name === tag);
  if (drafts.length > 1) throw new Error('Я обнаружил несколько черновиков');
  release = drafts[0] ?? await api('/releases', 'POST', { tag_name: tag, target_commitish: sha, name: `Мой GraphQL Helpdesk Lab ${pkg.version}`, draft: true, prerelease: false, body: 'Я обновил навигацию документации и согласовал patch-версию исходного архива. Бизнес-правила и зависимости я сохранил. Я выпускаю учебный low-code QA-стенд: 22 GraphQL-запроса и 83 декларативные проверки Bruno, демо-роли, частичные ошибки и контролируемый дефект прав. Я начинаю с GUIDE.md, сверяю контракт с TEST_PLAN.md, разбираю решения в NOTES.md. ZIP содержит только разрешённые исходники; отчёты, окружение и контакты я не включаю.' });
}
if (release.target_commitish !== sha) throw new Error('Я не перезаписываю чужой релиз');
const assets = await api(`/releases/${release.id}/assets`);
for (const name of [evidence.archive, 'SHA256SUMS']) {
  const raw = await readFile(resolve(root, 'dist', name));
  const digest = `sha256:${createHash('sha256').update(raw).digest('hex')}`;
  const old = assets.find(x => x.name === name);
  const item = old ?? await api(`/upload/${release.id}/assets?name=${encodeURIComponent(name)}`, 'POST', undefined, raw);
  if (item.digest !== digest) throw new Error('Я обнаружил конфликт контрольной суммы релиза');
}
if (release.draft) release = await api(`/releases/${release.id}`, 'PATCH', { draft: false, make_latest: 'true' });
const finalRef = await api(`/git/ref/tags/${tag}`);
if (release.draft || release.prerelease || finalRef.object.sha !== sha) throw new Error('Я не подтвердил публикацию');
console.log(JSON.stringify({ release: release.html_url, commit: sha, ...evidence }));
