// National fixed/mobile destinations only. Never accept a SIP URI or carrier prefix.
const DDD = new Set('11 12 13 14 15 16 17 18 19 21 22 24 27 28 31 32 33 34 35 37 38 41 42 43 44 45 46 47 48 49 51 53 54 55 61 62 63 64 65 66 67 68 69 71 73 74 75 77 79 81 82 83 84 85 86 87 88 89 91 92 93 94 95 96 97 98 99'.split(' '));

export function normalizeNationalDestination(value: string): string | null {
  if (typeof value !== 'string' || value.length > 32 || /[^0-9 ()+-]/.test(value) || !/^\+?[0-9 ()-]+$/.test(value)) return null;
  let digits = value.replace(/[ ()-]/g, '');
  if (digits.startsWith('+')) {
    if (!digits.startsWith('+55')) return null;
    digits = digits.slice(3);
  } else if ((digits.length === 12 || digits.length === 13) && digits.startsWith('55')) {
    digits = digits.slice(2);
  }
  if (!DDD.has(digits.slice(0, 2)) || !/^\d{2}(?:[2-5]\d{7}|9\d{8})$/.test(digits)) return null;
  return '55' + digits;
}
