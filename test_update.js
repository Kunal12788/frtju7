import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_KEY);

async function run() {
  console.log("Updating is_active to false...");
  const { data, error } = await supabase.from('bullion_settings').update({ is_active: false }).eq('id', 1);
  if (error) console.error("Error:", error);
  else console.log("Update success!");
}
run();
