// D1 HTTP API client — cada família tem seu próprio banco D1
// Acessado via REST porque bindings são estáticos por deploy

export type D1Param = string | number | boolean | null;

interface D1ApiResult<T> {
  results: T[];
  success: boolean;
  meta: {
    changes: number;
    duration: number;
    last_row_id: number;
    rows_read: number;
    rows_written: number;
  };
}

interface D1ApiResponse<T> {
  result: D1ApiResult<T>[];
  success: boolean;
  errors: { code: number; message: string }[];
  messages: string[];
}

export interface D1Stmt {
  sql: string;
  params?: D1Param[];
}

export class D1Client {
  private readonly url: string;
  private readonly auth: string;

  constructor(accountId: string, databaseId: string, apiToken: string) {
    this.url  = `https://api.cloudflare.com/client/v4/accounts/${accountId}/d1/database/${databaseId}/query`;
    this.auth = `Bearer ${apiToken}`;
  }

  async query<T = Record<string, unknown>>(
    sql: string,
    params: D1Param[] = [],
  ): Promise<T[]> {
    const resp = await fetch(this.url, {
      method: 'POST',
      headers: { Authorization: this.auth, 'Content-Type': 'application/json' },
      body: JSON.stringify({ sql, params }),
    });

    const data = await resp.json() as D1ApiResponse<T>;

    if (!data.success || !data.result[0]?.success) {
      throw new Error(`D1: ${JSON.stringify(data.errors)}`);
    }
    return data.result[0].results;
  }

  async first<T = Record<string, unknown>>(
    sql: string,
    params: D1Param[] = [],
  ): Promise<T | null> {
    const rows = await this.query<T>(sql, params);
    return rows[0] ?? null;
  }

  async exec(
    sql: string,
    params: D1Param[] = [],
  ): Promise<{ changes: number; lastRowId: number }> {
    const resp = await fetch(this.url, {
      method: 'POST',
      headers: { Authorization: this.auth, 'Content-Type': 'application/json' },
      body: JSON.stringify({ sql, params }),
    });

    const data = await resp.json() as D1ApiResponse<never>;

    if (!data.success || !data.result[0]?.success) {
      throw new Error(`D1: ${JSON.stringify(data.errors)}`);
    }
    const { changes, last_row_id } = data.result[0].meta;
    return { changes, lastRowId: last_row_id };
  }

  // Executa múltiplos statements sequencialmente (não atômico — MVP)
  async batch(stmts: D1Stmt[]): Promise<void> {
    for (const { sql, params } of stmts) {
      await this.exec(sql, params ?? []);
    }
  }
}
