import fs from "fs";
import path from "path";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { name, mimeType, base64Data, qrData } = req.body;

    if (!name || !mimeType || !base64Data) {
      return res.status(400).json({ error: "Missing file fields" });
    }

    const safeName = name.replace(/[^a-zA-Z0-9_\.-]/g, "_");

    const uploadDir = path.join(process.cwd(), "uploads");
    if (!fs.existsSync(upload
