import { describe, expect, it } from 'vitest';
import { maskPII, isValidCPF, isValidLuhn, sanitizeObjectPII } from './pii-masker';

describe('pii-masker', () => {
  it('detecta e valida CPF real', () => {
    // CPFs matematicamente válidos
    expect(isValidCPF('52998224725')).toBe(true);
    expect(isValidCPF('11111111111')).toBe(false); // repetição
    expect(isValidCPF('12345678901')).toBe(false); // dígitos verificadores errados
  });

  it('mascara CPF formatado e desformatado', () => {
    const text1 = 'Meu CPF é 529.982.247-25 para pagamento.';
    expect(maskPII(text1)).toBe('Meu CPF é [CPF_PROTEGIDO] para pagamento.');

    const text2 = 'Chave CPF 52998224725 enviada.';
    expect(maskPII(text2)).toBe('Chave CPF [CPF_PROTEGIDO] enviada.');
  });

  it('não mascara números arbitrários de 11 dígitos que não sejam CPFs', () => {
    const text = 'Código de rastreio 12345678901 do pedido.';
    expect(maskPII(text)).toBe(text);
  });

  it('mascara CNPJ formatado', () => {
    const text = 'Nota emitida pela empresa 12.345.678/0001-90 LTDA.';
    expect(maskPII(text)).toBe('Nota emitida pela empresa [CNPJ_PROTEGIDO] LTDA.');
  });

  it('mascara números de cartão de crédito e preserva últimos 4 dígitos', () => {
    // Cartão Visa de teste válido no algoritmo de Luhn: 4532 0150 0000 0007
    const visa = '4532 0150 0000 0007';
    expect(isValidLuhn(visa)).toBe(true);
    expect(maskPII(`Cartão número ${visa} para débito`)).toContain('•••• •••• •••• 0007');
  });

  it('mascara CVV', () => {
    const text = 'CVV: 123 do cartão';
    expect(maskPII(text)).toBe('CVV: ••• do cartão');
  });

  it('mascara Agência e Conta bancária', () => {
    const text1 = 'Favorecido Banco do Brasil Agência 1234-5 Conta 54321-0';
    expect(maskPII(text1)).toContain('[DADO_BANCÁRIO_PROTEGIDO]');
  });

  it('sanitizeObjectPII mascara recursivamente objetos e arrays', () => {
    const payload = {
      user: {
        cpf: '529.982.247-25',
        notes: ['Cartão 4532 0150 0000 0007', 'Agência: 0001'],
      },
    };
    const sanitized = sanitizeObjectPII(payload);
    expect(sanitized.user.cpf).toBe('[CPF_PROTEGIDO]');
    expect(sanitized.user.notes[0]).toContain('•••• •••• •••• 0007');
    expect(sanitized.user.notes[1]).toContain('[DADO_BANCÁRIO_PROTEGIDO]');
  });
});
