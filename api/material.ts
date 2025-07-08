

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
import type { StockEntry } from '../types';

// Initialize the connection pool. 
// Vercel automatically uses the DATABASE_URL environment variable from settings.
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    // Required for Neon database connections
    rejectUnauthorized: false 
  }
});

// Helper function to map flat database rows to the nested StockEntry type
const mapRowToStockEntry = (row: any): StockEntry => {
    return {
        id: Number(row.id),
        supplier: row.supplier,
        driver: row.driver,
        origin: row.origin,
        date: new Date(row.date).toISOString(),
        super: {
            count: Number(row.super_count),
            volume: Number(row.super_volume),
            price: Number(row.super_price),
        },
        rijek: {
            count: Number(row.rijek_count),
            volume: Number(row.rijek_volume),
            price: Number(row.rijek_price),
        }
    };
};

const validateStockEntry = (body: any): string | null => {
    const { date, supplier, driver, origin, super: superLog, rijek } = body;
    const MAX_INT = 2147483647;
    const MAX_BIGINT = 9223372036854775807;
    const MAX_VOLUME = 100000000; // For NUMERIC(10, 2), max is 99,999,999.99

    if (!date || typeof date !== 'string' || isNaN(new Date(date).getTime())) return 'A valid date is required.';
    if (!supplier || typeof supplier !== 'string' || supplier.trim().length === 0) return 'Supplier name is required.';
    if (!driver || typeof driver !== 'string' || driver.trim().length === 0) return 'Driver name is required.';
    if (!origin || typeof origin !== 'string' || origin.trim().length === 0) return 'Origin is required.';

    if (!superLog || typeof superLog !== 'object') return 'Super quality log data is missing.';
    if (typeof superLog.count !== 'number' || !Number.isInteger(superLog.count) || superLog.count < 0 || superLog.count > MAX_INT) return `Super count must be a non-negative integer up to ${MAX_INT}.`;
    if (typeof superLog.volume !== 'number' || superLog.volume < 0 || superLog.volume >= MAX_VOLUME) return `Super volume must be a non-negative number less than ${MAX_VOLUME}.`;
    const superVolumeStr = String(superLog.volume);
    if (superVolumeStr.includes('.') && (superVolumeStr.split('.')[1] || '').length > 2) {
      return 'Super volume cannot have more than 2 decimal places.';
    }
    if (typeof superLog.price !== 'number' || !Number.isInteger(superLog.price) || superLog.price < 0 || superLog.price > MAX_BIGINT) return `Super price must be a non-negative integer up to ${MAX_BIGINT}.`;

    if (!rijek || typeof rijek !== 'object') return 'Rijek quality log data is missing.';
    if (typeof rijek.count !== 'number' || !Number.isInteger(rijek.count) || rijek.count < 0 || rijek.count > MAX_INT) return `Rijek count must be a non-negative integer up to ${MAX_INT}.`;
    if (typeof rijek.volume !== 'number' || rijek.volume < 0 || rijek.volume >= MAX_VOLUME) return `Rijek volume must be a non-negative number less than ${MAX_VOLUME}.`;
    const rijekVolumeStr = String(rijek.volume);
    if (rijekVolumeStr.includes('.') && (rijekVolumeStr.split('.')[1] || '').length > 2) {
      return 'Rijek volume cannot have more than 2 decimal places.';
    }
    if (typeof rijek.price !== 'number' || !Number.isInteger(rijek.price) || rijek.price < 0 || rijek.price > MAX_BIGINT) return `Rijek price must be a non-negative integer up to ${MAX_BIGINT}.`;

    return null; // All good
};


