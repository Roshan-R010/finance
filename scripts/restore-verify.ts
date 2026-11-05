import { DatabaseSync } from 'node:sqlite';
import { createDecipheriv } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync, unlinkSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const source=process.env.FINFAM_BACKUP_FILE, target=process.env.FINFAM_RESTORE_PATH;
const keyText=process.env.FINFAM_BACKUP_KEY||'';
if(!source||!target||!/^[a-f0-9]{64}$/i.test(keyText))throw Error('Set FINFAM_BACKUP_FILE, FINFAM_RESTORE_PATH and a 32-byte hex FINFAM_BACKUP_KEY.');
const targetPath=resolve(target);
if(existsSync(targetPath))throw Error('Restore target already exists. Use an empty isolated path.');
const bytes=readFileSync(resolve(source));
if(bytes.subarray(0,5).toString()!=='FFBK1')throw Error('Unknown backup format.');
const iv=bytes.subarray(5,17),tag=bytes.subarray(17,33),encrypted=bytes.subarray(33);
const decipher=createDecipheriv('aes-256-gcm',Buffer.from(keyText,'hex'),iv);decipher.setAuthTag(tag);
const plaintext=Buffer.concat([decipher.update(encrypted),decipher.final()]);
mkdirSync(dirname(targetPath),{recursive:true});
try {
  writeFileSync(targetPath,plaintext,{flag:'wx'});
  const restored=new DatabaseSync(targetPath);
  try {
    const integrity=restored.prepare('PRAGMA integrity_check').get() as any;
    if(integrity.integrity_check!=='ok')throw Error('SQLite integrity check failed.');
    const accounts=(restored.prepare('SELECT COUNT(*) count FROM accounts').get() as any).count;
    const receipts=(restored.prepare('SELECT COUNT(*) count FROM receipts').get() as any).count;
    console.log(`Isolated restore verified: ${accounts} accounts, ${receipts} receipts.`);
  } finally { restored.close(); }
} catch(error) {try{unlinkSync(targetPath);}catch{}throw error;}
