/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

// NOTE: In a real Vercel project, you would `npm install @vercel/node`
// and import these types. For this environment, we use a mock.
interface VercelRequest {
  method?: string;
  body: any;
  query: { [key: string]: string | string[] };
}

interface VercelResponse {
  status: (statusCode: number) => VercelResponse;
  json: (jsonBody: any) => void;
  setHeader: (name: string, value: string | string[]) => VercelResponse;
  end: (body?: string) => void;
}

import { Pool, PoolClient } from 'pg';
import type { DailyCashflowLogEntry, CashflowData, CashflowItem } from '../types';

// Initialize the connection pool. 
// Vercel automatically uses the DATABASE_URL environment variable from settings.
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    // Required for Neon database connections
    rejectUnauthorized: false 
  }
});

/**
 * Fetches filtered cashflow data from the database and calculates running balances.
 * @param client - An active database client from the pool.
 * @param whereClause - The SQL WHERE clause for filtering.
 * @param queryParams - Parameters for the WHERE clause.
 * @param balanceWhereClause - The WHERE clause to calculate the starting balance.
 * @param balanceParams - Parameters for the balance WHERE clause.
 */
async function getFilteredCashflowData(
    client: PoolClient, 
    whereClause: string, 
    queryParams: (string | number)[],
    balanceWhereClause: string,
    balanceParams: (string | number)[]
): Promise<CashflowData> {
    
    // 1. Fetch all data in parallel for performance
    const balancePromise = balanceWhereClause
        ? client.query(`SELECT COALESCE(SUM(CASE WHEN type = 'income' THEN amount ELSE -amount END), 0) as balance FROM cashflow_entries ${balanceWhereClause}`, balanceParams)
        : Promise.resolve({ rows: [{ balance: 0 }] });

    const logPromise = client.query(
        `SELECT id, date::text, type, category, description, amount::bigint FROM cashflow_entries ${whereClause} ORDER BY date DESC, id DESC`,
        queryParams
    );

    const breakdownPromise = client.query(
        `SELECT type, category, SUM(amount) as amount FROM cashflow_entries ${whereClause} GROUP BY type, category`,
        queryParams
    );

    const [balanceRes, logRes, breakdownRes] = await Promise.all([
        balancePromise,
        logPromise,
        breakdownPromise
    ]);
    
    // 2. Process results
    const startingBalance = Number(balanceRes.rows[0].balance);
    
    const chronologicalLog = [...logRes.rows].sort((a,b) => new Date(a.date).getTime() - new Date(b.date).getTime() || a.id - b.id);
    const balanceHistory = new Map<number, number>();
    let currentBalance = startingBalance;
    chronologicalLog.forEach(entry => {
        currentBalance += (entry.type === 'income' ? Number(entry.amount) : -Number(entry.amount));
        balanceHistory.set(entry.id, currentBalance);
    });
    
    const parseAmount = (row: any) => ({ ...row, amount: Number(row.amount) });

    const dailyLog: DailyCashflowLogEntry[] = logRes.rows.map(row => ({
        ...parseAmount(row),
        runningBalance: balanceHistory.get(row.id) ?? 0,
    }));
    
    const income: CashflowItem[] = [];
    const expenses: CashflowItem[] = [];
    breakdownRes.rows.forEach(row => {
        const item = parseAmount(row);
        if(row.type === 'income') {
            income.push({ category: item.category, amount: item.amount });
        } else {
            expenses.push({ category: item.category, amount: item.amount });
        }
    });

    return {
        dailyLog,
        income,
        expenses
    };
}

const validateEntry = (body: any, isUpdate = false) => {
    const { id, date, type, category, description, amount } = body;
    const MAX_BIGINT = 9223372036854775807;

    if (isUpdate && (typeof id !== 'number' || id <= 0)) {
        return 'Invalid or missing ID for update.';
    }
    if (!date || typeof date !== 'string' || isNaN(new Date(date).getTime())) {
        return 'Invalid or missing date.';
    }
    if (type !== 'income' && type !== 'expense') {
        return 'Invalid or missing type.';
    }
    if (!category || typeof category !== 'string' || category.trim().length === 0) {
        return 'Invalid or missing category.';
    }
    if (description === undefined || description === null || typeof description !== 'string') {
        // Allow empty description, but it must be a string
        return 'Invalid or missing description.';
    }
    if (typeof amount !== 'number' || amount <= 0 || amount > MAX_BIGINT) {
        return `Amount must be a positive number less than or equal to ${MAX_BIGINT}.`;
    }
    return null; // All good
};


