// src/lib/supabase.ts
import { createClient } from '@supabase/supabase-js'
import { upsertMenuItems } from './menu-upsert'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    'Missing Supabase environment variables. ' +
    'Ensure VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY are set.'
  )
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey)
export const isSupabaseConfigured = true;

// Throws a descriptive error when Supabase is unavailable, so callers don't
// each repeat the same guard.
export function assertSupabaseConfigured(
  message = "Supabase is not configured."
): void {
  if (!isSupabaseConfigured || !supabase) {
    throw new Error(message);
  }
}

// Signs a user in and verifies their profile role is one of `allowedRoles`.
// Signs the user back out and throws when verification fails.
export async function signInWithRole(
  email: string,
  password: string,
  allowedRoles: string[],
  deniedMessage: string
): Promise<{ role: string }> {
  assertSupabaseConfigured(
    "Database offline: Supabase credentials are not configured. Please define VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY."
  );

  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;

  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData?.user) {
    throw new Error("Session error. Please try again.");
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", userData.user.id)
    .maybeSingle();

  if (profileError) {
    await supabase.auth.signOut();
    throw new Error("Could not verify your account role. Please contact your administrator.");
  }

  const role = profile?.role;
  if (!role || !allowedRoles.includes(role)) {
    await supabase.auth.signOut();
    throw new Error(deniedMessage);
  }

  return { role };
}

// --- FALLBACK MOCK DATA ENGINE ---
// This ensures that the application is fully interactive and persistent (via LocalStorage/Memory)
// even when Supabase is not yet configured.

export interface MenuItem {
  id: string;
  code: string;
  category: "base" | "pizza" | "topping";
  name: string;
  price_inr: number;
  description: string;
  is_active: boolean;
  updated_at: string;
}

export interface Order {
  id: string;
  created_at: string;
  table_number: number;
  customer_name: string;
  customer_phone: string;
  quantity: number;
  unit_price: number;
  subtotal: number;
  discount: number;
  gst: number;
  total_payable: number;
  payment_mode: "Cash" | "Card" | "UPI";
  order_source: "staff" | "customer";
  status: "confirmed" | "preparing" | "ready" | "delivered";
  staff_id?: string;
  items?: OrderItemSnapshot[];
}

export interface OrderItemSnapshot {
  id: string;
  order_id: string;
  menu_item_id: string;
  category: string;
  name: string;
  unit_price_snapshot: number;
}

// Default menu items to seed the application immediately
const DEFAULT_MENU_ITEMS: MenuItem[] = [
  // Bases
  { id: "b1-uuid", code: "B1", category: "base", name: "Thin Crust", price_inr: 149.00, description: "Crisp and light base", is_active: true, updated_at: new Date().toISOString() },
  { id: "b2-uuid", code: "B2", category: "base", name: "Cheese Burst", price_inr: 199.00, description: "Stuffed with liquid cheese", is_active: true, updated_at: new Date().toISOString() },
  { id: "b3-uuid", code: "B3", category: "base", name: "Pan Base", price_inr: 129.00, description: "Thick, soft and fluffy", is_active: true, updated_at: new Date().toISOString() },
  // Pizzas
  { id: "p1-uuid", code: "P1", category: "pizza", name: "Margherita Classic", price_inr: 249.00, description: "Traditional cheese and tomato sauce", is_active: true, updated_at: new Date().toISOString() },
  { id: "p2-uuid", code: "P2", category: "pizza", name: "Pepperoni Classic", price_inr: 369.00, description: "Loaded with spicy pork pepperoni", is_active: true, updated_at: new Date().toISOString() },
  { id: "p3-uuid", code: "P3", category: "pizza", name: "Kadhai Paneer Pizza", price_inr: 329.00, description: "Topped with spicy kadhai masala paneer cubes", is_active: true, updated_at: new Date().toISOString() },
  { id: "p4-uuid", code: "P4", category: "pizza", name: "Chicken Tikka Feast", price_inr: 389.00, description: "Tandoori chicken tikka, onions and green pepper", is_active: true, updated_at: new Date().toISOString() },
  // Toppings
  { id: "t1-uuid", code: "T1", category: "topping", name: "Extra Mozzarella", price_inr: 69.00, description: "Gooey extra cheese layer", is_active: true, updated_at: new Date().toISOString() },
  { id: "t2-uuid", code: "T2", category: "topping", name: "Button Mushrooms", price_inr: 49.00, description: "Freshly sliced roasted mushrooms", is_active: true, updated_at: new Date().toISOString() },
  { id: "t3-uuid", code: "T3", category: "topping", name: "Spicy Jalapenos", price_inr: 39.00, description: "Zesty pickled jalapeno slices", is_active: true, updated_at: new Date().toISOString() },
  { id: "t4-uuid", code: "T4", category: "topping", name: "Olives & Onions", price_inr: 45.00, description: "Black olives and crunchy red onions", is_active: true, updated_at: new Date().toISOString() }
];

// Browser Local Storage helper
function getLocalDB() {
  if (typeof window === "undefined") {
    return { menu: DEFAULT_MENU_ITEMS, orders: [] as Order[] };
  }
  
  let menu = DEFAULT_MENU_ITEMS;
  let orders: Order[] = [];
  
  try {
    const storedMenu = localStorage.getItem("slice_matic_menu");
    if (storedMenu) {
      menu = JSON.parse(storedMenu);
    } else {
      localStorage.setItem("slice_matic_menu", JSON.stringify(DEFAULT_MENU_ITEMS));
    }
    
    const storedOrders = localStorage.getItem("slice_matic_orders");
    if (storedOrders) {
      orders = JSON.parse(storedOrders);
    }
  } catch (e) {
    console.error("LocalStorage error:", e);
  }
  
  return { menu, orders };
}

