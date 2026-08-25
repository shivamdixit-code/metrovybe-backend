require("dotenv").config();

const express = require("express");
const cors = require("cors");
const connectDB = require("./config/db");
const cloudinary = require("./config/cloudinary");
const upload = require("./middleware/upload");

const app = express();

connectDB();

app.use(
  cors({
    origin: true,
    credentials: true,
  })
);

app.use(express.json());




app.post("/api/upload/image", upload.single("image"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: "No image file provided",
      });
    }

    const result = await new Promise((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(
        {
          folder: "metrovybe",
          resource_type: "image",
        },
        (error, result) => {
          if (error) return reject(error);
          resolve(result);
        }
      );

      stream.end(req.file.buffer);
    });

    res.json({
      success: true,
      message: "Image uploaded successfully",
      url: result.secure_url,
      public_id: result.public_id,
    });
  } catch (error) {
    console.error("Cloudinary upload failed:", error.message);

    res.status(500).json({
      success: false,
      message: "Image upload failed",
      error: error.message,
    });
  }
});


app.post("/api/upload/document", upload.single("document"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: "No document file provided",
      });
    }

    const isPdf = req.file.mimetype === "application/pdf";

    const result = await new Promise((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(
        {
          folder: "metrovybe/business-documents",
          resource_type: "auto",
        },
        (error, result) => {
          if (error) return reject(error);
          resolve(result);
        }
      );

      stream.end(req.file.buffer);
    });

    return res.json({
      success: true,
      message: "Document uploaded successfully",
      url: result.secure_url,
      public_id: result.public_id,
      resource_type: result.resource_type,
      format: result.format,
      original_filename: req.file.originalname,
      mime_type: req.file.mimetype,
      is_pdf: isPdf,
    });
  } catch (error) {
    console.error("Cloudinary document upload failed:", error);

    return res.status(500).json({
      success: false,
      message: "Document upload failed",
      error: error.message,
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
app.use("/api/enquiries", require("./routes/enquiryRoutes"));
app.use("/api/saved", require("./routes/savedRoutes"));
app.use("/api/bookings", require("./routes/bookingRoutes"));
app.use("/api/notifications", require("./routes/notificationRoutes"));
app.use("/api/reviews", require("./routes/reviewRoutes"));

const PORT = process.env.PORT || 5001;

app.listen(PORT, () => {
  console.log(`MetroVybe backend running on port ${PORT}`);
});
