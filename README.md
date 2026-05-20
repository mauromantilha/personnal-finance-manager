# MKS Open Finance - Controle de Gastos e Ativos Inteligente

Uma plataforma de consolidação financeira de ponta a ponta desenvolvida em **React (Vite)** com **Express JS** no backend, projetada para gerenciar patrimônio líquido, orçamentos, metas de poupança personalizadas, simular conexões de **Open Finance** e fornecer recomendações de inteligência artificial personalizadas.

---

## 🚀 Arquitetura e Tecnologia

A aplicação é modular, moderna e robusta, composta por:
- **Frontend**: React 18+, TypeScript, Tailwind CSS para estilização e **Lucide React** para ícones consistentes.
- **Backend / Proxy de API**: Express JS (usando `tsx` em desenvolvimento e compilado via `esbuild` para produção).
- **Visualização de Dados**: Gráficos analíticos e interativos gerados via **Recharts** e **D3**.
- **IA**: Integração com a API de modelos de linguagem da Google (**Gemini API**) para consultoria e aconselhamento financeiro proativo.

---

## 📁 Módulos e Funcionalidades Detalhadas

O sistema é dividido em abas e módulos especializados de fácil navegação:

### 1. 📊 Dashboard Principal (Visão Geral)
- **Ativos Totais Líquidos**: Exibição em tempo real do Patrimônio Consolidado corrigido dinamicamente.
- **Painel de Boas-Vindas**: Resumo visual rápido com atalhos para lançamentos manuais ou conexões de contas bancárias.
- **Widget de Orçamentos e Alertas**: Mostra progresso simplificado de tetos por categorias e avisos de estouro.
- **Gráfico de Evolução de Caixa**: Gráfico integrado mostrando entradas versus saídas.

### 2. 💼 Módulo de Contabilidade e Caixa (Livro-Razão)
- **Gerenciamento de Carteiras (Ledger)**: Criação de contas correntes, investimentos, poupança ou dinheiro manual. Cada carteira possui destaque visual de cor e mostra o tipo (Manual ou Vinculado).
- **Lançamento Manual em Centavos**: Sistema preciso que evita erros de ponto flutuante comuns em JS, operando em centavos internamente.
- **Filtragem e Classificação**: Tabela detalhada do Livro-Razão contábil exibindo transações por tipo (Receita, Despesa, Transferência entre contas), data e categoria comercial.
- **Exclusão de Registros**: Permite zerar lançamentos manuais para reiniciar o controle com um clique.

### 3. 🎯 Módulo de Orçamentos e Metas (`BudgetsModule.tsx`)
- **Tetos de Gastos por Categoria**:
  - Definição de limites mensais para categorias (Alimentação, Transporte, Lazer, Educação, etc.).
  - Barras de progresso dinâmicas que alteram de cor (Verde, Amarelo, Vermelho) com base no consumo real comparado ao teto estipulado.
  - Ajuste de tetos diretamente na interface de forma interativa.
- **Metas de Poupança Personalizadas**:
  - **Criação de Metas**: O usuário pode criar novos objetivos inserindo **Nome da Meta**, **Valor Alvo (R$)**, **Início/Valor Atual**, **Data Limite / Prazo Alvo** e escolher uma cor de destaque visual.
  - **Evolução de Progresso**: Monitoramento em tempo real da meta com marcador de porcentagem e datas-limites.
  - **Aportes Rápidos**: Permite efetuar depósitos e investimentos focados em cada meta de forma dinâmica para verificar o progresso diário.
  - **Exclusão de Metas**: Controle total permitindo remover metas de poupança cadastradas de forma segura com modal/confirmação rápida.

### 4. 📈 Módulo de Análises (`AnalyticsModule.tsx`)
- **Painel de Indicadores (KPIs/Cards)**:
  - Patrimônio Líquido Consolidador.
  - Receita Total consolidada do período.
  - Egressos / Despesas acumuladas.
  - Balanço do Período (Diferencial líquido).
- **Tendência de Patrimônio Líquido Acumulado**: Gráficos de área cumulativos gerados em tempo real com base no histórico de transações.
- **Gráfico de Setores (Pizza)**: Mostra a alocação percentual de despesas por segmento (ex. Lazer, Moradia, Transporte).
- **Projeção de Caixa Inteligente**: Calcula em tempo real o fluxo financeiro para os próximos 30 dias com base na taxa diária de gastos observada.
- **Balanço Mensal de Movimentações**: Gráfico de colunas cruzado comparando as entradas em relação aos custos.

### 5. 🏦 Conexão Open Finance (`OpenFinanceModule.tsx`)
- **Simulador de Conexão Bancária (Pluggy)**:
  - Banco Itaú, Nubank, Banco do Brasil, Bradesco e XP Investimentos.
  - Interface realista simulando o fluxo de autenticação do Open Finance.
  - **Console de Sincronização**: Tela preta interativa estilo console exibindo em tempo real logs detalhados do processo (Autenticação MFA, Handshake de segurança SSL, download de extratos de 90 dias, e consolidação final de saldo).
  - Atualização automática de saldos e transações simuladas e oficiais do extrato sincronizado.

### 6. 🧠 Consultor Financeiro Inteligente - IA (`AIAdvisor.tsx`)
- **Integração com Gemini API**:
  - Chat focado em finanças que tem acesso seguro ao seu contexto financeiro consolidado (Saldos, total gasto, metas ativas e orçamentos ativos).
  - Fornece respostas ultra-personalizadas sem expor nenhum dado para fora do ambiente do servidor seguro.
  - Sugere planos de ação de poupança com base no perfil das suas metas e hábitos de gastos reais.

### 7. 🔔 Central de Notificações (`NotificationsModule.tsx`)
- **Feed Ativo de Avisos de Sistema**:
  - Alertas sobre estouro de orçamentos por categorias.
  - Insights sobre progresso de metas de poupança comemorativas.
  - Status de conciliações bancárias via Open Finance.
- **Canais de Notificação**: Gerenciamento de envio de comunicações externas por Email ou WhatsApp.
- **Resumo Financeiro Integrado**: Widget rápido demonstrando a saúde das contas.

---

## 💻 Instalação e Execução Local

### Pré-requisitos
- Node.js (v18 ou superior)
- NPM

### Passos
1. Instale as dependências:
   ```bash
   npm install
   ```
2. Configure as variáveis de ambiente necessárias copiando o arquivo de exemplo:
   ```bash
   cp .env.example .env
   ```
   *(Adicione sua `GEMINI_API_KEY` caso queira usar as recomendações inteligentes da IA)*

3. Inicie o servidor de desenvolvimento:
   ```bash
   npm run dev
   ```

4. Para compilar em ambiente de produção:
   ```bash
   npm run build
   npm run start
   ```
