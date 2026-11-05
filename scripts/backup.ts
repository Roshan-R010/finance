import { backup } from 'node:sqlite';
import { createCipheriv, randomBytes } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync, unlinkSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { db } from '../src/service.ts';

const keyText=process.env.FINFAM_BACKUP_KEY||'';
if(!/^[a-f0-9]{64}$/i.test(keyText))throw Error('FINFAM_BACKUP_KEY must be a private 32-byte hex key.');
const key=Buffer.from(keyText,'hex');
const destination=resolve(process.env.FINFAM_BACKUP_DIR||'data/backups',`finance-${new Date().toISOString().replace(/[:.]/g,'-')}.ffbak`);
mkdirSync(dirname(destination),{recursive:true});
const temporary=destination+'.snapshot';
try {
  await backup(db,temporary);
  const plaintext=readFileSync(temporary),iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',key,iv);
  const encrypted=Buffer.concat([cipher.update(plaintext),cipher.final()]);
  writeFileSync(destination,Buffer.concat([Buffer.from('FFBK1'),iv,cipher.getAuthTag(),encrypted]),{flag:'wx'});
  console.log(`Encrypted backup saved: ${destination}`);
} finally { try { unlinkSync(temporary); } catch {} db.close(); }
