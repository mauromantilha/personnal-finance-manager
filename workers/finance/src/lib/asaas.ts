// Asaas API v3 client — gateway de pagamentos brasileiro (PIX / Boleto / Cartão)
// Suporta ambiente de sandbox e produção para upgrade de armazenamento.

export interface AsaasConfig {
  apiKey: string;
  isSandbox?: boolean;
}

export interface AsaasCustomer {
  id: string;
  name: string;
  email: string;
  cpfCnpj?: string;
}

export interface AsaasPayment {
  id: string;
  customer: string;
  value: number;
  netValue?: number;
  billingType: 'PIX' | 'BOLETO' | 'CREDIT_CARD' | 'UNDEFINED';
  status: 'PENDING' | 'RECEIVED' | 'CONFIRMED' | 'OVERDUE' | 'REFUNDED';
  dueDate: string;
  externalReference?: string;
}

export interface AsaasPixQrCode {
  encodedImage: string; // Base64 da imagem do QR Code
  payload: string;      // Código "Copia e Cola" do PIX
  expirationDate: string;
}

export class AsaasClient {
  private readonly baseUrl: string;
  private readonly apiKey: string;

  constructor(apiKey: string, isSandbox = false) {
    this.apiKey  = apiKey;
    this.baseUrl = isSandbox
      ? 'https://sandbox.asaas.com/api/v3'
      : 'https://api.asaas.com/v3';
  }

  private async request<T>(path: string, options: RequestInit = {}): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    const headers = {
      'Content-Type': 'application/json',
      access_token: this.apiKey,
      'User-Agent': 'MKS-Financas/1.0',
      ...(options.headers ?? {}),
    };

    const resp = await fetch(url, { ...options, headers });
    const text = await resp.text();

    if (!resp.ok) {
      let errMsg = `Asaas ${resp.status}`;
      try {
        const json = JSON.parse(text);
        if (json.errors?.[0]?.description) {
          errMsg = json.errors[0].description;
        }
      } catch {
        errMsg = text.slice(0, 150);
      }
      throw new Error(errMsg);
    }

    return JSON.parse(text) as T;
  }

  /**
   * Busca cliente por e-mail ou cria um novo caso não exista.
   */
  async getOrCreateCustomer(params: {
    name: string;
    email: string;
    cpfCnpj?: string;
    externalReference?: string;
  }): Promise<AsaasCustomer> {
    // 1. Buscar por e-mail
    try {
      const search = await this.request<{ data: AsaasCustomer[] }>(
        `/customers?email=${encodeURIComponent(params.email)}`,
      );
      if (search.data && search.data.length > 0) {
        return search.data[0];
      }
    } catch {
      // prossegue para criação
    }

    // 2. Criar novo cliente
    return await this.request<AsaasCustomer>('/customers', {
      method: 'POST',
      body: JSON.stringify({
        name: params.name,
        email: params.email,
        cpfCnpj: params.cpfCnpj,
        externalReference: params.externalReference,
      }),
    });
  }

  /**
   * Gera uma cobrança via PIX para upgrade de storage.
   */
  async createStoragePixPayment(params: {
    customerId: string;
    value: number; // Ex: 5.00
    familyId: string;
    description?: string;
  }): Promise<AsaasPayment> {
    const today = new Date();
    today.setDate(today.getDate() + 3); // Vencimento em 3 dias
    const dueDate = today.toISOString().split('T')[0];

    return await this.request<AsaasPayment>('/payments', {
      method: 'POST',
      body: JSON.stringify({
        customer: params.customerId,
        billingType: 'PIX',
        value: params.value,
        dueDate,
        description: params.description ?? 'Upgrade de Armazenamento Finanças Livre (1 GB)',
        externalReference: params.familyId,
      }),
    });
  }

  /**
   * Obtém os dados do QR Code PIX (Base64 + Copia e Cola).
   */
  async getPixQrCode(paymentId: string): Promise<AsaasPixQrCode> {
    return await this.request<AsaasPixQrCode>(`/payments/${paymentId}/pixQrCode`);
  }

  /**
   * Consulta o status de um pagamento.
   */
  async getPayment(paymentId: string): Promise<AsaasPayment> {
    return await this.request<AsaasPayment>(`/payments/${paymentId}`);
  }
}
