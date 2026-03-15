import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { z } from "zod";
import { pool } from "./db.js";

dotenv.config();

const app = express();
const port = Number(process.env.PORT || 4000);

function isTruthyEnv(value) {
  return ["1", "true", "yes", "on"].includes(String(value || "").trim().toLowerCase());
}

function normalizeMerchant(name) {
  return name
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
}

const corsDisabled = isTruthyEnv(process.env.CORS_DISABLED);
const allowedOrigins = String(process.env.CORS_ORIGIN || "http://localhost:5173")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

if (corsDisabled) {
  app.use(cors());
} else {
  app.use(
    cors({
      origin(origin, callback) {
        if (!origin || allowedOrigins.includes(origin)) {
          return callback(null, true);
        }

        return callback(new Error("CORS origin not allowed"));
      },
    })
  );
}

app.use(express.json());

app.get("/api/health", async (_req, res) => {
  try {
    await pool.query("SELECT 1");
    return res.json({ status: "ok" });
  } catch (error) {
    return res.status(500).json({ status: "error", message: error.message });
  }
});

app.get("/api/accounts", async (_req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, bank, identifier
       FROM accounts
       ORDER BY bank, identifier NULLS LAST`
    );
    return res.json(rows);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

app.get("/api/accounts/overview", async (_req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT
                a.id,
                a.bank,
                a.identifier,
                a.card_alias,
                COUNT(t.id)::int AS transaction_count,
                COALESCE(SUM(t.amount), 0)::numeric(12,2) AS total_spending,
                COALESCE(AVG(t.amount), 0)::numeric(12,2) AS average_transaction
             FROM accounts a
             LEFT JOIN transactions t ON t.account_id = a.id
             GROUP BY a.id, a.bank, a.identifier
             ORDER BY total_spending DESC, a.bank ASC, a.identifier ASC NULLS LAST`
    );

    return res.json(
      rows.map((row) => ({
        id: row.id,
        bank: row.bank,
        identifier: row.identifier,
        card_alias: row.card_alias,
        transaction_count: Number(row.transaction_count || 0),
        total_spending: Number(row.total_spending || 0),
        average_transaction: Number(row.average_transaction || 0),
      }))
    );
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

app.post("/api/accounts", async (req, res) => {
  try {
    const schema = z.object({
      bank: z.string().trim().min(1),
      identifier: z.string().trim().max(120).optional().nullable(),
    });

    const body = schema.parse(req.body);

    const { rows } = await pool.query(
      `INSERT INTO accounts (bank, identifier)
             VALUES ($1, NULLIF($2, ''))
             RETURNING id, bank, identifier, created_at`,
      [body.bank, body.identifier ?? null]
    );

    return res.status(201).json(rows[0]);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ message: "Invalid payload", issues: error.issues });
    }

    if (error?.code === "23505") {
      return res.status(409).json({ message: "Account already exists" });
    }

    return res.status(500).json({ message: error.message });
  }
});

app.put("/api/accounts/:id/card-alias", async (req, res) => {
  try {
    const id = Number(req.params.id);
    const schema = z.object({
      card_alias: z.string().trim().max(120),
    });

    const body = schema.parse(req.body);

    const { rows } = await pool.query(
      `UPDATE accounts
             SET card_alias = $1
             WHERE id = $2
             RETURNING id, bank, identifier, card_alias, created_at`,
      [body.card_alias, id]
    );

    if (!rows[0]) {
      return res.status(404).json({ message: "Account not found" });
    }

    return res.json(rows[0]);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ message: "Invalid payload", issues: error.issues });
    }
    return res.status(500).json({ message: error.message });
  }
});

