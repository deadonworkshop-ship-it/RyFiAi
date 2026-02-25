import express from "express";
import { createServer as createViteServer } from "vite";
import Database from "better-sqlite3";
import cron from "node-cron";
import { Resend } from "resend";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const db = new Database("finance.db");
const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;

// Initialize DB
db.exec(`
  CREATE TABLE IF NOT EXISTS finance_data (
    id TEXT PRIMARY KEY,
    data TEXT
  )
`);

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '50mb' }));

  // API Routes
  app.get("/api/data", (req, res) => {
    const row = db.prepare("SELECT data FROM finance_data WHERE id = 'main'").get() as { data: string } | undefined;
    if (row) {
      res.json(JSON.parse(row.data));
    } else {
      res.json({});
    }
  });

  app.post("/api/data", (req, res) => {
    const data = JSON.stringify(req.body);
    db.prepare("INSERT OR REPLACE INTO finance_data (id, data) VALUES ('main', ?)").run(data);
    res.json({ status: "ok" });
  });

  // Manual Export Endpoint
  app.get("/api/export", (req, res) => {
    const row = db.prepare("SELECT data FROM finance_data WHERE id = 'main'").get() as { data: string } | undefined;
    if (row) {
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Content-Disposition', 'attachment; filename=billsops_backup.json');
      res.send(row.data);
    } else {
      res.status(404).send("No data found");
    }
  });

  // Cron Job: 1st of every month at 00:00
  cron.schedule("0 0 1 * *", async () => {
    console.log("Running monthly backup cron job...");
    const row = db.prepare("SELECT data FROM finance_data WHERE id = 'main'").get() as { data: string } | undefined;
    if (!row) return;

    const allData = JSON.parse(row.data);
    const targetEmail = allData.backup_email || process.env.USER_EMAIL;

    if (!resend || !targetEmail) {
      console.log("Resend API Key or User Email missing. Skipping backup email.");
      return;
    }

    try {
      await resend.emails.send({
        from: "BillsOps Backup <onboarding@resend.dev>",
        to: targetEmail,
        subject: `BillsOps Monthly Backup - ${new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}`,
        text: "Attached is your monthly financial data backup.",
        attachments: [
          {
            filename: `billsops_backup_${new Date().toISOString().split('T')[0]}.json`,
            content: Buffer.from(row.data).toString('base64'),
          },
        ],
      });
      console.log(`Backup email sent successfully to ${targetEmail}.`);
    } catch (error) {
      console.error("Failed to send backup email:", error);
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.join(__dirname, "dist")));
    app.get("*", (req, res) => {
      res.sendFile(path.join(__dirname, "dist", "index.html"));
    });
  }

  const PORT = 3000;
  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
