export const generatePassword = (length = 16, useSymbols = true, useNumbers = true): string => {
  const charset = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const symbols = '!@#$%^&*()_+~`|}{[]:;?><,./-=';
  const numbers = '0123456789';
  
  let allowed = charset;
  if (useSymbols) allowed += symbols;
  if (useNumbers) allowed += numbers;

  let retVal = '';
  // Force at least one of each requested type to guarantee strength
  if (useSymbols) retVal += symbols[Math.floor(Math.random() * symbols.length)];
  if (useNumbers) retVal += numbers[Math.floor(Math.random() * numbers.length)];
  retVal += charset[Math.floor(Math.random() * charset.length)];

  for (let i = retVal.length; i < length; i++) {
    retVal += allowed[Math.floor(Math.random() * allowed.length)];
  }

  // Shuffle to randomize the forced characters
  return retVal.split('').sort(() => 0.5 - Math.random()).join('');
};
