const express = require("express");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;

// Basic logger (optional)
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
  next();
});

// Serve static files from /public
app.use(express.static(path.join(__dirname, "public")));

// Simple health endpoint (good for Render)
app.get("/health", (req, res) => {
  res.json({ status: "ok" });
});

// Root route -> index.html
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.listen(PORT, () => {
  console.log(`Maizic Barcode Scanner running on port ${PORT}`);
});
