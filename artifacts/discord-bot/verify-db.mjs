import pg from 'pg';

const { Client } = pg;
const connectionString = 'postgresql://postgres:yljiUECeNtUeCfAJahCXPJRQJpJQPdon@shortline.proxy.rlwy.net:51223/railway';

const client = new Client({ connectionString });

try {
  await client.connect();
  
  // List all tables
  const tables = await client.query(`
    SELECT table_name 
    FROM information_schema.tables 
    WHERE table_schema = 'public'
    ORDER BY table_name
  `);
  
  console.log('✓ Tables in database:');
  tables.rows.forEach(row => console.log(`  - ${row.table_name}`));
  
  // Count rows in each table
  console.log('\n✓ Row counts:');
  for (const row of tables.rows) {
    const count = await client.query(`SELECT COUNT(*) as cnt FROM "${row.table_name}"`);
    console.log(`  - ${row.table_name}: ${count.rows[0].cnt} rows`);
  }
  
  await client.end();
} catch (err) {
  console.error('✗ Error:', err.message);
  process.exit(1);
}
