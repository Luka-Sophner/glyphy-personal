import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

export function encryptBackup(bytes, password) {
  const salt = crypto.randomBytes(32), iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', crypto.scryptSync(password, salt, 32), iv);
  const data = Buffer.concat([cipher.update(bytes), cipher.final()]);
  return { format: 'glyphy-signing-v1', salt: salt.toString('base64'), iv: iv.toString('base64'), tag: cipher.getAuthTag().toString('base64'), data: data.toString('base64') };
}
export function decryptBackup(value, password) {
  if (value.format !== 'glyphy-signing-v1') throw new Error('Unknown backup format');
  const cipher = crypto.createDecipheriv('aes-256-gcm', crypto.scryptSync(password, Buffer.from(value.salt, 'base64'), 32), Buffer.from(value.iv, 'base64'));
  cipher.setAuthTag(Buffer.from(value.tag, 'base64'));
  return Buffer.concat([cipher.update(Buffer.from(value.data, 'base64')), cipher.final()]);
}
function main() {
  const password = process.env.ANDROID_KEYSTORE_PASSWORD;
  if (!password || password.length < 16) throw new Error('Use ANDROID_KEYSTORE_PASSWORD with at least 16 characters.');
  if (process.argv[2] === 'create') {
    if (process.env.GITHUB_ACTIONS !== 'true') throw new Error('Key creation runs only in GitHub Actions.');
    if (process.env.ANDROID_KEYSTORE_BASE64) throw new Error('Signing key is already configured. Never replace it for updates.');
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'glyphy-signing-'));
    try {
      const key = path.join(dir, 'glyphy.jks');
      const result = spawnSync('keytool', ['-genkeypair', '-noprompt', '-storetype', 'JKS', '-keystore', key,
        '-alias', 'glyphy', '-keyalg', 'RSA', '-keysize', '3072', '-validity', '36500',
        '-dname', 'CN=Glyphy Personal', '-storepass:env', 'ANDROID_KEYSTORE_PASSWORD', '-keypass:env', 'ANDROID_KEYSTORE_PASSWORD'], { stdio: 'inherit' });
      if (result.error || result.status !== 0) throw new Error('keytool failed');
      fs.mkdirSync('APK', { recursive: true });
      fs.writeFileSync('APK/Glyphy-signing-backup.encrypted.json', JSON.stringify(encryptBackup(fs.readFileSync(key), password)));
      console.log('Encrypted backup created. Download it and finish the guide BEFORE running any APK build.');
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  } else if (process.argv[2] === 'clipboard') {
    if (process.platform !== 'win32') throw new Error('Clipboard helper requires Windows.');
    const bytes = decryptBackup(JSON.parse(fs.readFileSync(process.argv[3], 'utf8')), password);
    const result = spawnSync('powershell.exe', ['-NoProfile', '-Command', '$input | Set-Clipboard'], { input: bytes.toString('base64'), encoding: 'utf8' });
    bytes.fill(0);
    if (result.error || result.status !== 0) throw new Error('Could not copy key to clipboard');
    console.log('Signing key copied. Paste into ANDROID_KEYSTORE_BASE64 on GitHub.');
  } else throw new Error('Expected create or clipboard');
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { main(); } catch (error) { console.error(error.message); process.exitCode = 1; }
}
