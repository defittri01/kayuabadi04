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

import type { StockEntry } from '../types';

// --- IN-MEMORY DATA STORE ---
let stockEntries: StockEntry[] = [
    {
        id: 1,
        supplier: 'PT Jati Unggul',
        driver: 'Budi Santoso',
        origin: 'Jawa',
        date: '2024-05-20T10:00:00Z',
        super: { count: 50, volume: 15.50, price: 75000000 },
        rijek: { count: 10, volume: 2.10, price: 8000000 },
    },
    {
        id: 2,
        supplier: 'CV Rimba Lestari',
        driver: 'Agus Wijaya',
        origin: 'Kalimantan',
        date: '2024-05-19T14:30:00Z',
        super: { count: 120, volume: 30.20, price: 150000000 },
        rijek: { count: 25, volume: 5.50, price: 20000000 },
    },
    {
        id: 3,
        supplier: 'UD Kayu Makmur',
        driver: 'Eko Prasetyo',
        origin: 'Sumatera',
        date: '2024-05-18T09:00:00Z',
        super: { count: 75, volume: 22.00, price: 110000000 },
        rijek: { count: 15, volume: 3.00, price: 12000000 },
    }
];
let nextStockId = 4;
// --- END OF IN-MEMORY DATA STORE ---

const validateStockEntry = (body: any): string | null => {
    const { date, supplier, driver, origin, super: superLog, rijek } = body;
    const MAX_INT = 2147483647;
    const MAX_BIGINT = 9223372036854775807;
    const MAX_VOLUME = 100000000;

    if (!date || typeof date !== 'string' || isNaN(new Date(date).getTime())) return 'A valid date is required.';
    if (!supplier || typeof supplier !== 'string' || supplier.trim().length === 0) return 'Supplier name is required.';
    if (!driver || typeof driver !== 'string' || driver.trim().length === 0) return 'Driver name is required.';
    if (!origin || typeof origin !== 'string' || origin.trim().length === 0) return 'Origin is required.';

    if (!superLog || typeof superLog !== 'object') return 'Super quality log data is missing.';
    if (typeof superLog.count !== 'number' || !Number.isInteger(superLog.count) || superLog.count < 0 || superLog.count > MAX_INT) return `Super count must be a non-negative integer up to ${MAX_INT}.`;
    if (typeof superLog.volume !== 'number' || superLog.volume < 0 || superLog.volume >= MAX_VOLUME) return `Super volume must be a non-negative number less than ${MAX_VOLUME}.`;
    if (typeof superLog.price !== 'number' || !Number.isInteger(superLog.price) || superLog.price < 0 || superLog.price > MAX_BIGINT) return `Super price must be a non-negative integer up to ${MAX_BIGINT}.`;

    if (!rijek || typeof rijek !== 'object') return 'Rijek quality log data is missing.';
    if (typeof rijek.count !== 'number' || !Number.isInteger(rijek.count) || rijek.count < 0 || rijek.count > MAX_INT) return `Rijek count must be a non-negative integer up to ${MAX_INT}.`;
    if (typeof rijek.volume !== 'number' || rijek.volume < 0 || rijek.volume >= MAX_VOLUME) return `Rijek volume must be a non-negative number less than ${MAX_VOLUME}.`;
    if (typeof rijek.price !== 'number' || !Number.isInteger(rijek.price) || rijek.price < 0 || rijek.price > MAX_BIGINT) return `Rijek price must be a non-negative integer up to ${MAX_BIGINT}.`;

    return null; // All good
};


export default async function handler(req: VercelRequest, res: VercelResponse) {
    try {
        if (req.method === 'GET') {
            const page = parseInt(req.query.page as string, 10) || 1;
            const limit = parseInt(req.query.limit as string, 10) || 6;
            const offset = (page - 1) * limit;

            const sortedEntries = [...stockEntries].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
            const paginatedEntries = sortedEntries.slice(offset, offset + limit);
            const totalCount = stockEntries.length;

            const summaryStats = stockEntries.reduce((acc, entry) => {
                acc.totalSuperVolume += entry.super.volume;
                acc.totalRijekVolume += entry.rijek.volume;
                acc.totalSuperPrice += entry.super.price;
                acc.totalRijekPrice += entry.rijek.price;
                acc.totalSuperCount += entry.super.count;
                acc.totalRijekCount += entry.rijek.count;
                return acc;
            }, { totalSuperVolume: 0, totalRijekVolume: 0, totalSuperPrice: 0, totalRijekPrice: 0, totalSuperCount: 0, totalRijekCount: 0 });

            const summary = {
                totalVolume: summaryStats.totalSuperVolume + summaryStats.totalRijekVolume,
                totalValue: summaryStats.totalSuperPrice + summaryStats.totalRijekPrice,
                totalLogs: summaryStats.totalSuperCount + summaryStats.totalRijekCount,
                totalSuperVolume: summaryStats.totalSuperVolume,
                totalRijekVolume: summaryStats.totalRijekVolume,
            };

            return res.status(200).json({
                entries: paginatedEntries,
                summary,
                totalCount
            });
        }

        if (req.method === 'POST') {
            if (!req.body) return res.status(400).json({ message: 'Request body is missing.' });
            
            const validationError = validateStockEntry(req.body);
            if (validationError) return res.status(400).json({ message: validationError });
            
            const newEntry: StockEntry = { ...req.body, id: nextStockId++ };
            stockEntries.push(newEntry);
            return res.status(201).json(newEntry);
        }

        if (req.method === 'PUT') {
            if (!req.body || typeof req.body.id !== 'number') return res.status(400).json({ message: 'Request body must include a numeric ID.' });

            const validationError = validateStockEntry(req.body);
            if (validationError) return res.status(400).json({ message: validationError });

            const { id } = req.body;
            const entryIndex = stockEntries.findIndex(e => e.id === id);

            if (entryIndex === -1) return res.status(404).json({ message: 'Entry not found.' });
            
            stockEntries[entryIndex] = { ...req.body };
            return res.status(200).json(stockEntries[entryIndex]);
        }

        if (req.method === 'DELETE') {
            const { id } = req.body;
            if (typeof id !== 'number') return res.status(400).json({ message: 'A numeric ID is required for deletion.' });

            const initialLength = stockEntries.length;
            stockEntries = stockEntries.filter(e => e.id !== id);
            if (stockEntries.length === initialLength) return res.status(404).json({ message: 'Entry not found' });
            
            return res.status(204).end();
        }

        res.setHeader('Allow', ['GET', 'POST', 'PUT', 'DELETE']);
        return res.status(405).end(`Method ${req.method} Not Allowed`);

    } catch (error) {
        console.error('API Logic Error:', error);
        return res.status(500).json({ message: 'An unexpected error occurred on the server.' });
    }
}
