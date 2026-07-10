import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_KEY);

async function checkPolicies() {
  const { data, error } = await supabase.rpc('execute_sql', { sql_query: "SELECT * FROM pg_policies WHERE tablename = 'bullion_settings';" });
  if (error) {
    console.log("Could not run RPC, checking directly via rest if possible, or just fetching the row:", error.message);
  } else {
    console.log("Policies:", data);
  }

  // Check if row 1 exists
  const { data: row, error: rowErr } = await supabase.from('bullion_settings').select('*').eq('id', 1);
  console.log("Row 1 data:", row);
}

checkPolicies();
