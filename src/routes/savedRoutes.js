const express = require("express");
const mongoose = require("mongoose");

const auth = require("../middleware/auth");
const SavedListing = require("../models/SavedListing");
const Listing = require("../models/Listing");

const router = express.Router();

/*
  GET /api/saved

  Customer gets all of their saved listings.
*/
router.get("/", auth, async (req, res) => {
  try {
    if (req.user.role !== "customer") {
      return res.status(403).json({
        message: "Customer account required",
      });
    }

    const saved = await SavedListing.find({
      customer: req.user.id,
    })
      .populate({
        path: "listing",
        match: { status: "published" },
        populate: {
          path: "business",
          select:
            "businessName category city verificationStatus logo",
        },
      })
      .sort({ createdAt: -1 });

    // Remove saves whose listing is no longer published.
    const validSaved = saved.filter((item) => item.listing);

    res.json({
      saved: validSaved,
      total: validSaved.length,
    });
  } catch (error) {
    console.error("Get saved listings failed:", error);

    res.status(500).json({
      message: "Failed to fetch saved listings",
    });
  }
});

/*
  GET /api/saved/:listingId

  Check whether the logged-in customer saved a listing.
*/
router.get("/:listingId", auth, async (req, res) => {
  try {
    if (req.user.role !== "customer") {
      return res.status(403).json({
        message: "Customer account required",
      });
    }

    if (!mongoose.Types.ObjectId.isValid(req.params.listingId)) {
      return res.status(400).json({
        message: "Invalid listing ID",
      });
    }

    const saved = await SavedListing.exists({
      customer: req.user.id,
      listing: req.params.listingId,
    });

    res.json({
      saved: Boolean(saved),
    });
  } catch (error) {
    console.error("Check saved listing failed:", error);

    res.status(500).json({
      message: "Failed to check saved listing",
    });
  }
});

/*
  POST /api/saved/:listingId

  Save a published listing.
*/
router.post("/:listingId", auth, async (req, res) => {
  try {
    if (req.user.role !== "customer") {
      return res.status(403).json({
        message: "Customer account required",
      });
    }

    if (!mongoose.Types.ObjectId.isValid(req.params.listingId)) {
      return res.status(400).json({
        message: "Invalid listing ID",
      });
    }

    const listing = await Listing.findOne({
      _id: req.params.listingId,
      status: "published",
    });

    if (!listing) {
      return res.status(404).json({
        message: "Published listing not found",
      });
    }

    const existing = await SavedListing.findOne({
      customer: req.user.id,
      listing: listing._id,
    });

    if (existing) {
      return res.json({
        message: "Listing already saved",
        saved: true,
      });
    }

    const saved = await SavedListing.create({
      customer: req.user.id,
      listing: listing._id,
    });

    res.status(201).json({
      message: "Listing saved successfully",
      saved: true,
      savedListing: saved,
    });
  } catch (error) {
    console.error("Save listing failed:", error);

    // Handle MongoDB duplicate-key race condition safely.
    if (error.code === 11000) {
      return res.json({
        message: "Listing already saved",
        saved: true,
      });
    }

    res.status(500).json({
      message: "Failed to save listing",
    });
  }
});

/*
  DELETE /api/saved/:listingId

  Remove a listing from saved.
*/
router.delete("/:listingId", auth, async (req, res) => {
  try {
    if (req.user.role !== "customer") {
      return res.status(403).json({
        message: "Customer account required",
      });
    }

    if (!mongoose.Types.ObjectId.isValid(req.params.listingId)) {
      return res.status(400).json({
        message: "Invalid listing ID",
      });
    }

    const deleted = await SavedListing.findOneAndDelete({
      customer: req.user.id,
      listing: req.params.listingId,
    });

    if (!deleted) {
      return res.status(404).json({
        message: "Listing was not saved",
        saved: false,
      });
    }

    res.json({
      message: "Listing removed from saved",
      saved: false,
    });
  } catch (error) {
    console.error("Remove saved listing failed:", error);

    res.status(500).json({
      message: "Failed to remove saved listing",
    });
  }
});

module.exports = router;
