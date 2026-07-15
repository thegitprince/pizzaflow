import { describe, expect, it } from 'vitest';
import {
  DISCOUNT_RATE,
  DISCOUNT_THRESHOLD,
  GST_RATE,
  calculatePricing,
  validateName,
  validatePhone,
  validateQuantity,
} from './core';

describe('validateName', () => {
  it('accepts a valid name and returns the trimmed value', () => {
    expect(validateName('  Rajan Kumar  ')).toEqual({ ok: true, value: 'Rajan Kumar' });
  });

  it('accepts a two-character name (lower boundary)', () => {
    expect(validateName('Jo')).toEqual({ ok: true, value: 'Jo' });
  });

  it('accepts a 40-character name (upper boundary)', () => {
    const name = 'a'.repeat(40);
    expect(validateName(name)).toEqual({ ok: true, value: name });
  });

  it('rejects a blank name', () => {
    expect(validateName('   ')).toEqual({ ok: false, error: 'Name cannot be blank.' });
    expect(validateName('')).toEqual({ ok: false, error: 'Name cannot be blank.' });
  });

  it('rejects names containing digits or symbols', () => {
    expect(validateName('Rajan123')).toEqual({
      ok: false,
      error: 'Name must contain letters and spaces only.',
    });
    expect(validateName('Ra-jan')).toEqual({
      ok: false,
      error: 'Name must contain letters and spaces only.',
    });
  });

  it('rejects a single-character name', () => {
    expect(validateName('J')).toEqual({
      ok: false,
      error: 'Name must be at least 2 characters.',
    });
  });

  it('rejects a name longer than 40 characters', () => {
    expect(validateName('a'.repeat(41))).toEqual({
      ok: false,
      error: 'Name must be 40 characters or less.',
    });
  });
});

describe('validatePhone', () => {
  it.each(['6123456789', '7000000000', '8888888888', '9999999999'])(
    'accepts a valid 10-digit phone starting with a valid prefix: %s',
    (phone) => {
      expect(validatePhone(phone)).toEqual({ ok: true, value: phone });
    },
  );

  it('trims surrounding whitespace before validating', () => {
    expect(validatePhone('  9876543210  ')).toEqual({ ok: true, value: '9876543210' });
  });

  it('rejects phones that are not exactly 10 digits', () => {
    const err = { ok: false, error: 'Phone must be exactly 10 digits.' };
    expect(validatePhone('98765')).toEqual(err);
    expect(validatePhone('98765432101')).toEqual(err);
    expect(validatePhone('98765abcde')).toEqual(err);
    expect(validatePhone('')).toEqual(err);
  });

  it.each(['0123456789', '1234567890', '5123456789'])(
    'rejects a 10-digit phone with an invalid leading digit: %s',
    (phone) => {
      expect(validatePhone(phone)).toEqual({
        ok: false,
        error: 'Phone must start with 6, 7, 8, or 9.',
      });
    },
  );
});

describe('validateQuantity', () => {
  it('accepts a valid quantity and returns it as a number', () => {
    expect(validateQuantity('3')).toEqual({ ok: true, value: 3 });
  });

  it('accepts the minimum quantity of 1', () => {
    expect(validateQuantity(' 1 ')).toEqual({ ok: true, value: 1 });
  });

  it('accepts the maximum quantity of 10', () => {
    expect(validateQuantity('10')).toEqual({ ok: true, value: 10 });
  });

  it('rejects a blank quantity', () => {
    expect(validateQuantity('   ')).toEqual({ ok: false, error: 'Please enter a quantity.' });
  });

  it('rejects non-integer input', () => {
    const err = {
      ok: false,
      error: 'Quantity must be a whole number (e.g. 2, not "two" or 2.5).',
    };
    expect(validateQuantity('2.5')).toEqual(err);
    expect(validateQuantity('two')).toEqual(err);
    expect(validateQuantity('-3')).toEqual(err);
  });

  it('rejects a quantity below 1', () => {
    expect(validateQuantity('0')).toEqual({ ok: false, error: 'Minimum quantity is 1.' });
  });

  it('rejects a quantity above 10', () => {
    expect(validateQuantity('11')).toEqual({ ok: false, error: 'Maximum 10 pizzas per order.' });
  });
});

describe('calculatePricing', () => {
  it('computes unit price, subtotal, gst and total without discount below the threshold', () => {
    const result = calculatePricing(149, 249, 69, 1);
    const unitPrice = 149 + 249 + 69; // 467
    const subtotal = unitPrice; // qty 1
    const gst = subtotal * GST_RATE;
    expect(result).toEqual({
      unitPrice,
      subtotal,
      discount: 0,
      taxableAmount: subtotal,
      gst,
      totalPayable: subtotal + gst,
    });
  });

  it('applies no discount just below the discount threshold', () => {
    const result = calculatePricing(100, 0, 0, DISCOUNT_THRESHOLD - 1);
    expect(result.discount).toBe(0);
  });

  it('applies the discount at exactly the discount threshold', () => {
    const result = calculatePricing(100, 0, 0, DISCOUNT_THRESHOLD);
    const subtotal = 100 * DISCOUNT_THRESHOLD;
    expect(result.discount).toBeCloseTo(subtotal * DISCOUNT_RATE, 10);
    expect(result.taxableAmount).toBeCloseTo(subtotal - subtotal * DISCOUNT_RATE, 10);
  });

  it('computes a fully discounted and taxed order correctly', () => {
    const result = calculatePricing(149, 249, 69, 5);
    const unitPrice = 467;
    const subtotal = unitPrice * 5; // 2335
    const discount = subtotal * DISCOUNT_RATE; // 233.5
    const taxableAmount = subtotal - discount; // 2101.5
    const gst = taxableAmount * GST_RATE; // 378.27
    expect(result).toEqual({
      unitPrice,
      subtotal,
      discount,
      taxableAmount,
      gst,
      totalPayable: taxableAmount + gst,
    });
  });

  it('handles zero add-on prices', () => {
    const result = calculatePricing(0, 0, 0, 3);
    expect(result).toEqual({
      unitPrice: 0,
      subtotal: 0,
      discount: 0,
      taxableAmount: 0,
      gst: 0,
      totalPayable: 0,
    });
  });

  it('exposes the pricing constants used for the rules', () => {
    expect(DISCOUNT_THRESHOLD).toBe(5);
    expect(DISCOUNT_RATE).toBe(0.1);
    expect(GST_RATE).toBe(0.18);
  });
});
