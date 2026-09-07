// Sanitizador e mascarador de PII (Personally Identifiable Information)
// Projetado especificamente para o mercado financeiro brasileiro.
// Executado no edge antes de qualquer envio de dados para provedores de IA (Groq).

/**
 * Validação do algoritmo módulo 11 do CPF brasileiro.
 * Evita mascarar sequências aleatórias de 11 dígitos que não sejam CPFs válidos.
 */
export function isValidCPF(cpfDigits: string): boolean {
  const clean = cpfDigits.replace(/\D/g, '');
  if (clean.length !== 11) return false;
  if (/^(\d)\1{10}$/.test(clean)) return false;

  let sum = 0;
  for (let i = 0; i < 9; i++) sum += parseInt(clean.charAt(i), 10) * (10 - i);
  let rev = 11 - (sum % 11);
  if (rev === 10 || rev === 11) rev = 0;
  if (rev !== parseInt(clean.charAt(9), 10)) return false;

  sum = 0;
  for (let i = 0; i < 10; i++) sum += parseInt(clean.charAt(i), 10) * (11 - i);
  rev = 11 - (sum % 11);
  if (rev === 10 || rev === 11) rev = 0;
  return rev === parseInt(clean.charAt(10), 10);
}

/**
 * Validação simplificada de algoritmo de Luhn (Mod 10) para número de cartão de crédito.
 */
export function isValidLuhn(digits: string): boolean {
  const clean = digits.replace(/\D/g, '');
  if (clean.length < 13 || clean.length > 19) return false;
  let sum = 0;
  let shouldDouble = false;
  for (let i = clean.length - 1; i >= 0; i--) {
    let digit = parseInt(clean.charAt(i), 10);
    if (shouldDouble) {
      digit *= 2;
      if (digit > 9) digit -= 9;
    }
    sum += digit;
    shouldDouble = !shouldDouble;
  }
  return sum % 10 === 0;
}

/**
 * Mascara números de cartão de crédito (PAN) mantendo apenas os últimos 4 dígitos.
 */
export function maskCardPAN(pan: string): string {
  const clean = pan.replace(/\D/g, '');
  const lastFour = clean.slice(-4);
  return `•••• •••• •••• ${lastFour}`;
}

/**
 * Mascara qualquer texto removendo/ocultando:
 * 1. CPFs (formatados ou apenas dígitos)
 * 2. CNPJs
 * 3. Cartões de Crédito (com validação Luhn quando 13-19 dígitos)
 * 4. CVVs (código de segurança)
 * 5. Agência e Conta Bancária
 */
export function maskPII(text: string): string {
  if (!text || typeof text !== 'string') return text;

  let output = text;

  // 1. Mascarar Cartões de Crédito
  // Formato explícito (ex: 4532 1234 5678 9010 ou 4532-1234-5678-9010) é mascarado diretamente
  const FORMATTED_CARD_REGEX = /\b(?:\d{4}[-\s]){3}\d{4}\b|\b(?:\d{4}[-\s]){2}\d{4}[-\s]\d{3}\b/g;
  output = output.replace(FORMATTED_CARD_REGEX, (match) => {
    return maskCardPAN(match);
  });

  // Números contínuos de 13 a 19 dígitos passam por validação Luhn para evitar falsos positivos
  const CONTINUOUS_DIGITS_REGEX = /\b\d{13,19}\b/g;
  output = output.replace(CONTINUOUS_DIGITS_REGEX, (match) => {
    if (isValidLuhn(match)) {
      return maskCardPAN(match);
    }
    return match;
  });

  // 2. CVV / CVC (3 ou 4 dígitos acompanhados de termos como CVV, CVC, COD, SEG)
  const CVV_REGEX = /\b(?:cvv|cvc|cód(?:igo)?(?:\s+de)?\s+segurança)[:\s]*([0-9]{3,4})\b/gi;
  output = output.replace(CVV_REGEX, (match) => {
    return match.replace(/[0-9]{3,4}$/, '•••');
  });

  // 3. CPF formatado (ex: 123.456.789-00)
  const CPF_FORMATTED_REGEX = /\b\d{3}\.\d{3}\.\d{3}-\d{2}\b/g;
  output = output.replace(CPF_FORMATTED_REGEX, '[CPF_PROTEGIDO]');

  // 4. CPF sem formatação (11 dígitos sequenciais que passam no algoritmo oficial de CPF)
  const ELEVEN_DIGITS_REGEX = /\b\d{11}\b/g;
  output = output.replace(ELEVEN_DIGITS_REGEX, (match) => {
    if (isValidCPF(match)) {
      return '[CPF_PROTEGIDO]';
    }
    return match;
  });

  // 5. CNPJ formatado (ex: 12.345.678/0001-90)
  const CNPJ_REGEX = /\b\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}\b/g;
  output = output.replace(CNPJ_REGEX, '[CNPJ_PROTEGIDO]');

  // 6. Agência e Conta Bancária (ex: Agência 1234-5, Conta 12345-6, Ag: 0001, C/C: 123456-7)
  const BANK_ACC_REGEX = /\b(?:ag[êe]ncia|ag\.?|c\/c|conta(?:\s+corrente)?|conta)[:\s]*([0-9]{3,6}(?:[-.][0-9Xx])?)\b/gi;
  output = output.replace(BANK_ACC_REGEX, (match) => {
    return match.replace(/([0-9]{3,6}(?:[-.][0-9Xx])?)$/, '[DADO_BANCÁRIO_PROTEGIDO]');
  });

  return output;
}

/**
 * Sanitiza recursivamente objetos ou arrays antes de enviar para o LLM.
 */
export function sanitizeObjectPII<T>(input: T): T {
  if (input === null || input === undefined) return input;
  if (typeof input === 'string') return maskPII(input) as unknown as T;
  if (Array.isArray(input)) {
    return input.map(item => sanitizeObjectPII(item)) as unknown as T;
  }
  if (typeof input === 'object') {
    const res: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(input as Record<string, unknown>)) {
      res[k] = sanitizeObjectPII(v);
    }
    return res as T;
  }
  return input;
}
