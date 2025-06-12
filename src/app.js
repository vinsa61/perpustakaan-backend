"use strict";

require("dotenv").config();

const express = require("express");
const cors = require("cors");
const path = require("path");
const { connectToDatabase } = require("./config/database");
const errorHandler = require("./middleware/errorHandler");

// Import routes
const authRoutes = require("./routes/authRoutes");
const bookRoutes = require("./routes/bookRoutes");
const adminRoutes = require("./routes/adminRoutes");
const bookshelfRoutes = require("./routes/bookshelfRoutes");

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(
  cors({
    origin: [
      "http://localhost:3000",
      "http://127.0.0.1:3000",
      process.env.FRONTEND_URL || "http://localhost:3000",
    ],
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "x-requested-with"],
  })
);

app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));

// Serve static files (for uploaded images)
app.use("/uploads", express.static(path.join(__dirname, "../uploads")));

// Connect to MySQL database
connectToDatabase()
  .then(() => {
    console.log("🚀 Database connection established successfully");
    console.log(`📊 Connected to database: ${process.env.DB_NAME}`);
  })
  .catch((error) => {
    console.error("❌ Failed to connect to database:", error.message);
    process.exit(1);
  });

// Routes
app.use("/api/auth", authRoutes);
app.use("/api/books", bookRoutes);
app.use("/api", adminRoutes); // This will handle /api/requests
app.use("/api/bookshelf", bookshelfRoutes);

// Health check endpoint
app.get("/", (req, res) => {
  res.json({
    message: "📚 Digital Library API is running!",
    timestamp: new Date().toISOString(),
    status: "OK",
    environment: process.env.NODE_ENV,
    database: process.env.DB_NAME,
    endpoints: {
      auth: {
        register: "POST /api/auth/register",
        login: "POST /api/auth/login",
      },
      books: {
        getAll: "GET /api/books",
        getById: "GET /api/books/:id",
      },
      admin: {
        getRequests: "GET /api/requests (Admin only)",
        updateRequest: "PATCH /api/requests/:id (Admin only)",
      },
      bookshelf: {
        getUserBookshelf: "GET /api/bookshelf/:id",
      },
    },
  });
});

// Error handling middleware
app.use(errorHandler);

// 404 handler
app.use("*", (req, res) => {
  res.status(404).json({
    message: "🔍 Endpoint not found",
    path: req.originalUrl,
  });
});

// Start the server
app.listen(PORT, () => {
  console.log(`🚀 Server is running on port ${PORT}`);
  console.log(`📡 API available at: http://localhost:${PORT}`);
  console.log(`🌍 Environment: ${process.env.NODE_ENV}`);
});

// Graceful shutdown
process.on("SIGTERM", async () => {
  console.log("SIGTERM received, shutting down gracefully");
  const { closeDatabase } = require("./config/database");
  await closeDatabase();
  process.exit(0);
});

process.on("SIGINT", async () => {
  console.log("SIGINT received, shutting down gracefully");
  const { closeDatabase } = require("./config/database");
  await closeDatabase();
  process.exit(0);
});

module.exports = app;
