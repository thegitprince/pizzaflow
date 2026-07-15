// src/lib/menu-upsert.ts
// Shared menu bulk-upsert routine used by both the browser client
// (src/lib/supabase.ts) and the server client (src/lib/supabase-server.ts).
import type { SupabaseClient } from "@supabase/supabase-js";

export interface BulkUpsertResult {
  imported: number;
  updated: number;
  skipped: number;
  report: string[];
}

export interface BulkMenuItem {
  code: string;
  category: string;
  name: string;
  price_inr: number;
  description: string;
  is_active: boolean;
}

// Upserts menu items by unique code: updates when the code already exists,
// inserts otherwise, and records a per-item report entry.
export async function upsertMenuItems(
  client: SupabaseClient,
  items: BulkMenuItem[]
): Promise<BulkUpsertResult> {
  let imported = 0;
  let updated = 0;
  let skipped = 0;
  const report: string[] = [];

  for (const item of items) {
    try {
      const { data: existing } = await client
        .from("menu_items")
        .select("id")
        .eq("code", item.code)
        .maybeSingle();

      if (existing) {
        const { error } = await client
          .from("menu_items")
          .update({
            name: item.name,
            price_inr: item.price_inr,
            description: item.description,
            is_active: item.is_active,
            category: item.category,
            updated_at: new Date().toISOString(),
          })
          .eq("id", existing.id);

        if (error) throw error;
        updated++;
        report.push(`Updated ${item.code}: ${item.name}`);
      } else {
        const { error } = await client
          .from("menu_items")
          .insert([{
            code: item.code,
            category: item.category,
            name: item.name,
            price_inr: item.price_inr,
            description: item.description,
            is_active: item.is_active,
          }]);

        if (error) throw error;
        imported++;
        report.push(`Imported ${item.code}: ${item.name}`);
      }
    } catch (err) {
      skipped++;
      report.push(`Skipped ${item.code || "unknown"}: ${String(err)}`);
    }
  }

  return { imported, updated, skipped, report };
}
