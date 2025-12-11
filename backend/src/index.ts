import express, { Request, Response } from "express";
import cors from "cors";
import dotenv from "dotenv";
import { prisma } from "./db";
import authRoutes from "./routes/auth";

dotenv.config();

const app = express();
const port = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// Health check
app.get("/health", (req: Request, res: Response) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// Routes
app.use("/auth", authRoutes);

// Temporary test endpoint for creating SNT manually (optional)
app.post("/snt", async (req: Request, res: Response) => {
  try {
    const { name, location } = req.body;

    const snt = await prisma.snt.create({
      data: { name, location },
    });

    res.json(snt);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Unable to create SNT" });
  }
});

app.listen(port, () => {
  console.log(`SNT backend running on port ${port}`);
});