export default async function handler(req: VercelRequest, res: VercelResponse) {
    let client: PoolClient | undefined;
    try {
        client = await pool.connect();

        // --- Database Initialization and Seeding (on first-ever request) ---
        await client.query(`
            CREATE TABLE IF NOT EXISTS cashflow_entries (
                id SERIAL PRIMARY KEY,
                date DATE NOT NULL,
                type VARCHAR(10) NOT NULL CHECK (type IN ('income', 'expense')),
                category VARCHAR(255) NOT NULL,
                description TEXT,
                amount BIGINT NOT NULL
            );
        `);
        
        const tableCheck = await client.query('SELECT COUNT(*) FROM cashflow_entries');
        if (tableCheck.rows[0].count === '0') {
            await client.query(`
                INSERT INTO cashflow_entries (date, type, category, description, amount) VALUES
                ('2024-05-20', 'income', 'Sales', 'Payment from PT. Maju Jaya for teak wood order #123', 150000000),
                ('2024-05-20', 'expense', 'Operational', 'Purchase of new saw blades and safety gear', 7500000),
                ('2024-05-19', 'expense', 'Salary', 'Monthly salary for production team', 85000000),
                ('2024-05-18', 'income', 'Sales', 'Down payment for custom furniture from Mr. Hartono', 25000000),
                ('2024-05-18', 'expense', 'Utilities', 'Electricity and water bill for the month', 12000000),
                ('2024-05-17', 'expense', 'Raw Material', 'Purchase of logs from CV Rimba Lestari', 170000000);
            `);
        }
        // --- End of Initialization ---

        if (req.method === 'GET') {
            const { period, from, to } = req.query;
            let whereClause = '';
            let queryParams: (string|number)[] = [];
            let balanceWhereClause = '';
            let balanceParams: (string|number)[] = [];

            if (period && ['7', '30', '90'].includes(period as string)) {
                const days = parseInt(period as string, 10);
                const interval = `${days} days`;
                whereClause = `WHERE date >= (NOW() - $1::interval)::date`;
                queryParams = [interval];
                balanceWhereClause = `WHERE date < (NOW() - $1::interval)::date`;
                balanceParams = [interval];
            } else if (from && to && typeof from === 'string' && typeof to === 'string') {
                whereClause = 'WHERE date BETWEEN $1 AND $2';
                queryParams = [from, to];
                balanceWhereClause = 'WHERE date < $1';
                balanceParams = [from];
            }

            const data = await getFilteredCashflowData(client, whereClause, queryParams, balanceWhereClause, balanceParams);
            return res.status(200).json(data);
        }

        if (req.method === 'POST') {
            if (!req.body) {
                return res.status(400).json({ message: 'Request body is missing.' });
            }
            
            const validationError = validateEntry(req.body);
            if (validationError) {
                return res.status(400).json({ message: validationError });
            }
            
            const { date, type, category, description, amount } = req.body;

            const result = await client.query(
                `INSERT INTO cashflow_entries (date, type, category, description, amount)
                 VALUES ($1, $2, $3, $4, $5)
                 RETURNING id, date::text, type, category, description, amount::bigint`,
                [date, type, category.trim(), description.trim(), amount]
            );

            if (result.rows.length === 0) {
                console.error('Database insertion succeeded but did not return the new row for cashflow entry.');
                return res.status(500).json({ message: 'An unexpected error occurred during data creation.' });
            }

            const newEntry = result.rows[0];
            newEntry.amount = Number(newEntry.amount);
            return res.status(201).json(newEntry);
        }

        if (req.method === 'PUT') {
            if (!req.body) {
                return res.status(400).json({ message: 'Request body is missing.' });
            }
            
            const validationError = validateEntry(req.body, true);
            if (validationError) {
                return res.status(400).json({ message: validationError });
            }

            const { id, date, type, category, description, amount } = req.body;

            const result = await client.query(
                `UPDATE cashflow_entries
                 SET date = $1, type = $2, category = $3, description = $4, amount = $5
                 WHERE id = $6
                 RETURNING id, date::text, type, category, description, amount::bigint`,
                [date, type, category.trim(), description.trim(), amount, id]
            );

            if (result.rows.length === 0) {
                return res.status(404).json({ message: 'Entry not found' });
            }
            const updatedEntry = result.rows[0];
            updatedEntry.amount = Number(updatedEntry.amount);
            return res.status(200).json(updatedEntry);
        }

        if (req.method === 'DELETE') {
            const { id, ids } = req.body;

            if (ids && Array.isArray(ids) && ids.every(i => typeof i === 'number')) {
                // Bulk delete
                if (ids.length === 0) {
                    return res.status(204).end();
                }
                await client.query('DELETE FROM cashflow_entries WHERE id = ANY($1::int[])', [ids]);
                return res.status(204).end();

            } else if (typeof id === 'number') {
                // Single delete
                const result = await client.query('DELETE FROM cashflow_entries WHERE id = $1', [id]);
                if (result.rowCount === 0) {
                    return res.status(404).json({ message: 'Entry not found' });
                }
                return res.status(204).end();

            } else {
                return res.status(400).json({ message: 'Invalid ID or IDs provided.' });
            }
        }

        res.setHeader('Allow', ['GET', 'POST', 'PUT', 'DELETE']);
        return res.status(405).end(`Method ${req.method} Not Allowed`);

    } catch (error) {
        console.error('API Database Error:', error);
        // Avoid leaking detailed error info to the client
        return res.status(500).json({ message: 'An unexpected error occurred on the server.' });
    } finally {
        if (client) {
            client.release();
        }
    }
}
