-- Accounts
INSERT OR IGNORE INTO accounts VALUES ('acc-1','Carteira Principal','CASH','Dinheiro',15420,'#EAB308',0);
INSERT OR IGNORE INTO accounts VALUES ('acc-2','Conta Itaú Personalité','CHECKING','Banco Itaú',452090,'#0284C7',1);
INSERT OR IGNORE INTO accounts VALUES ('acc-3','Poupança Inter','SAVINGS','Banco Inter',1850020,'#EA580C',1);
INSERT OR IGNORE INTO accounts VALUES ('acc-4','XP Carteira Global','INVESTMENT','XP Investimentos',4210000,'#16A34A',1);

-- Connections
INSERT OR IGNORE INTO connections VALUES ('conn-itau','Banco Itaú','🏦','CONNECTED','plg_itau_98522','2026-05-19T10:00:00Z');
INSERT OR IGNORE INTO connections VALUES ('conn-inter','Banco Inter','🍊','CONNECTED','plg_inter_45fff','2026-05-19T09:12:00Z');
INSERT OR IGNORE INTO connections VALUES ('conn-xp','XP Investimentos','📈','CONNECTED','plg_xp_8811c','2026-05-18T18:30:00Z');
INSERT OR IGNORE INTO connections VALUES ('conn-bradesco','Banco Bradesco','🔴','DISCONNECTED','plg_bradesco_22394',NULL);

-- Transactions
INSERT OR IGNORE INTO transactions (id,amount_in_cents,date,type,category,description,account_id,destination_account_id,is_synced,original_merchant_name) VALUES ('tx-1',650000,'2026-05-01','REC','Receita','Salário Mensal MKS Brasil','acc-2',NULL,0,NULL);
INSERT OR IGNORE INTO transactions (id,amount_in_cents,date,type,category,description,account_id,destination_account_id,is_synced,original_merchant_name) VALUES ('tx-2',180000,'2026-05-02','DES','Moradia','Aluguel Loft Paulista','acc-2',NULL,1,'IMOVEIS SAO PAULO S/A');
INSERT OR IGNORE INTO transactions (id,amount_in_cents,date,type,category,description,account_id,destination_account_id,is_synced,original_merchant_name) VALUES ('tx-3',38240,'2026-05-05','DES','Alimentação','Supermercado Pão de Açúcar','acc-2',NULL,1,'Pao de Acucar SP Lojas');
INSERT OR IGNORE INTO transactions (id,amount_in_cents,date,type,category,description,account_id,destination_account_id,is_synced,original_merchant_name) VALUES ('tx-4',4500,'2026-05-06','DES','Transporte','Uber Viagem Central','acc-2',NULL,1,'UBER RIDES BRASIL');
INSERT OR IGNORE INTO transactions (id,amount_in_cents,date,type,category,description,account_id,destination_account_id,is_synced,original_merchant_name) VALUES ('tx-5',12000,'2026-05-08','DES','Lazer','Ingresso Cinema Imax','acc-1',NULL,0,NULL);
INSERT OR IGNORE INTO transactions (id,amount_in_cents,date,type,category,description,account_id,destination_account_id,is_synced,original_merchant_name) VALUES ('tx-6',120000,'2026-05-10','TRANS','Reserva','Aporte Mensal Poupança','acc-2','acc-3',0,NULL);
INSERT OR IGNORE INTO transactions (id,amount_in_cents,date,type,category,description,account_id,destination_account_id,is_synced,original_merchant_name) VALUES ('tx-7',250000,'2026-05-12','TRANS','Investimentos','Aporte XP Ações','acc-3','acc-4',0,NULL);
INSERT OR IGNORE INTO transactions (id,amount_in_cents,date,type,category,description,account_id,destination_account_id,is_synced,original_merchant_name) VALUES ('tx-8',18990,'2026-05-13','DES','Saúde','Drogaria São Paulo Medicamentos','acc-2',NULL,1,'DROP SAO PAULO S/A');
INSERT OR IGNORE INTO transactions (id,amount_in_cents,date,type,category,description,account_id,destination_account_id,is_synced,original_merchant_name) VALUES ('tx-9',45000,'2026-05-14','DES','Educação','Livros de Tecnologia e Negócios','acc-2',NULL,0,NULL);
INSERT OR IGNORE INTO transactions (id,amount_in_cents,date,type,category,description,account_id,destination_account_id,is_synced,original_merchant_name) VALUES ('tx-10',24000,'2026-05-15','DES','Alimentação','Jantar Coco Bambu','acc-2',NULL,1,'COCO BAMBU SHOPPING');
INSERT OR IGNORE INTO transactions (id,amount_in_cents,date,type,category,description,account_id,destination_account_id,is_synced,original_merchant_name) VALUES ('tx-11',5290,'2026-05-17','DES','Lazer','Assinatura Mensal Netflix','acc-2',NULL,1,'NETFLIX BRASIL');
INSERT OR IGNORE INTO transactions (id,amount_in_cents,date,type,category,description,account_id,destination_account_id,is_synced,original_merchant_name) VALUES ('tx-12',8500,'2026-05-18','DES','Outros','Presente Amigo Secreto','acc-1',NULL,0,NULL);

-- Budgets
INSERT OR IGNORE INTO budgets VALUES ('b-1','Alimentação',80000,62240);
INSERT OR IGNORE INTO budgets VALUES ('b-2','Transporte',30000,4500);
INSERT OR IGNORE INTO budgets VALUES ('b-3','Moradia',220000,180000);
INSERT OR IGNORE INTO budgets VALUES ('b-4','Lazer',50000,17290);
INSERT OR IGNORE INTO budgets VALUES ('b-5','Saúde',40000,18990);
INSERT OR IGNORE INTO budgets VALUES ('b-6','Educação',60000,45000);

-- Goals
INSERT OR IGNORE INTO goals VALUES ('g-1','Reserva de Emergência',3000000,1850000,'2026-12-31','#0284C7');
INSERT OR IGNORE INTO goals VALUES ('g-2','Viagem de Férias Japão',2500000,1000000,'2027-05-15','#EA580C');

-- Alerts
INSERT OR IGNORE INTO alerts VALUES ('alt-1','WARNING','Orçamento de Alimentação quase estourado','Você atingiu 77.8% do seu limite estipulado de R$ 800,00 para Alimentação.','2026-05-19T10:00:00Z',0);
INSERT OR IGNORE INTO alerts VALUES ('alt-2','SUCCESS','Integração de Sincronização Concluída','Seus dados do Banco Itaú e Inter foram sincronizados com sucesso via Pluggy Open Finance.','2026-05-19T09:12:00Z',0);
INSERT OR IGNORE INTO alerts VALUES ('alt-3','INFO','Planejamento de Metas','Sua meta de Poupança subiu 5% desde o começo do mês. Continue firme!','2026-05-18T18:30:00Z',1);
