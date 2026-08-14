require("dotenv").config();

const express = require("express");
const cors = require("cors");
const connectDB = require("./config/db");

const app = express();

connectDB();

app.use(
  cors({
    origin: true,
    credentials: true,
  })
);

app.use(express.json());

app.get("/", (req, res) => {
  res.json({
    message: "MetroVybe API is running",
  });
});

app.use("/api/listings", require("./routes/listingRoutes"));

const PORT = process.env.PORT || 5001;

app.listen(PORT, () => {
  console.log(`MetroVybe backend running on port ${PORT}`);
});
