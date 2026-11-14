import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
const files = fs.readdirSync('tests').filter(name => name.endsWith('.test.mjs')).sort().map(name => `tests/${name}`);
const inProcess = process.argv.includes('--in-process');
if (inProcess && Number(process.versions.node.split('.')[0]) < 24) throw new Error('--in-process is only available for local Node.js 24+. Use the default runner on Node.js 22.');
const result = spawnSync(process.execPath, ['--test', ...(inProcess ? ['--test-isolation=none'] : []), ...files], { stdio: 'inherit' });
if (result.error) console.error(`Could not start tests: ${result.error.message}`);
process.exitCode = result.status ?? 1;
