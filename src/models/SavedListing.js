const mongoose = require("mongoose");

const savedListingSchema = new mongoose.Schema(
  {
    customer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    listing: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Listing",
      required: true,
      index: true,
    },
  },
  {
    timestamps: true,
  }
);

// One customer can save a listing only once.
savedListingSchema.index(
  { customer: 1, listing: 1 },
  { unique: true }
);

// Useful for loading a customer's saved listings newest-first.
savedListingSchema.index({
  customer: 1,
  createdAt: -1,
});

module.exports = mongoose.model("SavedListing", savedListingSchema);
