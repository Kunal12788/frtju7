import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_KEY);

async function run() {
  const { data, error } = await supabase.from('bullion_settings').select('*');
  console.log("Settings rows:", data);

  // Let's run a query to check RLS policies
  const { data: policies, error: polError } = await supabase.rpc('execute_sql', { 
    sql_query: "SELECT schemaname, tablename, policyname, roles, cmd, qual, with_check FROM pg_policies WHERE tablename = 'bullion_settings';" 
  });
  
  if (polError) {
    console.error("Pol error:", polError);
  } else {
    console.log("Policies:", policies);
  }
}
run();
