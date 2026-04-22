const CHARSET = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';
const SYMBOLS = '!@#$%^&*()_+~`|}{[]:;?><,./-=';
const NUMBERS = '0123456789';

export const generatePassword = (length = 16, useSymbols = true, useNumbers = true): string => {
  let allowed = CHARSET;
  if (useSymbols) allowed += SYMBOLS;
  if (useNumbers) allowed += NUMBERS;

  let retVal = '';
  if (useSymbols) retVal += SYMBOLS[Math.floor(Math.random() * SYMBOLS.length)];
  if (useNumbers) retVal += NUMBERS[Math.floor(Math.random() * NUMBERS.length)];
  retVal += CHARSET[Math.floor(Math.random() * CHARSET.length)];

  for (let i = retVal.length; i < length; i++) {
    retVal += allowed[Math.floor(Math.random() * allowed.length)];
  }

  return retVal.split('').sort(() => 0.5 - Math.random()).join('');
};

const getRandomChars = (length: number, pool: string): string => {
  let result = '';
  for (let i = 0; i < length; i++) {
    result += pool[Math.floor(Math.random() * pool.length)];
  }
  return result;
};

export const generateSmartSuggestions = (seed: string): string[] => {
  const base = seed.trim();
  if (!base) return [];

  const l33t: Record<string, string> = { 'a': '@', 'e': '3', 'i': '1', 'l': '!', 'o': '0', 's': '$', 't': '7' };
  const allPool = CHARSET + SYMBOLS + NUMBERS;

  const suggestions: string[] = [
    // 1. Complexity Injection: Seed with mixed case + strong 8-char random suffix
    base.split('').map(c => Math.random() > 0.5 ? c.toUpperCase() : c.toLowerCase()).join('') + 
    getRandomChars(8, allPool),

    // 2. Transformed Base: L33t speak version of seed surrounded by random symbols/numbers
    getRandomChars(4, SYMBOLS + NUMBERS) + 
    base.toLowerCase().split('').map(c => l33t[c] || c).join('') + 
    getRandomChars(4, SYMBOLS + NUMBERS),

    // 3. Fortified Pattern: Prepend and append strong sequences to keep seed in middle
    getRandomChars(6, CHARSET + NUMBERS) + 
    base + 
    getRandomChars(6, SYMBOLS + NUMBERS)
  ];

  return suggestions;
};
