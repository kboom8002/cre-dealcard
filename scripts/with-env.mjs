/**
 * 크로스 플랫폼 환경변수 주입 실행기 (cross-env 대체, 의존성 없음)
 * 사용: node scripts/with-env.mjs KEY=VALUE [KEY2=VALUE2 ...] -- <command> [args...]
 */
import { spawn } from 'child_process';

const argv = process.argv.slice(2);
const sep = argv.indexOf('--');
if (sep < 0 || sep === argv.length - 1) {
  console.error('usage: node scripts/with-env.mjs KEY=VALUE ... -- <command> [args...]');
  process.exit(2);
}
const env = { ...process.env };
for (const kv of argv.slice(0, sep)) {
  const i = kv.indexOf('=');
  if (i > 0) env[kv.slice(0, i)] = kv.slice(i + 1);
}
const [cmd, ...cmdArgs] = argv.slice(sep + 1);
const child = spawn(cmd, cmdArgs, { stdio: 'inherit', env, shell: process.platform === 'win32' });
child.on('exit', (code) => process.exit(code ?? 1));
