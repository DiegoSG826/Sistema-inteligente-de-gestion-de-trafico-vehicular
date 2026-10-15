import { mkdir, open, realpath } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { hashPassword } from '../server.js';

const args = process.argv.slice(2);
const readArg = name => args[args.indexOf(name) + 1];
const username = args.includes('--username') ? readArg('--username') : undefined;
const output = args.includes('--output') ? readArg('--output') : undefined;
if (!username || !/^[\p{L}\p{N}_.@-]{1,80}$/u.test(username) || !output || args.length !== 4) {
  console.error('Uso: node scripts/create-access.js --username NOMBRE --output /ruta/externa/auth.json\nLa contraseña se lee por stdin; utiliza lectura oculta y un mínimo de 16 caracteres.');
  process.exit(1);
}
if (process.stdin.isTTY) {
  console.error('Por seguridad, proporciona la contraseña por stdin con lectura oculta; consulta docs/ALOJAMIENTO-PRIVADO.md.');
  process.exit(1);
}
let secret = '';
for await (const chunk of process.stdin) {
  secret += chunk.toString();
  if (secret.length > 2048) { console.error('La contraseña es demasiado larga.'); process.exit(1); }
}
secret = secret.replace(/\r?\n$/, '');
if (secret.length < 16 || secret.length > 1024 || /[\r\n\0]/.test(secret)) {
  console.error('La contraseña debe tener entre 16 y 1024 caracteres y una sola línea.');
  process.exit(1);
}
try {
  const target = path.resolve(output);
  const checkout = await realpath(path.join(path.dirname(fileURLToPath(import.meta.url)), '..'));
  await mkdir(path.dirname(target), { recursive: true, mode: 0o700 });
  const parent = await realpath(path.dirname(target));
  if (parent === checkout || parent.startsWith(checkout + path.sep)) throw new Error('La credencial debe guardarse fuera del repositorio.');
  const file = await open(path.join(parent, path.basename(target)), 'wx', 0o600);
  try { await file.writeFile(JSON.stringify({ version: 1, algorithm: 'scrypt', username, ...hashPassword(secret) }, null, 2) + '\n'); }
  finally { await file.close(); }
  secret = '';
  console.log('Archivo de acceso creado fuera del repositorio con permisos 0600. No se mostró la contraseña.');
} catch (error) {
  console.error(error.code === 'EEXIST' ? 'El archivo ya existe; no se sobrescribió.' : error.message === 'La credencial debe guardarse fuera del repositorio.' ? error.message : 'No se pudo crear el archivo de acceso; revisa la ruta y los permisos.');
  process.exitCode = 1;
}
