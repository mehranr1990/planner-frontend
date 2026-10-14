/*
 * Fixed sample values. A fixed date (not "now") keeps server and client output
 * identical and matches the boards: Tue 13 Oct 2026 = 21 Mehr 1405.
 */
export const SAMPLE_DATE = new Date(2026, 9, 13, 14, 35);
export const SAMPLE_RANGE = [new Date(2026, 9, 10), new Date(2026, 9, 16)] as const;
export const SAMPLE_DURATION_MINUTES = 90;

export const SAMPLE_AMOUNT_TOMAN = 2_000_000;
export const SAMPLE_NUMBER = 1_234_567.89;
export const SAMPLE_PROGRESS = 68;