export default async function handler(req: VercelRequest, res: VercelResponse) {
    let client: PoolClient | undefined;
    try {
        client = await pool.connect();

        // --- Database Initialization and Seeding ---
        await client.query(`
            CREATE TABLE IF NOT EXISTS stock_entries (
                id SERIAL PRIMARY KEY,
                supplier VARCHAR(255) NOT NULL,
                driver VARCHAR(255) NOT NULL,
                origin VARCHAR(255) NOT NULL,
                date TIMESTAMP WITH TIME ZONE NOT NULL,
                super_count INT NOT NULL,
                super_volume NUMERIC(10, 2) NOT NULL,
                super_price BIGINT NOT NULL,
                rijek_count INT NOT NULL,
                rijek_volume NUMERIC(10, 2) NOT NULL,
                rijek_price BIGINT NOT NULL,
                created_at TIMESTAMPTZ DEFAULT NOW()
            );
        `);

        const tableCheck = await client.query('SELECT COUNT(*) FROM stock_entries');
        if (tableCheck.rows[0].count === '0') {
            await client.query(`
                INSERT INTO stock_entries (supplier, driver, origin, date, super_count, super_volume, super_price, rijek_count, rijek_volume, rijek_price)
                VALUES 
                    ('PT Jati Unggul', 'Budi Santoso', 'Jawa', '2024-05-20T10:00:00Z', 50, 15.50, 75000000, 10, 2.10, 8000000),
                    ('CV Rimba Lestari', 'Agus Wijaya', 'Kalimantan', '2024-05-19T14:30:00Z', 120, 30.20, 150000000, 25, 5.50, 20000000),
                    ('UD Kayu Makmur', 'Eko Prasetyo', 'Sumatera', '2024-05-18T09:00:00Z', 75, 22.00, 110000000, 15, 3.00, 12000000);
            `);
        }
        // --- End of Initialization ---

        if (req.method === 'GET') {
            const page = parseInt(req.query.page as string, 10) || 1;
            const limit = parseInt(req.query.limit as string, 10) || 6;
            const origin = req.query.origin as string;
            const offset = (page - 1) * limit;

            let whereClause = '';
            const queryParams: (string | number)[] = [];
            if (origin) {
                whereClause = 'WHERE origin ILIKE $1';
                queryParams.push(origin);
            }

            const entriesQuery = `SELECT * FROM stock_entries ${whereClause} ORDER BY date DESC, id DESC LIMIT $${queryParams.length + 1} OFFSET $${queryParams.length + 2}`;
            const countQuery = `SELECT COUNT(*) FROM stock_entries ${whereClause}`;
            const summaryQuery = `
                SELECT
                    COALESCE(SUM(super_count), 0) as "totalSuperCount",
                    COALESCE(SUM(rijek_count), 0) as "totalRijekCount",
                    COALESCE(SUM(super_volume), 0) as "totalSuperVolume",
                    COALESCE(SUM(rijek_volume), 0) as "totalRijekVolume",
                    COALESCE(SUM(super_price), 0) as "totalSuperPrice",
                    COALESCE(SUM(rijek_price), 0) as "totalRijekPrice"
                FROM stock_entries ${whereClause}
            `;
            const originsQuery = `SELECT DISTINCT origin FROM stock_entries`;

            // Run queries in parallel for better performance.
            const [entriesResult, countResult, summaryResult, originsResult] = await Promise.all([
                client.query(entriesQuery, [...queryParams, limit, offset]),
                client.query(countQuery, queryParams),
                client.query(summaryQuery, queryParams),
                client.query(originsQuery)
            ]);

            const entries = entriesResult.rows.map(mapRowToStockEntry);
            const totalCount = parseInt(countResult.rows[0].count, 10);
            
            const summaryData = summaryResult.rows[0];
            const totalSuperVolume = Number(summaryData.totalSuperVolume);
            const totalRijekVolume = Number(summaryData.totalRijekVolume);
            const totalSuperPrice = Number(summaryData.totalSuperPrice);
            const totalRijekPrice = Number(summaryData.totalRijekPrice);
            const totalSuperCount = Number(summaryData.totalSuperCount);
            const totalRijekCount = Number(summaryData.totalRijekCount);

            const summary = {
                totalVolume: totalSuperVolume + totalRijekVolume,
                totalValue: totalSuperPrice + totalRijekPrice,
                totalLogs: totalSuperCount + totalRijekCount,
                totalSuperVolume,
                totalRijekVolume,
                allOrigins: originsResult.rows.map((row: any) => row.origin)
            };

            return res.status(200).json({
                entries,
                summary,
                totalCount
            });
        }

        if (req.method === 'POST') {
            if (!req.body) {
                return res.status(400).json({ message: 'Request body is missing.' });
            }
            
            const validationError = validateStockEntry(req.body);
            if (validationError) {
                return res.status(400).json({ message: validationError });
            }
            
            const { date, supplier, driver, origin, super: superLog, rijek } = req.body;
            
            const result = await client.query(
                `INSERT INTO stock_entries (supplier, driver, origin, date, super_count, super_volume, super_price, rijek_count, rijek_volume, rijek_price)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
                 RETURNING *`,
                [supplier, driver, origin, date, superLog.count, superLog.volume, superLog.price, rijek.count, rijek.volume, rijek.price]
            );

            if (result.rows.length === 0) {
                throw new Error('Database did not return the new entry after insertion.');
            }
            const newEntry = mapRowToStockEntry(result.rows[0]);
            return res.status(201).json(newEntry);
        }

        res.setHeader('Allow', ['GET', 'POST']);
        return res.status(405).end(`Method ${req.method} Not Allowed`);

    } catch (error) {
        console.error('API Database Error:', error);
        return res.status(500).json({ message: 'An unexpected error occurred on the server.' });
    } finally {
        if (client) {
            client.release();
        }
    }
}
