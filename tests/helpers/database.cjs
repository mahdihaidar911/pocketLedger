const { randomUUID } = require('node:crypto');
const { existsSync, readFileSync } = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');
const vm = require('node:vm');
const ts = require('typescript');

const projectRoot = path.resolve(__dirname, '../..');
// Run the actual repositories and migrations, substituting only native imports.
function createSourceLoader(overrides = {}) {
  const modules = new Map();
  function loadSource(relativePath) {
    const filename = path.resolve(projectRoot, relativePath);
    if (modules.has(filename)) return modules.get(filename).exports;
    const module = { exports: {} };
    modules.set(filename, module);
    const output = ts.transpileModule(readFileSync(filename, 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText;
    const requireSource = (specifier) => {
      if (Object.hasOwn(overrides, specifier)) return overrides[specifier];
      if (specifier === 'expo-crypto') return { randomUUID };
      if (!specifier.startsWith('.')) throw new Error(`Unexpected runtime import: ${specifier}`);
      const target = path.resolve(path.dirname(filename), specifier);
      return loadSource(existsSync(`${target}.ts`) ? `${target}.ts` : path.join(target, 'index.ts'));
    };
    const execute = vm.runInThisContext(`(function(require, module, exports) {\n${output}\n})`, { filename });
    execute(requireSource, module, module.exports);
    return module.exports;
  }
  return loadSource;
}

const loadSource = createSourceLoader();

async function setup(t) {
  // Never open the simulator database or user financial data.
  const sqlite = new DatabaseSync(':memory:');
  t.after(() => sqlite.close());
  let queue = Promise.resolve();
  const db = {
    async execAsync(sql) { sqlite.exec(sql); },
    async getFirstAsync(sql, ...args) { return sqlite.prepare(sql).get(...args) ?? null; },
    async getAllAsync(sql, ...args) { return sqlite.prepare(sql).all(...args); },
    async runAsync(sql, ...args) { return sqlite.prepare(sql).run(...args); },
    withExclusiveTransactionAsync(task) {
      const result = queue.then(async () => {
        sqlite.exec('BEGIN IMMEDIATE');
        try {
          await task(db);
          sqlite.exec('COMMIT');
        } catch (error) {
          sqlite.exec('ROLLBACK');
          throw error;
        }
      });
      queue = result.catch(() => {});
      return result;
    },
  };
  await loadSource('src/database/migrate.ts').migrateDatabase(db);
  return { db, sqlite };
}

module.exports = { loadSource, createSourceLoader, setup };
