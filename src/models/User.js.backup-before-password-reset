const mongoose = require("mongoose");

const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },

    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },

    phone: {
      type: String,
      default: "",
      trim: true,
    },

    gender: {
      type: String,
      enum: ["male", "female", "non-binary", "prefer-not-to-say"],
      default: undefined,
    },

    dateOfBirth: {
      type: Date,
      default: undefined,
    },

    location: {
      latitude: {
        type: Number,
        default: undefined,
      },
      longitude: {
        type: Number,
        default: undefined,
      },
      label: {
        type: String,
        default: "",
        trim: true,
      },
    },

    password: {
      type: String,
      required: true,
    },

    role: {
      type: String,
      enum: ["customer", "business", "admin"],
      default: "customer",
    },

    status: {
      type: String,
      enum: ["active", "pending", "suspended"],
      default: "active",
    },

    emailVerified: {
      type: Boolean,
      default: false,
    },

    emailVerificationTokenHash: {
      type: String,
      default: "",
    },

    emailVerificationTokenExpiresAt: {
      type: Date,
      default: undefined,
    },

    emailVerificationLastSentAt: {
      type: Date,
      default: undefined,
    },

    phoneVerified: {
      type: Boolean,
      default: false,
    },

    phoneOtpHash: {
      type: String,
      default: "",
    },

    phoneOtpExpiresAt: {
      type: Date,
      default: undefined,
    },

    phoneOtpAttempts: {
      type: Number,
      default: 0,
    },

    phoneOtpLastSentAt: {
      type: Date,
      default: undefined,
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model("User", userSchema);
