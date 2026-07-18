import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_KEY);

async function run() {
  const { error } = await supabase.rpc('execute_sql', {
    sql_query: `
      ALTER TABLE bullion_settings ADD COLUMN IF NOT EXISTS onesignal_app_id TEXT;
      ALTER TABLE bullion_settings ADD COLUMN IF NOT EXISTS onesignal_rest_api_key TEXT;
      UPDATE bullion_settings SET 
        onesignal_app_id = '${process.env.ONESIGNAL_APP_ID}',
        onesignal_rest_api_key = '${process.env.ONESIGNAL_REST_API_KEY}'
      WHERE id = 1;
    `
  });
  
  if (error) {
    console.error("Error altering table:", error);
  } else {
    console.log("Successfully added onesignal columns to bullion_settings and populated them.");
  }
}

run();
