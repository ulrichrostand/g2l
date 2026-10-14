import pg from "pg";

export interface QueryResult<Row> {
  rows: Row[];
  rowCount: number;
}

/** Accès à la base. Les requêtes sont TOUJOURS paramétrées ($1, $2...) : jamais de valeur collée dans le texte SQL. */
export interface Db {
  query<Row = Record<string, unknown>>(sql: string, params?: readonly unknown[]): Promise<QueryResult<Row>>;
  /** Exécute un script SQL sans paramètre (plusieurs instructions possibles) : réservé aux migrations. */
  exec(sql: string): Promise<void>;
  transaction<T>(work: (tx: Db) => Promise<T>): Promise<T>;
  close(): Promise<void>;
}

export class PgDb implements Db {
  private readonly pool: pg.Pool;

  constructor(connectionString: string) {
    this.pool = new pg.Pool({ connectionString, max: 10, idleTimeoutMillis: 30_000, connectionTimeoutMillis: 5_000 });
    // Une connexion inactive qui tombe ne doit pas faire planter le serveur : le pool en rouvre une.
    this.pool.on("error", (error) => console.error("Erreur de connexion PostgreSQL inactive :", error.message));
  }

  async query<Row = Record<string, unknown>>(sql: string, params: readonly unknown[] = []): Promise<QueryResult<Row>> {
    const result = await this.pool.query(sql, params as unknown[]);
    return { rows: result.rows as Row[], rowCount: result.rowCount ?? 0 };
  }

  async exec(sql: string): Promise<void> {
    await this.pool.query(sql);
  }

  async transaction<T>(work: (tx: Db) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    const tx: Db = {
      query: async <Row>(sql: string, params: readonly unknown[] = []) => {
        const result = await client.query(sql, params as unknown[]);
        return { rows: result.rows as Row[], rowCount: result.rowCount ?? 0 };
      },
      exec: async (sql) => {
        await client.query(sql);
      },
      transaction: (inner) => inner(tx),
      close: async () => undefined,
    };
    try {
      await client.query("BEGIN");
      const value = await work(tx);
      await client.query("COMMIT");
      return value;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async close(): Promise<void> {
    await this.pool.end();
  }
}

/** Code d'erreur PostgreSQL d'une violation d'unicité. */
export const UNIQUE_VIOLATION = "23505";

export function isUniqueViolation(error: unknown): boolean {
  return typeof error === "object" && error !== null && (error as { code?: unknown }).code === UNIQUE_VIOLATION;
}
