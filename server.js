const express = require("express");
const dotenv = require("dotenv");
const cors = require("cors");
const helmet = require("helmet");
const morgan = require("morgan");
const rateLimit = require("express-rate-limit");

dotenv.config();
const app = express();

// Security middleware
app.use(helmet());

// Logging middleware
app.use(morgan("dev"));

// Enable CORS
app.use(cors());

// JSON Middleware
app.use(express.json());

// Rate Limiting: Prevent excessive requests
const limiter = rateLimit({
    windowMs: 1 * 60 * 1000, // 1 minute
    max: 10, // Limit each IP to 10 requests per minute
    message: "Too many requests, please try again later.",
});
app.use(limiter);

// Import Routes
const authRoutes = require("./routes/authRoutes");
// const bookRoutes = require("./routes/bookRoutes");
const queryRoutes = require("./routes/queryRoutes");

// Define Routes
app.use("/api/auth", authRoutes);
// app.use("/api/book", bookRoutes);
app.use("/api/query", queryRoutes);

// Default Route
app.get("/", (req, res) => {
    res.send("Server is running...");
});

// Error Handling Middleware
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).json({ error: "Internal Server Error" });
});

// Start Server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
});

