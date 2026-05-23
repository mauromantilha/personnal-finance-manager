-- Categories (hierarchical, replaces hardcoded frontend array)
CREATE TABLE IF NOT EXISTS categories (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  parent_id TEXT REFERENCES categories(id),
  icon TEXT NOT NULL DEFAULT '📦',
  color TEXT NOT NULL DEFAULT '#6B7280',
  type TEXT NOT NULL DEFAULT 'both' -- 'income', 'expense', 'both'
);

-- Parent categories
INSERT OR IGNORE INTO categories VALUES ('cat-alimentacao',    'Alimentação',    NULL,              '🍽️',  '#EA580C', 'expense');
INSERT OR IGNORE INTO categories VALUES ('cat-transporte',     'Transporte',     NULL,              '🚗',  '#0284C7', 'expense');
INSERT OR IGNORE INTO categories VALUES ('cat-moradia',        'Moradia',        NULL,              '🏠',  '#7C3AED', 'expense');
INSERT OR IGNORE INTO categories VALUES ('cat-saude',          'Saúde',          NULL,              '❤️',  '#DC2626', 'expense');
INSERT OR IGNORE INTO categories VALUES ('cat-educacao',       'Educação',       NULL,              '📚',  '#0891B2', 'expense');
INSERT OR IGNORE INTO categories VALUES ('cat-lazer',          'Lazer',          NULL,              '🎮',  '#16A34A', 'expense');
INSERT OR IGNORE INTO categories VALUES ('cat-vestuario',      'Vestuário',      NULL,              '👕',  '#DB2777', 'expense');
INSERT OR IGNORE INTO categories VALUES ('cat-investimentos',  'Investimentos',  NULL,              '📈',  '#059669', 'both');
INSERT OR IGNORE INTO categories VALUES ('cat-receita',        'Receita',        NULL,              '💰',  '#EAB308', 'income');
INSERT OR IGNORE INTO categories VALUES ('cat-outros',         'Outros',         NULL,              '📦',  '#6B7280', 'both');

-- Subcategories - Alimentação
INSERT OR IGNORE INTO categories VALUES ('cat-supermercado',   'Supermercado',   'cat-alimentacao', '🛒',  '#EA580C', 'expense');
INSERT OR IGNORE INTO categories VALUES ('cat-restaurante',    'Restaurante',    'cat-alimentacao', '🍴',  '#F97316', 'expense');
INSERT OR IGNORE INTO categories VALUES ('cat-delivery',       'Delivery',       'cat-alimentacao', '🛵',  '#FB923C', 'expense');
INSERT OR IGNORE INTO categories VALUES ('cat-padaria',        'Padaria/Café',   'cat-alimentacao', '☕',  '#FDBA74', 'expense');

-- Subcategories - Transporte
INSERT OR IGNORE INTO categories VALUES ('cat-uber',           'Uber/99',        'cat-transporte',  '📱',  '#0284C7', 'expense');
INSERT OR IGNORE INTO categories VALUES ('cat-combustivel',    'Combustível',    'cat-transporte',  '⛽',  '#0369A1', 'expense');
INSERT OR IGNORE INTO categories VALUES ('cat-transporte-pub', 'Transporte Púb.','cat-transporte',  '🚌',  '#075985', 'expense');
INSERT OR IGNORE INTO categories VALUES ('cat-estacionamento', 'Estacionamento', 'cat-transporte',  '🅿️',  '#0C4A6E', 'expense');

-- Subcategories - Moradia
INSERT OR IGNORE INTO categories VALUES ('cat-aluguel',        'Aluguel',        'cat-moradia',     '🔑',  '#7C3AED', 'expense');
INSERT OR IGNORE INTO categories VALUES ('cat-condominio',     'Condomínio',     'cat-moradia',     '🏢',  '#6D28D9', 'expense');
INSERT OR IGNORE INTO categories VALUES ('cat-agua-luz',       'Água/Luz/Gás',   'cat-moradia',     '💡',  '#5B21B6', 'expense');
INSERT OR IGNORE INTO categories VALUES ('cat-internet',       'Internet/TV',    'cat-moradia',     '📡',  '#4C1D95', 'expense');

-- Subcategories - Saúde
INSERT OR IGNORE INTO categories VALUES ('cat-farmacia',       'Farmácia',       'cat-saude',       '💊',  '#DC2626', 'expense');
INSERT OR IGNORE INTO categories VALUES ('cat-consulta',       'Consulta/Exame', 'cat-saude',       '🏥',  '#B91C1C', 'expense');
INSERT OR IGNORE INTO categories VALUES ('cat-plano-saude',    'Plano de Saúde', 'cat-saude',       '🩺',  '#991B1B', 'expense');
INSERT OR IGNORE INTO categories VALUES ('cat-academia',       'Academia',       'cat-saude',       '🏋️',  '#7F1D1D', 'expense');

-- Subcategories - Educação
INSERT OR IGNORE INTO categories VALUES ('cat-cursos',         'Cursos Online',  'cat-educacao',    '💻',  '#0891B2', 'expense');
INSERT OR IGNORE INTO categories VALUES ('cat-livros',         'Livros',         'cat-educacao',    '📖',  '#0E7490', 'expense');
INSERT OR IGNORE INTO categories VALUES ('cat-faculdade',      'Faculdade',      'cat-educacao',    '🎓',  '#155E75', 'expense');

-- Subcategories - Lazer
INSERT OR IGNORE INTO categories VALUES ('cat-streaming',      'Streaming',      'cat-lazer',       '📺',  '#16A34A', 'expense');
INSERT OR IGNORE INTO categories VALUES ('cat-viagem',         'Viagem',         'cat-lazer',       '✈️',  '#15803D', 'expense');
INSERT OR IGNORE INTO categories VALUES ('cat-cinema',         'Cinema/Show',    'cat-lazer',       '🎬',  '#166534', 'expense');
INSERT OR IGNORE INTO categories VALUES ('cat-jogos',          'Jogos',          'cat-lazer',       '🎮',  '#14532D', 'expense');

-- Subcategories - Receita
INSERT OR IGNORE INTO categories VALUES ('cat-salario',        'Salário',        'cat-receita',     '💼',  '#EAB308', 'income');
INSERT OR IGNORE INTO categories VALUES ('cat-freelance',      'Freelance',      'cat-receita',     '🖥️',  '#CA8A04', 'income');
INSERT OR IGNORE INTO categories VALUES ('cat-dividendos',     'Dividendos',     'cat-receita',     '📊',  '#A16207', 'income');
INSERT OR IGNORE INTO categories VALUES ('cat-bonus',          'Bônus/13º',      'cat-receita',     '🎁',  '#854D0E', 'income');

-- Subcategories - Investimentos
INSERT OR IGNORE INTO categories VALUES ('cat-aporte',         'Aporte',         'cat-investimentos','💸', '#059669', 'expense');
INSERT OR IGNORE INTO categories VALUES ('cat-resgate',        'Resgate',        'cat-investimentos','🏧', '#047857', 'income');
