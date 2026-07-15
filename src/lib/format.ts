// src/lib/format.ts
// Shared currency formatting helpers for consistent ₹ (INR) rendering.

// Fixed two-decimal amount without thousands grouping (e.g. ₹1234.50)
export function formatRupees(value: number | string): string {
  return `₹${Number(value).toFixed(2)}`;
}

// Localized Indian grouping with two decimals (e.g. ₹1,23,456.00)
export function formatRupeesGrouped(value: number | string): string {
  return `₹${Number(value).toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}
