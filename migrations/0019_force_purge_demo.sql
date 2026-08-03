-- 0019: Force purge de seed demo (v2)
-- A 0018 podia ficar marcada em schema_migrations sem limpar de fato.
-- ensure-schema.ts detecta fingerprints e faz wipe completo; este arquivo
-- espelha a limpeza por ID para migrate-all.mjs.

DELETE FROM transactions WHERE id IN (
  'tx-1','tx-2','tx-3','tx-4','tx-5','tx-6','tx-7','tx-8','tx-9','tx-10','tx-11','tx-12'
);
DELETE FROM invoices WHERE id IN ('inv-cc1-2605','inv-cc2-2605','inv-cc1-2604');
DELETE FROM credit_cards WHERE id IN ('cc-1','cc-2');
DELETE FROM recurrences WHERE id IN ('rec-1','rec-2','rec-3','rec-4','rec-5','rec-6','rec-7');
DELETE FROM budgets WHERE id IN ('b-1','b-2','b-3','b-4','b-5','b-6');
DELETE FROM goals WHERE id IN ('g-1','g-2');
DELETE FROM alerts WHERE id IN ('alt-1','alt-2','alt-3');
DELETE FROM connections WHERE id IN ('conn-itau','conn-inter','conn-xp','conn-bradesco');
DELETE FROM accounts WHERE id IN ('acc-1','acc-2','acc-3','acc-4');

-- Nomes clássicos do seed (caso IDs tenham mudado)
DELETE FROM transactions WHERE description IN (
  'Salário Mensal MKS Brasil', 'Aluguel Loft Paulista'
);
DELETE FROM accounts WHERE name IN (
  'Conta Itaú Personalité', 'Carteira Principal', 'Poupança Inter', 'XP Carteira Global'
);
DELETE FROM goals WHERE name IN ('Reserva de Emergência', 'Viagem de Férias Japão');
DELETE FROM credit_cards WHERE name LIKE '%Ultravioleta%';
