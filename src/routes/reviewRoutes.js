const express = require("express");
const mongoose = require("mongoose");

const router = express.Router();

const Review = require("../models/Review");
const Booking = require("../models/Booking");
const Listing = require("../models/Listing");
const auth = require("../middleware/auth");

// Recalculate and store a listing's average rating and review count
async function updateListingRating(listingId) {
  const stats = await Review.aggregate([
    {
      $match: {
        listing: new mongoose.Types.ObjectId(String(listingId)),
      },
    },
    {
      $group: {
        _id: "$listing",
        averageRating: { $avg: "$rating" },
        reviewCount: { $sum: 1 },
      },
    },
  ]);

  const averageRating = stats.length
    ? Math.round(stats[0].averageRating * 10) / 10
    : 0;

  const reviewCount = stats.length ? stats[0].reviewCount : 0;

  await Listing.findByIdAndUpdate(listingId, {
    rating: averageRating,
    reviews: reviewCount,
  });
}

// Public: get reviews for a listing
router.get("/listing/:listingId", async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.listingId)) {
      return res.status(400).json({ message: "Invalid listing ID." });
    }

    const reviews = await Review.find({
      listing: req.params.listingId,
    })
      .populate("customer", "name")
      .sort({ createdAt: -1 })
      .lean();

    return res.json({ reviews });
  } catch (error) {
    console.error("Get listing reviews error:", error);
    return res.status(500).json({ message: "Failed to fetch reviews." });
  }
});

// Customer: get own reviews
router.get("/my", auth, async (req, res) => {
  try {
    if (req.user.role !== "customer") {
      return res.status(403).json({ message: "Customers only." });
    }

    const reviews = await Review.find({ customer: req.user.id })
      .populate("listing", "title slug")
      .populate("booking", "status bookingDate")
      .sort({ createdAt: -1 })
      .lean();

    return res.json({ reviews });
  } catch (error) {
    console.error("Get my reviews error:", error);
    return res.status(500).json({ message: "Failed to fetch your reviews." });
  }
});

// Customer: create a review for a completed booking
router.post("/", auth, async (req, res) => {
  try {
    if (req.user.role !== "customer") {
      return res.status(403).json({ message: "Customers only." });
    }

    const { bookingId, rating, comment = "" } = req.body;

    if (!bookingId || !mongoose.Types.ObjectId.isValid(bookingId)) {
      return res.status(400).json({ message: "A valid booking is required." });
    }

    const numericRating = Number(rating);
    if (
      !Number.isInteger(numericRating) ||
      numericRating < 1 ||
      numericRating > 5
    ) {
      return res.status(400).json({ message: "Rating must be between 1 and 5." });
    }

    const booking = await Booking.findOne({
      _id: bookingId,
      customer: req.user.id,
      status: "completed",
    });

    if (!booking) {
      return res.status(403).json({
        message: "You can only review your completed bookings.",
      });
    }

    const existingReview = await Review.findOne({ booking: bookingId });
    if (existingReview) {
      return res.status(409).json({
        message: "You have already reviewed this booking.",
      });
    }

    const review = await Review.create({
      customer: req.user.id,
      business: booking.business,
      listing: booking.listing,
      booking: booking._id,
      rating: numericRating,
      comment,
    });

    await updateListingRating(booking.listing);

    return res.status(201).json({
      message: "Review submitted successfully.",
      review,
    });
  } catch (error) {
    console.error("Create review error:", error);
    return res.status(500).json({ message: "Failed to submit review." });
  }
});

// Customer: edit own review
router.put("/:reviewId", auth, async (req, res) => {
  try {
    if (req.user.role !== "customer") {
      return res.status(403).json({ message: "Customers only." });
    }

    if (!mongoose.Types.ObjectId.isValid(req.params.reviewId)) {
      return res.status(400).json({ message: "Invalid review ID." });
    }

    const review = await Review.findOne({
      _id: req.params.reviewId,
      customer: req.user.id,
    });

    if (!review) {
      return res.status(404).json({ message: "Review not found." });
    }

    const { rating, comment } = req.body;

    if (rating !== undefined) {
      const numericRating = Number(rating);
      if (
        !Number.isInteger(numericRating) ||
        numericRating < 1 ||
        numericRating > 5
      ) {
        return res.status(400).json({
          message: "Rating must be between 1 and 5.",
        });
      }
      review.rating = numericRating;
    }

    if (comment !== undefined) {
      review.comment = String(comment).trim().slice(0, 2000);
    }

    await review.save();
    await updateListingRating(review.listing);

    return res.json({
      message: "Review updated successfully.",
      review,
    });
  } catch (error) {
    console.error("Update review error:", error);
    return res.status(500).json({ message: "Failed to update review." });
  }
});

// Customer: delete own review
router.delete("/:reviewId", auth, async (req, res) => {
  try {
    if (req.user.role !== "customer") {
      return res.status(403).json({ message: "Customers only." });
    }

    if (!mongoose.Types.ObjectId.isValid(req.params.reviewId)) {
      return res.status(400).json({ message: "Invalid review ID." });
    }

    const review = await Review.findOneAndDelete({
      _id: req.params.reviewId,
      customer: req.user.id,
    });

    if (!review) {
      return res.status(404).json({ message: "Review not found." });
    }

    await updateListingRating(review.listing);

    return res.json({ message: "Review deleted successfully." });
  } catch (error) {
    console.error("Delete review error:", error);
    return res.status(500).json({ message: "Failed to delete review." });
  }
});

module.exports = router;
