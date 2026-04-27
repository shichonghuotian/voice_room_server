import { Router, Request, Response } from 'express';
import { getDb, dbDriver } from '../db';
import { categoriesTable, mysqlCategoriesTable } from '../db/schema';
import { ok, fail } from '../types';

const router = Router();

router.get('/', async (_req: Request, res: Response) => {
  try {
    const { db } = getDb();
    const table = dbDriver === 'mysql' ? mysqlCategoriesTable : categoriesTable;
    const rows = await db.select().from(table);
    return res.json(ok(rows));
  } catch (e: unknown) {
    return res.status(500).json(fail(e instanceof Error ? e.message : 'Error'));
  }
});

export default router;
