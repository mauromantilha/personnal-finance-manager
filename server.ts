/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import express from 'express';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import { GoogleGenAI } from '@google/genai';
import { 
  FinancialAccount, 
  Transaction, 
  BankConnection, 
  CategoryBudget, 
  FinancialGoal, 
  NotificationAlert,
  ChatMessage
} from './src/types';

// Establish initial in-memory dataset
let currentAccounts: FinancialAccount[] = [
  {
    id: 'acc-1',
    name: 'Carteira Principal',
    type: 'CASH',
    bankName: 'Dinheiro',
    balanceInCents: 15420, // R$ 154,20
    color: '#EAB308',
    isLinked: false,
  },
  {
    id: 'acc-2',
    name: 'Conta Itaú Personalité',
    type: 'CHECKING',
    bankName: 'Banco Itaú',
    balanceInCents: 452090, // R$ 4.520,90
    color: '#0284C7',
    isLinked: true,
  },
  {
    id: 'acc-3',
    name: 'Poupança Inter',
    type: 'SAVINGS',
    bankName: 'Banco Inter',
    balanceInCents: 1850020, // R$ 18.500,20
    color: '#EA580C',
    isLinked: true,
  },
  {
    id: 'acc-4',
    name: 'XP Carteira Global',
    type: 'INVESTMENT',
    bankName: 'XP Investimentos',
    balanceInCents: 4210000, // R$ 42.100,00
    color: '#16A34A',
    isLinked: true,
  }
];

let currentConnections: BankConnection[] = [
  {
    id: 'conn-itau',
    institutionName: 'Banco Itaú',
    logo: '🏦',
    status: 'CONNECTED',
    lastSyncedAt: new Date().toISOString(),
    itemId: 'plg_itau_98522',
  },
  {
    id: 'conn-inter',
    institutionName: 'Banco Inter',
    logo: '🍊',
    status: 'CONNECTED',
    lastSyncedAt: new Date().toISOString(),
    itemId: 'plg_inter_45fff',
  },
  {
    id: 'conn-xp',
    institutionName: 'XP Investimentos',
    logo: '📈',
    status: 'CONNECTED',
    lastSyncedAt: new Date().toISOString(),
    itemId: 'plg_xp_8811c',
  },
  {
    id: 'conn-bradesco',
    institutionName: 'Banco Bradesco',
    logo: '🔴',
    status: 'DISCONNECTED',
    itemId: 'plg_bradesco_22394',
  }
];

let currentTransactions: Transaction[] = [
  {
    id: 'tx-1',
    amountInCents: 650000, // R$ 6.500,00
    date: '2026-05-01',
    type: 'REC',
    category: 'Receitas',
    description: 'Salário Mensal MKS Brasil',
    accountId: 'acc-2',
    isSynced: false
  },
  {
    id: 'tx-2',
    amountInCents: 180000, // R$ 1.800,00
    date: '2026-05-02',
    type: 'DES',
    category: 'Moradia',
    description: 'Aluguel Loft Paulista',
    accountId: 'acc-2',
    isSynced: true,
    originalMerchantName: 'IMOVEIS SAO PAULO S/A'
  },
  {
    id: 'tx-3',
    amountInCents: 38240, // R$ 382,40
    date: '2026-05-05',
    type: 'DES',
    category: 'Alimentação',
    description: 'Supermercado Pão de Açúcar',
    accountId: 'acc-2',
    isSynced: true,
    originalMerchantName: 'Pao de Acucar SP Lojas'
  },
  {
    id: 'tx-4',
    amountInCents: 4500, // R$ 45,00
    date: '2026-05-06',
    type: 'DES',
    category: 'Transporte',
    description: 'Uber Viagem Central',
    accountId: 'acc-2',
    isSynced: true,
    originalMerchantName: 'UBER RIDES BRASIL'
  },
  {
    id: 'tx-5',
    amountInCents: 12000, // R$ 120,00
    date: '2026-05-08',
    type: 'DES',
    category: 'Lazer',
    description: 'Ingresso Cinema Imax',
    accountId: 'acc-1',
    isSynced: false
  },
  {
    id: 'tx-6',
    amountInCents: 120000, // R$ 1.200,00
    date: '2026-05-10',
    type: 'TRANS',
    category: 'Investimento/Metas',
    description: 'Aporte Mensal Poupança',
    accountId: 'acc-2',
    destinationAccountId: 'acc-3',
    isSynced: false
  },
  {
    id: 'tx-7',
    amountInCents: 250000, // R$ 2.500,00
    date: '2026-05-12',
    type: 'TRANS',
    category: 'Investimento/Metas',
    description: 'Aporte XP Ações',
    accountId: 'acc-3',
    destinationAccountId: 'acc-4',
    isSynced: false
  },
  {
    id: 'tx-8',
    amountInCents: 18990, // R$ 189,90
    date: '2026-05-13',
    type: 'DES',
    category: 'Saúde',
    description: 'Drogaria São Paulo Medicamentos',
    accountId: 'acc-2',
    isSynced: true,
    originalMerchantName: 'DROP SAO PAULO S/A'
  },
  {
    id: 'tx-9',
    amountInCents: 45000, // R$ 450,00
    date: '2026-05-14',
    type: 'DES',
    category: 'Educação',
    description: 'Livros de Tecnologia e Negócios',
    accountId: 'acc-2',
    isSynced: false
  }
];

