const express = require("express");
const Listing = require("../models/Listing");

const router = express.Router();

/*
  GET /api/listings
  Get all published listings
*/
router.get("/", async (req, res) => {
  try {
    const {
      search,
      category,
      location,
      featured,
    } = req.query;

    const filter = {
      status: "published",
    };

    if (category) {
      filter.category = category;
    }

    if (location) {
      filter.location = {
        $regex: location,
        $options: "i",
      };
    }

    if (featured === "true") {
      filter.featured = true;
    }

    if (search) {
      filter.$or = [
        { title: { $regex: search, $options: "i" } },
        { description: { $regex: search, $options: "i" } },
        { category: { $regex: search, $options: "i" } },
        { tags: { $regex: search, $options: "i" } },
      ];
    }

    const listings = await Listing.find(filter).sort({
      createdAt: -1,
    });

    res.json(listings);
  } catch (error) {
    console.error(error);
    res.status(500).json({
      message: "Failed to fetch listings",
    });
  }
});

/*
  GET /api/listings/:id
  Get one listing
*/
router.get("/:id", async (req, res) => {
  try {
    const listing = await Listing.findById(req.params.id);

    if (!listing) {
      return res.status(404).json({
        message: "Listing not found",
      });
    }

    res.json(listing);
  } catch (error) {
    res.status(500).json({
      message: "Failed to fetch listing",
    });
  }
});

/*
  POST /api/listings
  Create listing
*/
router.post("/", async (req, res) => {
  try {
    const listing = await Listing.create(req.body);

    res.status(201).json(listing);
  } catch (error) {
    console.error(error);

    res.status(400).json({
      message: "Failed to create listing",
      error: error.message,
    });
  }
});

module.exports = router;
