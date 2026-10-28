import { readFile, writeFile, mkdir, lstat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { zipSync, unzipSync } from 'fflate';

export const root = fileURLToPath(new URL('../', import.meta.url));
export async function sourceFiles() {
  const files = (await readFile(resolve(root, 'SOURCE_FILES.txt'), 'utf8')).trim().split('\n');
  if (new Set(files).size !== files.length) throw new Error('Я обнаружил дубликат в списке исходников');
  const result = {};
  for (const name of files) {
    if (!/^[a-zA-Z0-9_.\-/]+$/.test(name) || name.split('/').includes('..') || name.startsWith('/') || /(^|\/)(node_modules|reports|dist|\.git)(\/|$)|(^|\/)\.env/.test(name)) throw new Error(`Я отклонил путь: ${name}`);
    const path = resolve(root, name);
    if (!(await lstat(path)).isFile()) throw new Error(`Я ожидаю обычный файл: ${name}`);
    const content = await readFile(path);
    const text = content.toString('utf8');
    if (!Buffer.from(text).equals(content)) throw new Error(`Я ожидаю UTF-8: ${name}`);
    if (/\/home\/|[A-Z]:\\Users\\|[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}|-----BEGIN [A-Z ]*PRIVATE KEY-----|gh[pousr]_[A-Za-z0-9]{20}/i.test(text)) throw new Error(`Я обнаружил личный путь, контакт или секрет: ${name}`);
    result[name] = content;
  }
  return result;
}
export async function packageRelease() {
  const files = await sourceFiles();
  const pkg = JSON.parse(files['package.json']);
  const name = `${pkg.name}-${pkg.version}-source.zip`;
  const prefix = `${pkg.name}-${pkg.version}/`;
  const zip = zipSync(Object.fromEntries(Object.entries(files).map(([path, bytes]) => [prefix + path, [bytes, { mtime: new Date(2026, 0, 1) }]])), { level: 6 });
  const extracted = unzipSync(zip);
  if (Object.keys(extracted).length !== Object.keys(files).length) throw new Error('Я получил неверное число файлов в ZIP');
  for (const [path, bytes] of Object.entries(files)) if (!Buffer.from(extracted[prefix + path]).equals(bytes)) throw new Error(`Я получил неверное содержимое ZIP: ${path}`);
  const sha256 = createHash('sha256').update(zip).digest('hex');
  await mkdir(resolve(root, 'dist'), { recursive: true });
  await writeFile(resolve(root, 'dist', name), zip);
  await writeFile(resolve(root, 'dist', 'SHA256SUMS'), `${sha256}  ${name}\n`);
  return { archive: name, sha256, count: Object.keys(files).length };
}
if (process.argv[1] === fileURLToPath(import.meta.url)) console.log(await packageRelease());
