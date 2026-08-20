require("dotenv").config();

const express = require("express");
const cors = require("cors");
const connectDB = require("./config/db");
const cloudinary = require("./config/cloudinary");

const app = express();

connectDB();

app.use(
  cors({
    origin: true,
    credentials: true,
  })
);

app.use(express.json());


app.get("/api/health/cloudinary", async (req, res) => {
  try {
    await cloudinary.api.ping();

    res.json({
      success: true,
      message: "Cloudinary connection successful",
    });
  } catch (error) {
    console.error("Cloudinary health check failed:", error.message);

    res.status(500).json({
      success: false,
      message: "Cloudinary connection failed",
    });
  }
});

app.get("/", (req, res) => {
  res.json({
    message: "MetroVybe API is running",
  });
});

app.use("/api/auth", require("./routes/authRoutes"));
app.use("/api/business", require("./routes/businessRoutes"));
app.use("/api/admin", require("./routes/adminRoutes"));
app.use("/api/listings", require("./routes/listingRoutes"));

const PORT = process.env.PORT || 5001;

app.listen(PORT, () => {
  console.log(`MetroVybe backend running on port ${PORT}`);
});
