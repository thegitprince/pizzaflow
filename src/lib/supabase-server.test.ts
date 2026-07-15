import { beforeEach, describe, expect, it, vi } from 'vitest';

// Chainable query-builder mocks reconfigured per test.
const { maybeSingle, updateEq, update, insert, select, from } = vi.hoisted(() => {
  const maybeSingle = vi.fn();
  const updateEq = vi.fn();
  const update = vi.fn(() => ({ eq: updateEq }));
  const insert = vi.fn();
  const select = vi.fn(() => ({ eq: vi.fn(() => ({ maybeSingle })) }));
  const from = vi.fn(() => ({ select, update, insert }));
  return { maybeSingle, updateEq, update, insert, select, from };
});

vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => ({ from })),
}));

import { bulkUpsertMenuItems } from './supabase-server';

const ITEM = {
  code: 'P9',
  category: 'pizza',
  name: 'Test Pizza',
  price_inr: 299,
  description: 'desc',
  is_active: true,
};

describe('bulkUpsertMenuItems (server)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('inserts an item when it does not already exist', async () => {
    maybeSingle.mockResolvedValue({ data: null });
    insert.mockResolvedValue({ error: null });

    const result = await bulkUpsertMenuItems([ITEM]);

    expect(result.imported).toBe(1);
    expect(result.updated).toBe(0);
    expect(result.skipped).toBe(0);
    expect(result.report).toEqual(['Imported P9: Test Pizza']);
    expect(insert).toHaveBeenCalledTimes(1);
    expect(update).not.toHaveBeenCalled();
  });

  it('updates an item when it already exists', async () => {
    maybeSingle.mockResolvedValue({ data: { id: 'existing-id' } });
    updateEq.mockResolvedValue({ error: null });

    const result = await bulkUpsertMenuItems([ITEM]);

    expect(result.updated).toBe(1);
    expect(result.imported).toBe(0);
    expect(result.report).toEqual(['Updated P9: Test Pizza']);
    expect(updateEq).toHaveBeenCalledWith('id', 'existing-id');
  });

  it('skips an item and records the reason when a DB error is thrown', async () => {
    maybeSingle.mockResolvedValue({ data: null });
    insert.mockResolvedValue({ error: new Error('insert failed') });

    const result = await bulkUpsertMenuItems([ITEM]);

    expect(result.skipped).toBe(1);
    expect(result.imported).toBe(0);
    expect(result.report[0]).toContain('Skipped P9');
    expect(result.report[0]).toContain('insert failed');
  });

  it('uses "unknown" in the skip report when the item has no code', async () => {
    maybeSingle.mockResolvedValue({ data: null });
    insert.mockResolvedValue({ error: new Error('bad') });

    const result = await bulkUpsertMenuItems([{ ...ITEM, code: '' }]);

    expect(result.report[0]).toContain('Skipped unknown');
  });

  it('aggregates counts across a mixed batch', async () => {
    maybeSingle
      .mockResolvedValueOnce({ data: null }) // -> insert
      .mockResolvedValueOnce({ data: { id: 'x' } }) // -> update
      .mockResolvedValueOnce({ data: null }); // -> insert fails
    insert
      .mockResolvedValueOnce({ error: null })
      .mockResolvedValueOnce({ error: new Error('nope') });
    updateEq.mockResolvedValue({ error: null });

    const result = await bulkUpsertMenuItems([
      { ...ITEM, code: 'P1' },
      { ...ITEM, code: 'P2' },
      { ...ITEM, code: 'P3' },
    ]);

    expect(result).toMatchObject({ imported: 1, updated: 1, skipped: 1 });
    expect(result.report).toHaveLength(3);
  });
});
