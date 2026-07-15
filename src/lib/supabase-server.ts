import { createClient } from "@supabase/supabase-js";
import { upsertMenuItems, BulkMenuItem, BulkUpsertResult } from "./menu-upsert";

const supabaseUrl = process.env.VITE_SUPABASE_URL || "";
const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY || "";

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

export async function bulkUpsertMenuItems(items: BulkMenuItem[]): Promise<BulkUpsertResult> {
  return upsertMenuItems(supabase, items);
}