app.get("/api/mcc", async (req, res) => {
  try {
    const query = String(req.query.q || "").trim();
    const limit = Math.min(Number(req.query.limit || 10), 25);

    if (!query) {
      return res.json([]);
    }

    const { rows } = await pool.query(
      `SELECT
          mcc,
          COALESCE(edited_description, combined_description, usda_description, irs_description, '') AS description,
          irs_reportable
       FROM mcc_reference
       WHERE mcc ILIKE $1
          OR COALESCE(edited_description, combined_description, usda_description, irs_description, '') ILIKE $1
       ORDER BY CASE WHEN mcc ILIKE $2 THEN 0 ELSE 1 END, mcc
       LIMIT $3`,
      [`%${query}%`, `${query}%`, limit]
    );

    return res.json(rows);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

app.get("/api/transactions", async (req, res) => {
  try {
    const schema = z.object({
      search: z.string().optional(),
      accountId: z.string().optional(),
      from: z.string().optional(),
      to: z.string().optional(),
      limit: z.string().optional(),
      offset: z.string().optional(),
    });

    const parsed = schema.parse(req.query);
    const parsedLimit = Number(parsed.limit || 50);
    const parsedOffset = Number(parsed.offset || 0);
    const limit = Number.isFinite(parsedLimit) ? Math.min(Math.max(parsedLimit, 1), 200) : 50;
    const offset = Number.isFinite(parsedOffset) ? Math.max(parsedOffset, 0) : 0;

    const where = [];
    const values = [];

    if (parsed.search?.trim()) {
      values.push(`%${parsed.search.trim()}%`);
      where.push(`(t.merchant ILIKE $${values.length} OR t.category ILIKE $${values.length} OR t.mcc_code ILIKE $${values.length})`);
    }

    if (parsed.accountId) {
      values.push(Number(parsed.accountId));
      where.push(`t.account_id = $${values.length}`);
    }

    if (parsed.from) {
      values.push(parsed.from);
      where.push(`t.transaction_timestamp >= $${values.length}`);
    }

    if (parsed.to) {
      values.push(parsed.to);
      where.push(`t.transaction_timestamp <= $${values.length}`);
    }

    const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";

    const countResult = await pool.query(
      `SELECT COUNT(*)::int AS total_items
       FROM transactions t
       ${whereSql}`,
      values
    );

    const totalItems = Number(countResult.rows[0]?.total_items || 0);
    const totalPages = Math.max(1, Math.ceil(totalItems / limit));

    const dataValues = [...values, limit, offset];

    const { rows } = await pool.query(
      `SELECT
          t.id,
          t.account_id,
          a.bank,
          a.identifier,
          t.merchant,
          t.amount,
          t.currency,
          t.amount_base_currency,
          t.base_currency,
          t.category,
          t.mcc_code,
          COALESCE(mr.edited_description, mr.combined_description, mr.usda_description, mr.irs_description, '') AS mcc_description,
          t.transaction_timestamp,
          t.transaction_hash,
          t.created_at
       FROM transactions t
       JOIN accounts a ON a.id = t.account_id
       LEFT JOIN mcc_reference mr ON mr.mcc = t.mcc_code
       ${whereSql}
       ORDER BY t.transaction_timestamp DESC
       LIMIT $${dataValues.length - 1} OFFSET $${dataValues.length}`,
      dataValues
    );

    return res.json({
      items: rows,
      total_items: totalItems,
      total_pages: totalPages,
      limit,
      offset,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ message: "Invalid query parameters", issues: error.issues });
    }
    return res.status(500).json({ message: error.message });
  }
});

app.get("/api/overview", async (req, res) => {
  try {
    const schema = z.object({
      accountId: z.string().optional(),
      from: z.string().optional(),
      to: z.string().optional(),
    });

    const parsed = schema.parse(req.query);
    const where = [];
    const values = [];

    if (parsed.accountId) {
      values.push(Number(parsed.accountId));
      where.push(`t.account_id = $${values.length}`);
    }

    if (parsed.from) {
      values.push(parsed.from);
      where.push(`t.transaction_timestamp >= $${values.length}`);
    }

    if (parsed.to) {
      values.push(parsed.to);
      where.push(`t.transaction_timestamp <= $${values.length}`);
    }

    const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";

    const summaryResult = await pool.query(
      `SELECT
                COALESCE(SUM(t.amount), 0)::numeric(12,2) AS total_spending,
                COUNT(*)::int AS transaction_count,
                COALESCE(AVG(t.amount), 0)::numeric(12,2) AS average_transaction
             FROM transactions t
             ${whereSql}`,
      values
    );

    const categoriesResult = await pool.query(
      `SELECT
                COALESCE(mr.edited_description, mr.combined_description, mr.usda_description, mr.irs_description, t.category, 'Uncategorized') AS category,
                COALESCE(SUM(t.amount), 0)::numeric(12,2) AS amount
             FROM transactions t
             LEFT JOIN mcc_reference mr ON mr.mcc = t.mcc_code
             ${whereSql}
             GROUP BY 1
             ORDER BY amount DESC`,
      values
    );

    const summary = summaryResult.rows[0] || {
      total_spending: 0,
      transaction_count: 0,
      average_transaction: 0,
    };

    const totalSpending = Number(summary.total_spending || 0);
    const categories = categoriesResult.rows.map((row) => {
      const amount = Number(row.amount || 0);
      return {
        category: row.category,
        amount,
        percent: totalSpending > 0 ? (amount / totalSpending) * 100 : 0,
      };
    });

    return res.json({
      total_spending: totalSpending,
      transaction_count: Number(summary.transaction_count || 0),
      average_transaction: Number(summary.average_transaction || 0),
      top_category: categories[0] || null,
      categories,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ message: "Invalid query parameters", issues: error.issues });
    }
    return res.status(500).json({ message: error.message });
  }
});

app.get("/api/overview/timeseries", async (req, res) => {
  try {
    const schema = z.object({
      granularity: z.enum(["day", "month", "year"]).default("month"),
      accountId: z.string().optional(),
      from: z.string().optional(),
      to: z.string().optional(),
    });

    const parsed = schema.parse(req.query);
    const where = [];
    const values = [parsed.granularity];

    if (parsed.accountId) {
      values.push(Number(parsed.accountId));
      where.push(`t.account_id = $${values.length}`);
    }

    if (parsed.from) {
      values.push(parsed.from);
      where.push(`t.transaction_timestamp >= $${values.length}`);
    }

    if (parsed.to) {
      values.push(parsed.to);
      where.push(`t.transaction_timestamp <= $${values.length}`);
    }

    const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";

    const { rows } = await pool.query(
      `SELECT
                CASE
                    WHEN $1 = 'year' THEN to_char(date_trunc('year', t.transaction_timestamp), 'YYYY')
                    WHEN $1 = 'month' THEN to_char(date_trunc('month', t.transaction_timestamp), 'YYYY-MM')
                    ELSE to_char(date_trunc('day', t.transaction_timestamp), 'YYYY-MM-DD')
                END AS period_key,
                CASE
                    WHEN $1 = 'year' THEN to_char(date_trunc('year', t.transaction_timestamp), 'YYYY')
                    WHEN $1 = 'month' THEN to_char(date_trunc('month', t.transaction_timestamp), 'Mon YYYY')
                    ELSE to_char(date_trunc('day', t.transaction_timestamp), 'DD Mon YYYY')
                END AS period_label,
                COALESCE(SUM(t.amount), 0)::numeric(12,2) AS total,
                CASE
                    WHEN $1 = 'year' THEN date_trunc('year', t.transaction_timestamp)
                    WHEN $1 = 'month' THEN date_trunc('month', t.transaction_timestamp)
                    ELSE date_trunc('day', t.transaction_timestamp)
                END AS period_start
             FROM transactions t
             ${whereSql}
             GROUP BY period_key, period_label, period_start
             ORDER BY period_start ASC`,
      values
    );

    return res.json(
      rows.map((row) => ({
        period_key: row.period_key,
        period_label: row.period_label,
        total: Number(row.total || 0),
      }))
    );
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ message: "Invalid query parameters", issues: error.issues });
    }
    return res.status(500).json({ message: error.message });
  }
});

