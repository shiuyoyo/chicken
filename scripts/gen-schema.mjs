import { writeFileSync } from 'node:fs'
import { schemaSQL } from '../src/db/schema.js'

writeFileSync(new URL('../supabase/schema.sql', import.meta.url), schemaSQL() + '\n')
console.log('wrote supabase/schema.sql')
