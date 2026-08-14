import fs from 'fs';
import pg from 'pg';

const { Client } = pg;
const connectionString = 'postgresql://postgres:yljiUECeNtUeCfAJahCXPJRQJpJQPdon@shortline.proxy.rlwy.net:51223/railway';
const backupFile = '../../backups/railway_backup_20260711.sql';

const client = new Client({ connectionString });

function parseSqlStatements(sql) {
  const statements = [];
  let current = '';
  let inString = false;
  let stringChar = '';
  
  for (let i = 0; i < sql.length; i++) {
    const char = sql[i];
    const prevChar = i > 0 ? sql[i - 1] : '';
    
    if ((char === '"' || char === "'") && prevChar !== '\\') {
      if (!inString) {
        inString = true;
        stringChar = char;
      } else if (char === stringChar) {
        inString = false;
      }
    }
    
    if (char === ';' && !inString) {
      current += char;
      const trimmed = current.trim();
      if (trimmed.length > 0) {
        statements.push(trimmed);
      }
      current = '';
    } else {
      current += char;
    }
  }
  
  const trimmed = current.trim();
  if (trimmed.length > 0) {
    statements.push(trimmed);
  }
  
  return statements;
}

try {
  await client.connect();
  console.log('✓ Connected to Railway database');
  
  const sql = fs.readFileSync(backupFile, 'utf-8');
  console.log(`✓ Backup file loaded (${Math.round(sql.length / 1024)} KB)`);
  
  const statements = parseSqlStatements(sql);
  console.log(`✓ Parsed ${statements.length} SQL statements`);
  
  let succeeded = 0;
  let skipped = 0;
  
  for (let i = 0; i < statements.length; i++) {
    if (i % 50 === 0) console.log(`  Processing statement ${i}/${statements.length}...`);
    try {
      await client.query(statements[i]);
      succeeded++;
    } catch (e) {
      // Skip expected errors like "already exists"
      if (e.message.includes('already exists') || e.message.includes('duplicate key')) {
        skipped++;
      } else {
        console.error(`✗ Statement ${i} failed:`, e.message.substring(0, 150));
      }
    }
  }
  
  console.log(`✓ Backup restored successfully (${succeeded} executed, ${skipped} skipped)`);
  await client.end();
} catch (err) {
  console.error('✗ Error:', err.message);
  process.exit(1);
}