app.post("/api/transactions", async (req, res) => {
  try {
    const schema = z.object({
      account_id: z.coerce.number().int().positive(),
      merchant: z.string().nullable().optional(),
      amount: z.coerce.number().finite(),
      currency: z.string().length(3),
      category: z.string().nullable().optional(),
      mcc_code: z.string().max(4).nullable().optional(),
      transaction_timestamp: z.string(),
    });

    const body = schema.parse(req.body);

    const { rows } = await pool.query(
      `INSERT INTO transactions (
                account_id,
                merchant,
                amount,
                currency,
                category,
                mcc_code,
                transaction_timestamp
            )
            VALUES ($1, $2, $3, UPPER($4), $5, NULLIF($6, ''), $7::timestamptz)
            RETURNING *`,
      [
        body.account_id,
        body.merchant ?? null,
        body.amount,
        body.currency,
        body.category ?? null,
        body.mcc_code ?? null,
        body.transaction_timestamp,
      ]
    );

    return res.status(201).json(rows[0]);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ message: "Invalid payload", issues: error.issues });
    }

    if (error?.code === "23503") {
      return res.status(400).json({ message: "Invalid account_id" });
    }

    return res.status(500).json({ message: error.message });
  }
});

app.put("/api/transactions/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    const schema = z.object({
      merchant: z.string().nullable().optional(),
      amount: z.coerce.number().finite(),
      currency: z.string().length(3),
      category: z.string().nullable().optional(),
      mcc_code: z.string().max(4).nullable().optional(),
      transaction_timestamp: z.string(),
    });

    const body = schema.parse(req.body);

    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      let merchantId = null;
      const merchantName = body.merchant?.trim() ?? null;

      if (merchantName) {
        const merchantNormalized = normalizeMerchant(merchantName);
        const mccCode = body.mcc_code || null;

        let mccDescription = null;
        if (mccCode) {
          const mccResult = await client.query(
            `SELECT COALESCE(edited_description, combined_description, usda_description, irs_description, '') AS description
                         FROM mcc_reference WHERE mcc = $1`,
            [mccCode]
          );
          mccDescription = mccResult.rows[0]?.description || null;
        }

        const cacheResult = await client.query(
          `INSERT INTO merchant_mcc_cache (merchant_normalized, merchant_original, mcc_code, mcc_description, category)
                     VALUES ($1, $2, $3, $4, $5)
                     ON CONFLICT (merchant_normalized) DO UPDATE
                     SET merchant_original = EXCLUDED.merchant_original,
                         mcc_code = CASE WHEN merchant_mcc_cache.manual_override THEN merchant_mcc_cache.mcc_code ELSE EXCLUDED.mcc_code END,
                         mcc_description = CASE WHEN merchant_mcc_cache.manual_override THEN merchant_mcc_cache.mcc_description ELSE EXCLUDED.mcc_description END,
                         category = CASE WHEN merchant_mcc_cache.manual_override THEN merchant_mcc_cache.category ELSE EXCLUDED.category END,
                         updated_at = NOW()
                     RETURNING id`,
          [merchantNormalized, merchantName, mccCode, mccDescription, body.category ?? null]
        );
        merchantId = cacheResult.rows[0]?.id ?? null;
      }

      const { rows } = await client.query(
        `UPDATE transactions
                 SET merchant = $1,
                     amount = $2,
                     currency = UPPER($3),
                     category = $4,
                     mcc_code = NULLIF($5, ''),
                     transaction_timestamp = $6::timestamptz,
                     merchant_id = $7
                 WHERE id = $8
                 RETURNING *`,
        [
          merchantName,
          body.amount,
          body.currency,
          body.category ?? null,
          body.mcc_code ?? null,
          body.transaction_timestamp,
          merchantId,
          id,
        ]
      );

      if (!rows[0]) {
        await client.query("ROLLBACK");
        return res.status(404).json({ message: "Transaction not found" });
      }

      await client.query("COMMIT");
      return res.json(rows[0]);
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ message: "Invalid payload", issues: error.issues });
    }
    return res.status(500).json({ message: error.message });
  }
});

app.listen(port, () => {
  console.log(`API server running on http://localhost:${port}`);
});
