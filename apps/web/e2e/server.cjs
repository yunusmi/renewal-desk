// Explicit isolated E2E reset, API + worker + original provider processes; never core/demo.
const { spawn, execFileSync } = require('node:child_process');
const path = require('node:path');
const root = path.resolve(__dirname, '../../..');
const server = path.join(root, 'apps/server');
const databaseUrl = process.env.TEST_DATABASE_URL || 'postgresql://renewaldesk:test-only-local-password@127.0.0.1:55432/renewaldesk_test';
const url = new URL(databaseUrl);
if (!url.pathname.endsWith('_test') || !['127.0.0.1', 'localhost'].includes(url.hostname)) throw new Error('Refusing non-test database');
const env = { ...process.env, APP_ENV: 'test', DATASET: 'test', DATABASE_URL: databaseUrl, APP_ORIGIN: 'http://127.0.0.1:15173', PORT: '13001', JWT_SECRET: 'e2e-jwt-secret-012345678901234567890123456', CSRF_SECRET: 'e2e-csrf-secret-012345678901234567890123456', LOG_LEVEL: 'silent', PROVIDER_BASE_URL: process.env.TEST_PROVIDER_URL || 'http://127.0.0.1:18191', PROVIDER_TIMEOUT_MS: '500', RETRY_DELAY_MS: '300', JOB_LEASE_MS: '4000', WORKER_POLL_MS: '50', LOGIN_RATE_LIMIT: '1000' };
execFileSync('npx', ['--no-install', 'sequelize-cli', 'db:migrate'], { cwd: server, env, stdio: 'inherit' });
const reset = `require('reflect-metadata'); const {createSequelize}=require('./dist/database/sequelize');const {DatasetMeta,Workspace,User}=require('./dist/database/models');(async()=>{const db=createSequelize(process.env.DATABASE_URL);const meta=await DatasetMeta.findByPk('dataset_kind');if(meta&&meta.value!=='test')throw Error('Not test dataset');await Workspace.truncate({cascade:true});await User.truncate({cascade:true});await DatasetMeta.destroy({where:{}});await db.query('ALTER SEQUENCE renewal_request_seq RESTART WITH 1001');await require('./db/seeders/core/20261112000001-core-dataset').up(db.getQueryInterface());await db.close();})().catch(e=>{console.error(e.name);process.exit(1)});`;
execFileSync(process.execPath, ['-e', reset], { cwd: server, env, stdio: 'inherit' });
if (process.argv.includes('--reset')) process.exit(0);
const children = [];
function launch(cmd, args, cwd, extra = {}) { const p = spawn(cmd, args, { cwd, env: { ...env, ...extra }, stdio: 'inherit' }); children.push(p); return p; }
launch(process.execPath, ['dist/main-api.js'], server);
launch(process.execPath, ['dist/main-worker.js'], server);
launch(process.execPath, [path.join(root, 'node_modules/vite/bin/vite.js'), '--host', '127.0.0.1', '--port', '15173', '--strictPort'], path.join(root, 'apps/web'), { VITE_API_TARGET: 'http://127.0.0.1:13001' });
let stopping = false;
function stop() { if (stopping) return; stopping = true; children.forEach(p => p.kill('SIGTERM')); setTimeout(() => process.exit(), 500).unref(); }
process.on('SIGTERM', stop); process.on('SIGINT', stop);
children.forEach(p => p.on('exit', code => { if (!stopping) { console.error('E2E process exited', code); stop(); process.exitCode = 1; } }));
