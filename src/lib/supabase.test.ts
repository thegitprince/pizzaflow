import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const { from } = vi.hoisted(() => ({ from: vi.fn() }));

vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => ({ from })),
}));

type BuilderConfig = { result?: unknown; single?: unknown };

// A chainable + awaitable stand-in for the Supabase query builder.
function builder(config: BuilderConfig = {}) {
  const b: Record<string, unknown> = {};
  const chain = () => b;
  for (const method of ['select', 'order', 'insert', 'update', 'eq', 'gte', 'lte']) {
    b[method] = vi.fn(chain);
  }
  b.maybeSingle = vi.fn(() => Promise.resolve(config.single));
  b.then = (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) =>
    Promise.resolve(config.result).then(resolve, reject);
  return b;
}

type SupabaseModule = typeof import('./supabase');
let mod: SupabaseModule;

beforeAll(async () => {
  vi.stubEnv('VITE_SUPABASE_URL', 'http://localhost:54321');
  vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'anon-key');
  mod = await import('./supabase');
});

beforeEach(() => {
  from.mockReset();
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('getMenuItems', () => {
  it('returns menu rows on success', async () => {
    const rows = [{ id: 'b1', code: 'B1' }];
    from.mockReturnValue(builder({ result: { data: rows, error: null } }));

    await expect(mod.getMenuItems()).resolves.toEqual(rows);
    expect(from).toHaveBeenCalledWith('menu_items');
  });

  it('throws when the query returns an error', async () => {
    const error = new Error('db down');
    from.mockReturnValue(builder({ result: { data: null, error } }));

    await expect(mod.getMenuItems()).rejects.toBe(error);
  });
});

describe('addMenuItem', () => {
  it('returns the inserted row', async () => {
    const inserted = { id: 'x', code: 'P9', name: 'New' };
    from.mockReturnValue(builder({ result: { data: [inserted], error: null } }));

    await expect(
      mod.addMenuItem({
        code: 'P9',
        category: 'pizza',
        name: 'New',
        price_inr: 200,
        description: '',
        is_active: true,
      }),
    ).resolves.toEqual(inserted);
  });

  it('throws when insert yields no row', async () => {
    from.mockReturnValue(builder({ result: { data: [], error: null } }));

    await expect(
      mod.addMenuItem({
        code: 'P9',
        category: 'pizza',
        name: 'New',
        price_inr: 200,
        description: '',
        is_active: true,
      }),
    ).rejects.toThrow('Failed to insert menu item');
  });
});

describe('updateMenuItem', () => {
  it('returns the updated row', async () => {
    const updated = { id: 'x', name: 'Updated' };
    from.mockReturnValue(builder({ result: { data: [updated], error: null } }));

    await expect(mod.updateMenuItem('x', { name: 'Updated' })).resolves.toEqual(updated);
  });

  it('throws a not-found error when no row is returned', async () => {
    from.mockReturnValue(builder({ result: { data: [], error: null } }));

    await expect(mod.updateMenuItem('missing', { name: 'x' })).rejects.toThrow(
      'Menu item with ID missing not found',
    );
  });
});

describe('createOrder', () => {
  const order = {
    table_number: 1,
    customer_name: 'A',
    customer_phone: '9999999999',
    quantity: 1,
    unit_price: 100,
    subtotal: 100,
    discount: 0,
    gst: 18,
    total_payable: 118,
    payment_mode: 'Cash' as const,
    order_source: 'staff' as const,
    status: 'confirmed' as const,
  };
  const snapshots = [
    { menu_item_id: 'b1', category: 'base', name: 'Thin Crust', unit_price_snapshot: 149 },
  ];

  it('inserts the order then its items and returns the combined order', async () => {
    from
      .mockReturnValueOnce(builder({ result: { data: [{ id: 'order-1' }], error: null } }))
      .mockReturnValueOnce(builder({ result: { error: null } }));

    const result = await mod.createOrder(order, snapshots);

    expect(result.id).toBe('order-1');
    expect(result.items).toEqual([
      {
        order_id: 'order-1',
        menu_item_id: 'b1',
        category: 'base',
        name: 'Thin Crust',
        unit_price_snapshot: 149,
      },
    ]);
    expect(from).toHaveBeenNthCalledWith(1, 'orders');
    expect(from).toHaveBeenNthCalledWith(2, 'order_items');
  });

  it('throws when the order items insert fails', async () => {
    const itemsError = new Error('items failed');
    from
      .mockReturnValueOnce(builder({ result: { data: [{ id: 'order-1' }], error: null } }))
      .mockReturnValueOnce(builder({ result: { error: itemsError } }));

    await expect(mod.createOrder(order, snapshots)).rejects.toBe(itemsError);
  });

  it('throws when the order insert errors', async () => {
    const orderError = new Error('order failed');
    from.mockReturnValueOnce(builder({ result: { data: null, error: orderError } }));

    await expect(mod.createOrder(order, snapshots)).rejects.toBe(orderError);
  });
});

describe('getOrders', () => {
  it('maps order_items into items with no filters', async () => {
    const rows = [{ id: 'o1', order_items: [{ id: 'i1' }] }];
    from.mockReturnValue(builder({ result: { data: rows, error: null } }));

    const result = await mod.getOrders();

    expect(result).toEqual([{ id: 'o1', order_items: [{ id: 'i1' }], items: [{ id: 'i1' }] }]);
  });

  it('applies date, payment mode and status filters', async () => {
    const b = builder({ result: { data: [], error: null } });
    from.mockReturnValue(b);

    await mod.getOrders({ date: '2026-07-15', paymentMode: 'UPI', status: 'ready' });

    expect(b.gte).toHaveBeenCalledWith('created_at', '2026-07-15T00:00:00.000Z');
    expect(b.lte).toHaveBeenCalledWith('created_at', '2026-07-15T23:59:59.999Z');
    expect(b.eq).toHaveBeenCalledWith('payment_mode', 'UPI');
    expect(b.eq).toHaveBeenCalledWith('status', 'ready');
  });

  it('ignores "All" sentinel filter values', async () => {
    const b = builder({ result: { data: [], error: null } });
    from.mockReturnValue(b);

    await mod.getOrders({ paymentMode: 'All', status: 'All' });

    expect(b.eq).not.toHaveBeenCalled();
  });

  it('returns an empty array when data is null', async () => {
    from.mockReturnValue(builder({ result: { data: null, error: null } }));

    await expect(mod.getOrders()).resolves.toEqual([]);
  });

  it('throws on query error', async () => {
    const error = new Error('query failed');
    from.mockReturnValue(builder({ result: { data: null, error } }));

    await expect(mod.getOrders()).rejects.toBe(error);
  });
});

describe('updateOrderStatus', () => {
  it('resolves when the update succeeds', async () => {
    from.mockReturnValue(builder({ result: { error: null } }));

    await expect(mod.updateOrderStatus('o1', 'delivered')).resolves.toBeUndefined();
  });

  it('throws when the update fails', async () => {
    const error = new Error('update failed');
    from.mockReturnValue(builder({ result: { error } }));

    await expect(mod.updateOrderStatus('o1', 'ready')).rejects.toBe(error);
  });
});

describe('bulkUpsertMenuItems', () => {
  const item = {
    code: 'P9',
    category: 'pizza' as const,
    name: 'Test Pizza',
    price_inr: 299,
    description: 'desc',
    is_active: true,
  };

  it('imports a new item', async () => {
    from
      .mockReturnValueOnce(builder({ single: { data: null } }))
      .mockReturnValueOnce(builder({ result: { error: null } }));

    const result = await mod.bulkUpsertMenuItems([item]);

    expect(result).toMatchObject({ imported: 1, updated: 0, skipped: 0 });
    expect(result.report).toEqual(['Imported P9: Test Pizza']);
  });

  it('updates an existing item', async () => {
    from
      .mockReturnValueOnce(builder({ single: { data: { id: 'existing' } } }))
      .mockReturnValueOnce(builder({ result: { error: null } }));

    const result = await mod.bulkUpsertMenuItems([item]);

    expect(result).toMatchObject({ imported: 0, updated: 1, skipped: 0 });
    expect(result.report).toEqual(['Updated P9: Test Pizza']);
  });

  it('skips an item when the DB write errors', async () => {
    from
      .mockReturnValueOnce(builder({ single: { data: null } }))
      .mockReturnValueOnce(builder({ result: { error: new Error('insert failed') } }));

    const result = await mod.bulkUpsertMenuItems([item]);

    expect(result).toMatchObject({ imported: 0, updated: 0, skipped: 1 });
    expect(result.report[0]).toContain('Skipped P9');
    expect(result.report[0]).toContain('insert failed');
  });
});

describe('exported configuration', () => {
  it('exposes the default menu constants and configured flag', () => {
    expect(mod.isSupabaseConfigured).toBe(true);
    expect(mod.supabase).toBeDefined();
  });
});
