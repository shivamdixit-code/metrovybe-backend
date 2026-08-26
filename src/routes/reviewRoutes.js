const express = require("express");
const mongoose = require("mongoose");

const router = express.Router();

const Review = require("../models/Review");
const Booking = require("../models/Booking");
const Listing = require("../models/Listing");
const Notification = require("../models/Notification");
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

// Business: get all reviews for the logged-in business
router.get("/business", auth, async (req, res) => {
  try {
    if (req.user.role !== "business") {
      return res.status(403).json({ message: "Business account required." });
    }

    const Business = require("../models/Business");

    const business = await Business.findOne({ owner: req.user.id }).select("_id");

    if (!business) {
      return res.status(404).json({ message: "Business profile not found." });
    }

    const reviews = await Review.find({ business: business._id })
      .populate("customer", "name")
      .populate("listing", "title")
      .sort({ createdAt: -1 })
      .lean();

    const totalReviews = reviews.length;
    const averageRating = totalReviews
      ? Math.round(
          (reviews.reduce((sum, review) => sum + Number(review.rating || 0), 0) /
            totalReviews) *
            10
        ) / 10
      : 0;

    const ratingBreakdown = [5, 4, 3, 2, 1].map((rating) => ({
      rating,
      count: reviews.filter((review) => Number(review.rating) === rating).length,
    }));

    return res.json({
      reviews,
      totalReviews,
      averageRating,
      ratingBreakdown,
    });
  } catch (error) {
    console.error("Get business reviews error:", error);
    return res.status(500).json({ message: "Failed to fetch business reviews." });
  }
});

// Business: reply to a customer review
router.post("/:reviewId/reply", auth, async (req, res) => {
  try {
    if (req.user.role !== "business") {
      return res.status(403).json({ message: "Business account required." });
    }

    if (!mongoose.Types.ObjectId.isValid(req.params.reviewId)) {
      return res.status(400).json({ message: "Invalid review ID." });
    }

    const message = String(req.body?.message || "").trim();

    if (!message) {
      return res.status(400).json({ message: "Reply message is required." });
    }

    if (message.length > 2000) {
      return res.status(400).json({
        message: "Reply must be 2000 characters or less.",
      });
    }

    const Business = require("../models/Business");
    const business = await Business.findOne({ owner: req.user.id })
      .select("_id name");

    if (!business) {
      return res.status(404).json({ message: "Business profile not found." });
    }

    const review = await Review.findOne({
      _id: req.params.reviewId,
      business: business._id,
    })
      .populate("customer", "name")
      .populate("listing", "title");

    if (!review) {
      return res.status(404).json({ message: "Review not found." });
    }

    review.businessReply = {
      message,
      repliedAt: new Date(),
    };

    await review.save();

    await Notification.create({
      recipient: review.customer._id,
      type: "message",
      preferenceKey: "messages",
      title: "The business replied to your review",
      body: `${business.name || "The business"} responded to your feedback.`,
      link: "/profile/notification-center",
      metadata: {
        reviewId: review._id,
        listingId: review.listing?._id,
        kind: "review_reply",
      },
    });

    return res.json({
      message: "Reply sent successfully.",
      review,
    });
  } catch (error) {
    console.error("Reply to review error:", error);
    return res.status(500).json({ message: "Failed to send reply." });
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

    // Notify the business owner about the new customer review
    const Business = require("../models/Business");
    const reviewBusiness = await Business.findById(booking.business).select("owner name");

    if (reviewBusiness?.owner) {
      await Notification.create({
        recipient: reviewBusiness.owner,
        type: "update",
        preferenceKey: "updates",
        title: "You received new customer feedback",
        body: `A customer left a ${numericRating}-star review for ${reviewBusiness.name || "your business"}.`,
        link: "/business/feedback",
        metadata: {
          reviewId: review._id,
          listingId: booking.listing,
          kind: "new_review",
        },
      });
    }

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
