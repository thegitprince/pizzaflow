import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.VITE_SUPABASE_URL || "";
const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY || "";

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

export function isServerSupabaseConfigured(): boolean {
  return Boolean(supabaseUrl && supabaseAnonKey);
}

export interface AuthenticatedUser {
  id: string;
  email: string | null;
  role: string;
}

// Verifies a Supabase access token and resolves the caller's role.
// A per-request client scoped to the caller's JWT ensures the profiles
// lookup runs under that user's Row Level Security context.
export async function authenticateToken(token: string): Promise<AuthenticatedUser | null> {
  if (!isServerSupabaseConfigured()) return null;

  const scoped = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data, error } = await scoped.auth.getUser(token);
  if (error || !data?.user) return null;

  const { data: profile } = await scoped
    .from("profiles")
    .select("role")
    .eq("id", data.user.id)
    .maybeSingle();

  return {
    id: data.user.id,
    email: data.user.email ?? null,
    role: profile?.role ?? "staff",
  };
}

export async function bulkUpsertMenuItems(items: any[]): Promise<{ imported: number, updated: number, skipped: number, report: string[] }> {
  let imported = 0;
  let updated = 0;
  let skipped = 0;
  const report: string[] = [];

  for (const item of items) {
    try {
      // Check if exists
      const { data: existing } = await supabase
        .from("menu_items")
        .select("id")
        .eq("code", item.code)
        .maybeSingle();

      if (existing) {
        const { error } = await supabase
          .from("menu_items")
          .update({
            name: item.name,
            price_inr: item.price_inr,
            description: item.description,
            is_active: item.is_active,
            category: item.category,
            updated_at: new Date().toISOString()
          })
          .eq("id", existing.id);

        if (error) throw error;
        updated++;
        report.push(`Updated ${item.code}: ${item.name}`);
      } else {
        const { error } = await supabase
          .from("menu_items")
          .insert([{
            code: item.code,
            category: item.category,
            name: item.name,
            price_inr: item.price_inr,
            description: item.description,
            is_active: item.is_active
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