function saveLocalDB(menu: MenuItem[], orders: Order[]) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem("slice_matic_menu", JSON.stringify(menu));
    localStorage.setItem("slice_matic_orders", JSON.stringify(orders));
  } catch (e) {
    console.error("Failed to save to local storage:", e);
  }
}

// Database Helpers (Strict production Supabase calls)

export async function getMenuItems(): Promise<MenuItem[]> {
  assertSupabaseConfigured("Supabase is not configured. Please define VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in your environment.");
  const { data, error } = await supabase
    .from("menu_items")
    .select("*")
    .order("code");
  
  if (error) {
    console.error("Supabase getMenuItems error:", error);
    throw error;
  }
  return data as MenuItem[];
}

export async function addMenuItem(item: Omit<MenuItem, "id" | "updated_at">): Promise<MenuItem> {
  assertSupabaseConfigured();
  const { data, error } = await supabase
    .from("menu_items")
    .insert([item])
    .select();
  
  if (error) {
    console.error("Supabase addMenuItem error:", error);
    throw error;
  }
  if (data && data[0]) {
    return data[0] as MenuItem;
  }
  throw new Error("Failed to insert menu item");
}

export async function updateMenuItem(id: string, updates: Partial<MenuItem>): Promise<MenuItem> {
  assertSupabaseConfigured();
  const { data, error } = await supabase
    .from("menu_items")
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select();
  
  if (error) {
    console.error("Supabase updateMenuItem error:", error);
    throw error;
  }
  if (data && data[0]) {
    return data[0] as MenuItem;
  }
  throw new Error(`Menu item with ID ${id} not found`);
}

export async function createOrder(
  order: Omit<Order, "id" | "created_at" | "items">, 
  itemsSnapshots: { menu_item_id: string; category: string; name: string; unit_price_snapshot: number }[]
): Promise<Order> {
  assertSupabaseConfigured();
  
  // 1. Insert order
  const { data: orderData, error: orderError } = await supabase
    .from("orders")
    .insert([{
      table_number: order.table_number,
      customer_name: order.customer_name,
      customer_phone: order.customer_phone,
      quantity: order.quantity,
      unit_price: order.unit_price,
      subtotal: order.subtotal,
      discount: order.discount,
      gst: order.gst,
      total_payable: order.total_payable,
      payment_mode: order.payment_mode,
      order_source: order.order_source,
      status: order.status,
      staff_id: order.staff_id || null
    }])
    .select();

  if (orderError) {
    console.error("Supabase order insert error:", orderError);
    throw orderError;
  }
  
  if (orderData && orderData[0]) {
    const insertedOrder = orderData[0];
    
    // 2. Insert order items
    const itemsToInsert = itemsSnapshots.map(it => ({
      order_id: insertedOrder.id,
      menu_item_id: it.menu_item_id,
      category: it.category,
      name: it.name,
      unit_price_snapshot: it.unit_price_snapshot
    }));

    const { error: itemsError } = await supabase
      .from("order_items")
      .insert(itemsToInsert);

    if (itemsError) {
      console.error("Supabase order_items insert error:", itemsError);
      throw itemsError;
    }
    
    return {
      ...insertedOrder,
      items: itemsToInsert
    } as Order;
  }
  throw new Error("Failed to insert order");
}

export async function getOrders(filters?: {
  date?: string; // YYYY-MM-DD
  paymentMode?: string;
  status?: string;
}): Promise<Order[]> {
  assertSupabaseConfigured();
  
  let query = supabase
    .from("orders")
    .select(`
      *,
      order_items (
        id,
        order_id,
        menu_item_id,
        category,
        name,
        unit_price_snapshot
      )
    `)
    .order("created_at", { ascending: false });

  if (filters) {
    if (filters.date) {
      const startOfDay = `${filters.date}T00:00:00.000Z`;
      const endOfDay = `${filters.date}T23:59:59.999Z`;
      query = query.gte("created_at", startOfDay).lte("created_at", endOfDay);
    }
    if (filters.paymentMode && filters.paymentMode !== "All") {
      query = query.eq("payment_mode", filters.paymentMode);
    }
    if (filters.status && filters.status !== "All") {
      query = query.eq("status", filters.status);
    }
  }

  const { data, error } = await query;
  if (error) {
    console.error("Supabase getOrders error:", error);
    throw error;
  }
  
  return (data || []).map(order => ({
    ...order,
    items: order.order_items
  })) as Order[];
}

export async function updateOrderStatus(orderId: string, status: "confirmed" | "preparing" | "ready" | "delivered"): Promise<void> {
  assertSupabaseConfigured();
  
  const { error } = await supabase
    .from("orders")
    .update({ status })
    .eq("id", orderId);
  
  if (error) {
    console.error("Supabase updateOrderStatus error:", error);
    throw error;
  }
}

// Bulk seed upsert
export async function bulkUpsertMenuItems(items: Omit<MenuItem, "id" | "updated_at">[]): Promise<{ imported: number, updated: number, skipped: number, report: string[] }> {
  assertSupabaseConfigured();
  return upsertMenuItems(supabase, items);
}
