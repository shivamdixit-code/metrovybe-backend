const mongoose = require("mongoose");

const businessSchema = new mongoose.Schema(
  {
    owner: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      unique: true,
    },

    businessName: {
      type: String,
      required: true,
      trim: true,
    },

    description: {
      type: String,
      default: "",
    },

    category: {
      type: String,
      required: true,
      trim: true,
    },

    phone: {
      type: String,
      default: "",
      trim: true,
    },

    email: {
      type: String,
      default: "",
      lowercase: true,
      trim: true,
    },

    address: {
      type: String,
      required: true,
      trim: true,
    },

    city: {
      type: String,
      required: true,
      trim: true,
    },

    state: {
      type: String,
      default: "",
      trim: true,
    },

    pincode: {
      type: String,
      default: "",
      trim: true,
    },

    location: {
      latitude: {
        type: Number,
        default: null,
      },

      longitude: {
        type: Number,
        default: null,
      },
    },

    businessHours: {
    open: {
      type: String,
      default: "",
      trim: true,
    },
    close: {
      type: String,
      default: "",
      trim: true,
    },
    open24Hours: {
      type: Boolean,
      default: false,
    },
  },

  logo: {
      type: String,
      default: "",
    },

    images: {
      type: [String],
      default: [],
    },

    verificationStatus: {
      type: String,
      enum: [
        "pending",
        "under_review",
        "verified",
        "rejected",
        "suspended",
      ],
      default: "pending",
    },

    rejectionReason: {
      type: String,
      default: "",
    },

    verifiedAt: {
      type: Date,
      default: null,
    },

    status: {
      type: String,
      enum: ["active", "inactive", "suspended"],
      default: "active",
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model("Business", businessSchema);