let currentBudgets: CategoryBudget[] = [
  { id: 'b-1', category: 'Alimentação', limitInCents: 85000, spentInCents: 38240 },
  { id: 'b-2', category: 'Transporte', limitInCents: 30000, spentInCents: 4500 },
  { id: 'b-3', category: 'Moradia', limitInCents: 220000, spentInCents: 180000 },
  { id: 'b-4', category: 'Lazer', limitInCents: 50000, spentInCents: 12000 },
  { id: 'b-5', category: 'Saúde', limitInCents: 40000, spentInCents: 18990 },
  { id: 'b-6', category: 'Educação', limitInCents: 60000, spentInCents: 45000 },
];

let currentGoals: FinancialGoal[] = [
  { id: 'g-1', name: 'Reserva de Emergência', targetInCents: 3000000, currentInCents: 1850020, targetDate: '2026-12-31', color: '#0284C7' },
  { id: 'g-2', name: 'Viagem de Férias Japão', targetInCents: 2500000, currentInCents: 1000000, targetDate: '2027-05-15', color: '#EA580C' }
];

let currentAlerts: NotificationAlert[] = [
  {
    id: 'alt-1',
    title: 'Monitoramento de Orçamento Ativo',
    message: 'Sistema de avisos pronto. Você receberá alertas quando atingir 80% ou 100% dos tetos definidos.',
    type: 'INFO',
    date: new Date().toISOString(),
    isRead: false
  }
];

const chatHistory: ChatMessage[] = [];

// Lazy init for Google Gemini Client
let geminiAIClient: GoogleGenAI | null = null;

function getGeminiClient(): GoogleGenAI | null {
  if (!geminiAIClient) {
    const key = process.env.GEMINI_API_KEY;
    if (key && key !== 'MY_GEMINI_API_KEY') {
      geminiAIClient = new GoogleGenAI({
        apiKey: key,
        httpOptions: {
          headers: {
            'User-Agent': 'aistudio-build',
          }
        }
      });
    }
  }
  return geminiAIClient;
}

// Recalculate spending in budgets
function recalculateBudgets() {
  currentBudgets.forEach(b => {
    b.spentInCents = currentTransactions
      .filter(tx => tx.type === 'DES' && tx.category.toLowerCase() === b.category.toLowerCase())
      .reduce((acc, tx) => acc + tx.amountInCents, 0);
  });
}

