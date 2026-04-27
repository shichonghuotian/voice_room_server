import mysql from 'mysql2/promise';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SqlParams = any[];

const pool = mysql.createPool({
  host:     process.env.MYSQL_HOST     ?? '127.0.0.1',
  port:     parseInt(process.env.MYSQL_PORT ?? '3306', 10),
  user:     process.env.MYSQL_USER     ?? 'root',
  password: process.env.MYSQL_PASSWORD ?? '',
  database: process.env.MYSQL_DATABASE ?? 'voice_room',
  waitForConnections: true,
  connectionLimit: 10,
  charset: 'utf8mb4',
});

export { pool as mysqlPool };

export async function query<T = Record<string, unknown>>(
  sql: string,
  params?: SqlParams
): Promise<T[]> {
  const [rows] = await pool.execute(sql, params);
  return rows as T[];
}

export async function execute(
  sql: string,
  params?: SqlParams
): Promise<mysql.ResultSetHeader> {
  const [result] = await pool.execute(sql, params);
  return result as mysql.ResultSetHeader;
}
