// server.ts
import express from "express";
import path from "path";
import dotenv from "dotenv";
import fs from "fs/promises";
import { createServer as createViteServer } from "vite";
import { callOpenRouter } from "./src/lib/openrouter.js";
import { bulkUpsertMenuItems, authenticateToken } from "./src/lib/supabase-server.js";
import type { RequestHandler, Request } from "express";

// Load environment variables
dotenv.config();

function getBearerToken(req: Request): string | null {
  const header = req.headers.authorization;
  if (!header || !header.startsWith("Bearer ")) return null;
  const token = header.slice("Bearer ".length).trim();
  return token || null;
}

// Auth guard: requires a valid Supabase session; `admin` also requires the admin role.
function requireAuth(options: { admin?: boolean } = {}): RequestHandler {
  return async (req, res, next) => {
    const token = getBearerToken(req);
    if (!token) {
      res.status(401).json({ error: "Authentication required." });
      return;
    }
    try {
      const user = await authenticateToken(token);
      if (!user) {
        res.status(401).json({ error: "Invalid or expired session." });
        return;
      }
      if (options.admin && user.role !== "admin") {
        res.status(403).json({ error: "Administrator access required." });
        return;
      }
      res.locals.user = user;
      next();
    } catch (err) {
      console.error("Authentication error:", err);
      res.status(401).json({ error: "Authentication failed." });
    }
  };
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  // Body parser middlewares
  app.use(express.json({ limit: "10mb" }));
  app.use(express.urlencoded({ extended: true, limit: "10mb" }));

  // --- API ROUTE: HEALTH CHECK ---
  app.get("/api/health", (req, res) => {
    res.json({ status: "healthy", timestamp: new Date().toISOString() });
  });

  // --- API ROUTE: SEED MENU ---
  // POST endpoint to seed menu from .txt file content (admin only)
  app.post("/api/menu/seed", requireAuth({ admin: true }), async (req, res) => {
    const { fileContent } = req.body;
    if (!fileContent) {
      return res.status(400).json({ error: "Missing fileContent in request body" });
    }

    try {
      const lines = fileContent.split(/\r?\n/);
      const itemsToImport = [];
      let skippedCount = 0;
      const localReport: string[] = [];

      lines.forEach((line: string, index: number) => {
        const lineNum = index + 1;
        const trimmed = line.trim();
        if (!trimmed) return;

        const parts = trimmed.split(";");
        if (parts.length < 3) {
          skippedCount++;
          localReport.push(`Line ${lineNum}: Skipped. Format must be CODE;Name;Price`);
          return;
        }

        const code = parts[0].trim().toUpperCase();
        const name = parts[1].trim();
        const priceStr = parts[2].trim();
        const price = parseFloat(priceStr);

        if (!code || !name || isNaN(price) || price <= 0) {
          skippedCount++;
          localReport.push(`Line ${lineNum}: Skipped. Invalid entry.`);
          return;
        }

        let category = "pizza";
        if (code.startsWith("B")) category = "base";
        else if (code.startsWith("T")) category = "topping";
        else if (code.startsWith("P")) category = "pizza";
        else {
          skippedCount++;
          localReport.push(`Line ${lineNum}: Skipped. Invalid prefix.`);
          return;
        }

        itemsToImport.push({
          code,
          category,
          name,
          price_inr: price,
          description: `${category.toUpperCase()} imported via Server Seed API`,
          is_active: true
        });
      });

      const result = await bulkUpsertMenuItems(itemsToImport);
      res.json({
        success: true,
        imported: result.imported,
        updated: result.updated,
        skipped: result.skipped + skippedCount,
        report: [...result.report, ...localReport]
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message || "Failed to execute server-side seed" });
    }
  });

  // --- API ROUTE: AI INSIGHTS ---
  // POST endpoint to generate insights for Rajan using statistics and OpenRouter/Gemini
  app.post("/api/ai/insights", requireAuth(), async (req, res) => {
    const { question, statistics } = req.body;
    if (!question) {
      return res.status(400).json({ error: "Missing question in request body" });
    }

    // VERBATIM SYSTEM PROMPT requested in instructions
    const systemPrompt = `You are a retail analytics assistant for SliceMatic, a single-outlet pizza brand in Delhi.
Answer ONLY from the JSON statistics provided in this message. Never fabricate numbers.
If the data is insufficient to answer, say exactly: "Not enough data yet."
Be concise — 2-3 sentences maximum. End with one concrete, actionable recommendation.
Format currency as ₹ with Indian number formatting (e.g. ₹1,23,456).`;

    const statsString = JSON.stringify(statistics, null, 2);
    const userMessage = `JSON Statistics Provided:
\`\`\`json
${statsString}
\`\`\`

User Question: ${question}`;

    try {
      const result = await callOpenRouter(systemPrompt, userMessage);
      if (result.ok === true) {
        res.json({ text: result.text });
      } else {
        res.status(502).json({ error: result.error });
      }
    } catch (err: any) {
      res.status(500).json({ error: err.message || "Internal server error analyzing statistics" });
    }
  });

  // --- API ROUTE: LOG COMPLETED ORDERS ---
  app.post("/api/orders/log", requireAuth(), async (req, res) => {
    const {
      timestamp,
      customer_name,
      customer_phone,
      quantity,
      subtotal,
      discount,
      gst,
      total_payable,
      payment_mode,
      cart
    } = req.body;

    try {
      const itemSelectionsList: string[] = [];
      const unitPricesList: string[] = [];

      if (Array.isArray(cart)) {
        cart.forEach((item: any, idx: number) => {
          const baseName = item.base?.name || "Unknown Base";
          const basePrice = item.base?.price_inr || 0;
          const pizzaName = item.pizza?.name || "Unknown Pizza";
          const pizzaPrice = item.pizza?.price_inr || 0;
          const itemQty = item.quantity || 1;

          const toppingsInfo: string[] = [];
          const toppingsPrices: string[] = [];

          if (Array.isArray(item.toppings)) {
            item.toppings.forEach((t: any) => {
              const topName = t.topping?.name || "Unknown Topping";
              const topPrice = t.topping?.price_inr || 0;
              const topQty = t.quantity || 1;
              toppingsInfo.push(`${topName} (x${topQty})`);
              toppingsPrices.push(`${topName} (x${topQty}): ₹${Number(topPrice).toFixed(2)}`);
            });
          }

          const toppingsStr = toppingsInfo.length > 0 ? `, Toppings: ${toppingsInfo.join(", ")}` : "";
          const toppingsPricesStr = toppingsPrices.length > 0 ? `, Toppings: [${toppingsPrices.join(", ")}]` : "";

          itemSelectionsList.push(
            `Pizza #${idx + 1} (x${itemQty}) [Base: ${baseName}, Preset: ${pizzaName}${toppingsStr}]`
          );
          unitPricesList.push(
            `Pizza #${idx + 1} [Base: ₹${Number(basePrice).toFixed(2)}, Preset: ₹${Number(pizzaPrice).toFixed(2)}${toppingsPricesStr}]`
          );
        });
      }

      const itemSelections = itemSelectionsList.join("; ");
      const unitPrices = unitPricesList.join("; ");

      const logBlock = [
        `Timestamp: ${timestamp || new Date().toISOString()}`,
        `Customer Name: ${customer_name || "N/A"}`,
        `Phone: ${customer_phone || "N/A"}`,
        `Item Selections: ${itemSelections || "N/A"}`,
        `Unit Prices: ${unitPrices || "N/A"}`,
        `Quantity: ${quantity || 0}`,
        `Subtotal: ₹${Number(subtotal || 0).toFixed(2)}`,
        `Discount: ₹${Number(discount || 0).toFixed(2)}`,
        `GST: ₹${Number(gst || 0).toFixed(2)}`,
        `Final Total: ₹${Number(total_payable || 0).toFixed(2)}`,
        `Payment Mode: ${payment_mode || "N/A"}`,
        "" // Blank line between orders
      ].join("\n");

      const logFilePath = path.join(process.cwd(), "orders_log.txt");
      await fs.appendFile(logFilePath, logBlock, "utf8");

      res.json({ success: true });
    } catch (err: any) {
      console.error("Error writing to orders_log.txt:", err);
      res.status(500).json({ error: err.message || "Failed to write to order log file" });
    }
  });

  // --- VITE MIDDLEWARE SETUP FOR DEV/PROD ---
  if (process.env.NODE_ENV !== "production") {
    console.log("Starting server in development mode with Vite middleware...");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    console.log("Starting server in production mode serving compiled static assets...");
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`SliceMatic PizzaFlow running on http://localhost:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error("Critical: Failed to boot Express + Vite Server:", err);
});