// Check and trigger budget budget alerts
function checkBudgetThresholds(tx: Transaction) {
  const budget = currentBudgets.find(b => b.category.toLowerCase() === tx.category.toLowerCase());
  if (budget) {
    const ratioBefore = (budget.spentInCents - tx.amountInCents) / budget.limitInCents;
    const ratioAfter = budget.spentInCents / budget.limitInCents;

    const percentText = Math.round(ratioAfter * 100);
    const limitFormatted = (budget.limitInCents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

    if (ratioAfter >= 1.0 && ratioBefore < 1.0) {
      currentAlerts.unshift({
        id: `alert-ovr-${Date.now()}`,
        title: `🚨 Orçamento Estourado: ${budget.category}`,
        message: `Você ultrapassou 100% de gasto em ${budget.category}. Gasto atual: R$ ${(budget.spentInCents/100).toFixed(2)} de ${limitFormatted}.`,
        type: 'WARNING',
        date: new Date().toISOString(),
        isRead: false
      });
    } else if (ratioAfter >= 0.8 && ratioBefore < 0.8) {
      currentAlerts.unshift({
        id: `alert-warn-${Date.now()}`,
        title: `⚠️ Alerta de Gastos: ${budget.category}`,
        message: `Atenção: você atingiu ${percentText}% do limite de ${budget.category}. Teto: ${limitFormatted}.`,
        type: 'WARNING',
        date: new Date().toISOString(),
        isRead: false
      });
    }
  }
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // 1. GET ALL PLATFORM DATA
  app.get('/api/data', (req, res) => {
    recalculateBudgets();
    res.json({
      accounts: currentAccounts,
      connections: currentConnections,
      transactions: currentTransactions,
      budgets: currentBudgets,
      goals: currentGoals,
      alerts: currentAlerts,
      chatHistory
    });
  });

  // 2. CREATE TRANSACTION MANUALLY
  app.post('/api/transactions', (req, res) => {
    const { amountInCents, date, type, category, description, accountId, destinationAccountId } = req.body;
    
    if (!amountInCents || !date || !type || !category || !description || !accountId) {
      return res.status(400).json({ error: 'Missing parameters. Ensure all fields are filled.' });
    }

    const newTx: Transaction = {
      id: `tx-usr-${Date.now()}`,
      amountInCents: parseInt(amountInCents, 10),
      date,
      type,
      category,
      description,
      accountId,
      destinationAccountId,
      isSynced: false
    };

    // Update account balance
    const sourceAcc = currentAccounts.find(a => a.id === accountId);
    if (type === 'DES' && sourceAcc) {
      sourceAcc.balanceInCents -= newTx.amountInCents;
    } else if (type === 'REC' && sourceAcc) {
      sourceAcc.balanceInCents += newTx.amountInCents;
    } else if (type === 'TRANS') {
      const destAcc = currentAccounts.find(a => a.id === destinationAccountId);
      if (sourceAcc) sourceAcc.balanceInCents -= newTx.amountInCents;
      if (destAcc) destAcc.balanceInCents += newTx.amountInCents;
    }

    currentTransactions.unshift(newTx);
    recalculateBudgets();
    
    if (type === 'DES') {
      checkBudgetThresholds(newTx);
    }

    res.status(201).json(newTx);
  });

  // 3. CREATE ACCOUNT WALLET
  app.post('/api/accounts', (req, res) => {
    const { name, type, bankName, balanceInCents, color } = req.body;

    if (!name || !type || !bankName || balanceInCents === undefined) {
      return res.status(400).json({ error: 'Complete all required details.' });
    }

    const newAcc: FinancialAccount = {
      id: `acc-usr-${Date.now()}`,
      name,
      type,
      bankName,
      balanceInCents: parseInt(balanceInCents, 10),
      color: color || '#6B7280',
      isLinked: false
    };

    currentAccounts.push(newAcc);
    res.status(201).json(newAcc);
  });

  // 4. RESET DATABASE MOCK
  app.post('/api/reset', (req, res) => {
    currentTransactions = currentTransactions.filter(t => !t.id.startsWith('tx-usr-'));
    currentAccounts.forEach(a => {
      if (a.id === 'acc-1') a.balanceInCents = 15420;
      if (a.id === 'acc-2') a.balanceInCents = 452090;
      if (a.id === 'acc-3') a.balanceInCents = 1850020;
      if (a.id === 'acc-4') a.balanceInCents = 4210000;
    });
    currentBudgets.forEach(b => {
      if (b.id === 'b-1') b.spentInCents = 38240;
      if (b.id === 'b-2') b.spentInCents = 4500;
      if (b.id === 'b-3') b.spentInCents = 180000;
      if (b.id === 'b-4') b.spentInCents = 12000;
    });
    currentAlerts = [
      {
        id: 'alt-1',
        title: 'Restaurado para Estado Inicial',
        message: 'Dados financeiros reiniciados com sucesso para os valores padrão de auditoria.',
        type: 'SUCCESS',
        date: new Date().toISOString(),
        isRead: false
      }
    ];
    res.json({ success: true });
  });

  // 5. UPDATE BUDGGET OVERRIDES
  app.post('/api/budgets/update', (req, res) => {
    const { limitInCents, category } = req.body;
    const b = currentBudgets.find(item => item.category.toLowerCase() === category.toLowerCase());
    if (b) {
      b.limitInCents = parseInt(limitInCents, 10);
      recalculateBudgets();
      return res.json(b);
    }
    const newBudget: CategoryBudget = {
      id: `b-usr-${Date.now()}`,
      category,
      limitInCents: parseInt(limitInCents, 10),
      spentInCents: 0
    };
    currentBudgets.push(newBudget);
    recalculateBudgets();
    res.json(newBudget);
  });

  // 6. UPDATE FINANCIAL GOAL
  app.post('/api/goals/update', (req, res) => {
    const { id, amountToAdd } = req.body;
    const goal = currentGoals.find(g => g.id === id);
    if (goal) {
      goal.currentInCents += parseInt(amountToAdd, 10);
      return res.json(goal);
    }
    res.status(404).json({ error: 'Meta não encontrada' });
  });

  // 6b. CREATE FINANCIAL GOAL
  app.post('/api/goals', (req, res) => {
    const { name, targetInCents, targetDate, color, currentInCents } = req.body;
    
    if (!name || isNaN(targetInCents) || targetInCents <= 0 || !targetDate) {
      return res.status(400).json({ error: 'Parâmetros inválidos para criação da meta' });
    }

    const newGoal: FinancialGoal = {
      id: `g-usr-${Date.now()}`,
      name,
      targetInCents: parseInt(targetInCents, 10),
      currentInCents: currentInCents ? parseInt(currentInCents, 10) : 0,
      targetDate,
      color: color || '#6366F1'
    };

    currentGoals.push(newGoal);
    res.json(newGoal);
  });

  // 6c. DELETE FINANCIAL GOAL
  app.delete('/api/goals/:id', (req, res) => {
    const { id } = req.params;
    const index = currentGoals.findIndex(g => g.id === id);
    if (index !== -1) {
      const deleted = currentGoals.splice(index, 1);
      return res.json({ success: true, deleted: deleted[0] });
    }
    res.status(404).json({ error: 'Meta não encontrada' });
  });

  // 7. DISMISS ALERTS
  app.post('/api/alerts/read', (req, res) => {
    const { id } = req.body;
    const alert = currentAlerts.find(a => a.id === id);
    if (alert) {
      alert.isRead = true;
    }
    res.json({ success: true });
  });

  // 8. SIMULATOR: BANK OPEN FINANCE CONNECTION & SYNC QUEUE
  app.post('/api/open-finance/connect', async (req, res) => {
    const { bankName, username } = req.body;
    
    if (!bankName) {
      return res.status(400).json({ error: 'Select a valid banking institution' });
    }

    // Toggle or register connection
    let existingConn = currentConnections.find(c => c.institutionName.toLowerCase() === bankName.toLowerCase());
    if (!existingConn) {
      existingConn = {
        id: `conn-bank-${Date.now()}`,
        institutionName: bankName,
        logo: '⚡',
        status: 'SYNCING',
        itemId: `plg_${bankName.replace(/\s+/g, '').toLowerCase()}_${Math.floor(1000 + Math.random() * 9000)}`
      };
      currentConnections.push(existingConn);
    } else {
      existingConn.status = 'SYNCING';
    }

    // Prepare simulated banking statements
    const mockExternalBankTransactions = [
      { desc: 'RESTAURANTE ASSIS BURGER', amount: 8450, category: 'Alimentação' },
      { desc: 'AUTO POSTO IPIRANGA', amount: 15000, category: 'Transporte' },
      { desc: 'MERCADO DISTRITO LTDA', amount: 21020, category: 'Alimentação' },
      { desc: 'CORTE FEITO BARBEARIA', amount: 6500, category: 'Outros' },
      { desc: 'CURSO INGLÊS COMPLETO', amount: 18000, category: 'Educação' },
    ];

    // Trigger async background processing simulation
    // We will do a server-side state inject to make it real and provide instant update
    setTimeout(async () => {
      const conn = currentConnections.find(c => c.institutionName.toLowerCase() === bankName.toLowerCase());
      if (conn) {
        conn.status = 'CONNECTED';
        conn.lastSyncedAt = new Date().toISOString();

        // Check if there is an account matching, otherwise connectXP/Itaú
        let targetAcc = currentAccounts.find(a => a.bankName.toLowerCase() === bankName.toLowerCase());
        if (!targetAcc) {
          targetAcc = {
            id: `acc-auto-${Date.now()}`,
            name: `Conta Corrente ${bankName}`,
            type: 'CHECKING',
            bankName,
            balanceInCents: 1200000, // Capitalize starting simulated balance R$ 12.000,00
            color: '#3B82F6',
            isLinked: true
          };
          currentAccounts.push(targetAcc);
        } else {
          targetAcc.isLinked = true;
        }

        // Add simulated transactions
        let syncedCount = 0;
        for (const item of mockExternalBankTransactions) {
          const syncId = `tx-sync-${Math.random().toString(36).substr(2, 9)}`;
          const dateRandom = new Date();
          dateRandom.setDate(dateRandom.getDate() - Math.floor(Math.random() * 10));
          
          const finalTx: Transaction = {
            id: syncId,
            amountInCents: item.amount,
            date: dateRandom.toISOString().split('T')[0],
            type: 'DES',
            category: item.category,
            description: item.desc,
            accountId: targetAcc.id,
            isSynced: true,
            originalMerchantName: item.desc
          };

          currentTransactions.unshift(finalTx);
          targetAcc.balanceInCents -= item.amount;
          syncedCount++;
        }

        recalculateBudgets();

        // Broadcast success notifications
        currentAlerts.unshift({
          id: `alert-conn-${Date.now()}`,
          title: `🔗 Conexão Bem-sucedida: ${bankName}`,
          message: `Sincronização histórica automatizada concluída para ${bankName}! ${syncedCount} transações consolidadas e categorizadas com sucesso.`,
          type: 'SUCCESS',
          date: new Date().toISOString(),
          isRead: false
        });
      }
    }, 4000);

    res.json({
      success: true,
      status: 'SYNCING',
      message: 'Tarefa sync-historical-data enfileirada no Redis. Processando histórico bancário de 90 dias.',
      itemId: existingConn.itemId
    });
  });

  // 9. CLIENT ADVISOR WITH SERVER-SIDE GEMINI AI API PROXY
  app.post('/api/gemini/advisor', async (req, res) => {
    const { message, customContext } = req.body;
    
    const client = getGeminiClient();
    
    // Formulate a clean financial report in Brazilian Portuguese
    recalculateBudgets();
    const totalBalance = currentAccounts.reduce((sum, a) => sum + a.balanceInCents, 0);
    const totalTransactions = currentTransactions.length;
    const budgetSummary = currentBudgets.map(b => `${b.category}: R$ ${(b.spentInCents / 100).toFixed(2)} gastos de R$ ${(b.limitInCents / 100).toFixed(2)}`).join(', ');
    const activeGoals = currentGoals.map(g => `${g.name}: R$ ${(g.currentInCents / 100).toFixed(2)} de R$ ${(g.targetInCents / 100).toFixed(2)}`).join(', ');

    const systemPrompt = `Você é um Consultor Financeiro de elite especializado em finanças pessoais para brasileiros.
Você é extremamente cortês, preciso, fala em Português do Brasil de forma empática e profissional.
As finanças atuais do usuário são:
- Saldo Patrimonial Total: R$ ${(totalBalance / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
- Mapeamento de Orçamentos Atuais por categoria: ${budgetSummary}
- Alvo de Metas e Poupança: ${activeGoals}
- Quantidade de Transações Registradas: ${totalTransactions}

REGRAS DE CONVENÇÃO:
- Não critique as despesas do usuário de forma agressiva. Ofereça insights construtivos específicos para a realidade dele.
- Retorne apenas Markdown rico e bem estruturado com seções e destaque em negrito.
- Nunca retorne código nem dados simulados de porta do servidor. Fale diretamente como um ser humano especialista.
- Responda apenas à pergunta ou dê conselho de planejamento com no máximo 3 pequenos parágrafos focados ou bullet points acionáveis.`;

    if (!client) {
      // Fallback response with professional heuristics if API key is not present
      const fallbackReplies = [
        "### 💡 Análise de Saúde Financeira MKS\n\nExcelente controle! Seu patrimônio atual consolidado de **R$ " + (totalBalance / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2 }) + "** demonstra excelente consistência.\n\n" +
        "#### Próximos Passos Recomendados:\n" +
        "1. **Segurança**: Sua **Reserva de Emergência** está em **" + Math.round((currentGoals[0].currentInCents / currentGoals[0].targetInCents) * 100) + "%** do objetivo. Considere destinar o próximo aporte para fechar esse colchão de liquidez.\n" +
        "2. **Ajuste de Categoria**: Você já registrou despesas na categoria **Moradia** correspondendo a maior parcela do seu orçamento fixo.\n" +
        "3. **Open Finance Ativo**: Excelente integração com Banco Itaú e Inter. Isto garante que novos lançamentos de cartão de crédito entrarão de forma automática.",
        
        "### 📈 Planejamento de Metas de Curto Prazo\n\nAnalisando suas economias, sua carteira possui boas frentes de investimento. \n\n" +
        "- **Meta Japão**: Atualmente com **R$ " + (currentGoals[1].currentInCents/100).toLocaleString('pt-BR') + "** poupados do total de R$ " + (currentGoals[1].targetInCents/100).toLocaleString('pt-BR') + ".\n" +
        "- **Sugestão de Economia Inteligente**: Se você reduzir os gastos de *Lazer* e *Alimentação em 10%* nas próximas duas semanas, poderá antecipar seu objetivo em cerca de 45 dias!",
      ];
      
      const selectedReply = message.toLowerCase().includes('viagem') || message.toLowerCase().includes('meta') ? fallbackReplies[1] : fallbackReplies[0];
      
      // Delay to simulate computation
      await new Promise(resolve => setTimeout(resolve, 800));
      return res.json({ reply: selectedReply, note: "Análise processada localmente devido a chave offline" });
    }

    try {
      const response = await client.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: message,
        config: {
          systemInstruction: systemPrompt,
          temperature: 0.7,
        }
      });
      
      const aiReply = response.text || "Desculpe, não consegui consolidar a resposta analítica no momento.";
      res.json({ reply: aiReply });
    } catch (e: any) {
      res.status(500).json({ error: 'Erro ao invocar Gemini AI no servidor', details: e.message });
    }
  });

  // 10. INTELLIGENT REGEX & GEMINI AUTO-CATEGORIZATION ENDPOINT FOR STATEMENTS
  app.post('/api/gemini/categorize', async (req, res) => {
    const { merchantName } = req.body;
    if (!merchantName) {
      return res.status(400).json({ error: 'Merchant name is required' });
    }

    const client = getGeminiClient();

    if (!client) {
      // Local clean logic to classify
      const lower = merchantName.toLowerCase();
      let category = 'Outros';
      let cleanDesc = merchantName;

      if (lower.includes('pao de acucar') || lower.includes('mercado') || lower.includes('burger') || lower.includes('restaurante') || lower.includes('coco bambu') || lower.includes('jantar')) {
        category = 'Alimentação';
      } else if (lower.includes('uber') || lower.includes('posto') || lower.includes('combustivel') || lower.includes('carro')) {
        category = 'Transporte';
      } else if (lower.includes('aluguel') || lower.includes('imovel') || lower.includes('loft') || lower.includes('condominio')) {
        category = 'Moradia';
      } else if (lower.includes('netflix') || lower.includes('cinema') || lower.includes('spotify') || lower.includes('ingresso')) {
        category = 'Lazer';
      } else if (lower.includes('drogaria') || lower.includes('saude') || lower.includes('farmacia') || lower.includes('medico')) {
        category = 'Saúde';
      } else if (lower.includes('livro') || lower.includes('curso') || lower.includes('escola') || lower.includes('ingles')) {
        category = 'Educação';
      }

      // Beautify client descriptions
      if (lower.includes('uber')) cleanDesc = 'Uber Viagem';
      else if (lower.includes('pao de acucar')) cleanDesc = 'Supermercado Pão de Açúcar';
      else if (lower.includes('coco bambu')) cleanDesc = 'Restaurante Coco Bambu';
      else if (lower.includes('netflix')) cleanDesc = 'Assinatura Mensal Netflix';
      else if (lower.includes('aluguel')) cleanDesc = 'Aluguel Lot Paulista';
      else if (lower.includes('posto ipiranga')) cleanDesc = 'Posto Ipiranga Combustível';
      
      return res.json({ cleanDescription: cleanDesc, category });
    }

    try {
      const gPrompt = `Dado o nome bruto da transação bancária vinda do extrato do cartão ou Open Finance: "${merchantName}".
Retorne uma resposta JSON válida com duas propriedades:
"cleanDescription": nome humanizado amigável, limpo e corrigido (ex: de "PAO DE ACUCAR SP LOJAS" para "Supermercado Pão de Açúcar").
"category": uma dessas categorias exatas: "Alimentação", "Transporte", "Moradia", "Lazer", "Saúde", "Educação" ou "Outros".`;

      const response = await client.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: gPrompt,
        config: {
          responseMimeType: 'application/json',
          temperature: 0.1,
        }
      });

      const parsed = JSON.parse(response.text?.trim() || '{}');
      res.json({
        cleanDescription: parsed.cleanDescription || merchantName,
        category: parsed.category || 'Outros'
      });
    } catch (e) {
      // Fallback
      res.json({ cleanDescription: merchantName, category: 'Outros' });
    }
  });

  // 11. VITE MIDDLEWARE / SPA FALLBACKS
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Open Finance server listening precisely on http://0.0.0.0:${PORT}`);
  });
}

startServer();
