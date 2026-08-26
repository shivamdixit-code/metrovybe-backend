const mongoose = require("mongoose");

const reviewSchema = new mongoose.Schema(
  {
    customer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    business: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Business",
      required: true,
      index: true,
    },
    listing: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Listing",
      required: true,
      index: true,
    },
    booking: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Booking",
      required: true,
      unique: true,
    },
    rating: {
      type: Number,
      required: true,
      min: 1,
      max: 5,
    },
    comment: {
      type: String,
      default: "",
      trim: true,
      maxlength: 2000,
    },

    businessReply: {
      message: {
        type: String,
        default: "",
        trim: true,
        maxlength: 2000,
      },
      repliedAt: {
        type: Date,
        default: null,
      },
    },
  },
  {
    timestamps: true,
  }
);

reviewSchema.index({ listing: 1, createdAt: -1 });
reviewSchema.index({ customer: 1, createdAt: -1 });

module.exports = mongoose.model("Review", reviewSchema);
