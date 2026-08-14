const express = require("express");

const Listing = require("../models/Listing");
const Business = require("../models/Business");
const auth = require("../middleware/auth");

const router = express.Router();

/*
  GET /api/listings

  Public endpoint.
  Customers can browse published listings.
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

    const listings = await Listing.find(filter)
      .populate(
        "business",
        "businessName category city verificationStatus logo"
      )
      .sort({
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

  Public endpoint.
*/
router.get("/business/mine", auth, async (req, res) => {
  try {
    if (req.user.role !== "business") {
      return res.status(403).json({
        message: "Business account required",
      });
    }

    const business = await Business.findOne({
      owner: req.user.id,
    });

    if (!business) {
      return res.status(404).json({
        message: "Business profile not found",
      });
    }

    const listings = await Listing.find({
      business: business._id,
    }).sort({
      createdAt: -1,
    });

    res.json(listings);
  } catch (error) {
    console.error(error);

    res.status(500).json({
      message: "Failed to fetch business listings",
    });
  }
});

router.get("/:id", async (req, res) => {
  try {
    const listing = await Listing.findOne({
      _id: req.params.id,
      status: "published",
    }).populate(
      "business",
      "businessName category city verificationStatus logo phone email"
    );

    if (!listing) {
      return res.status(404).json({
        message: "Listing not found",
      });
    }

    res.json(listing);
  } catch (error) {
    console.error(error);

    res.status(500).json({
      message: "Failed to fetch listing",
    });
  }
});

/*
  GET /api/listings/business/mine

  Get listings belonging to the logged-in business.
*/


/*
  POST /api/listings

  Verified businesses can submit listings.
*/
router.post("/", auth, async (req, res) => {
  try {
    if (req.user.role !== "business") {
      return res.status(403).json({
        message: "Only business accounts can create listings",
      });
    }

    const business = await Business.findOne({
      owner: req.user.id,
    });

    if (!business) {
      return res.status(404).json({
        message: "Business profile not found",
      });
    }

    if (business.verificationStatus !== "verified") {
      return res.status(403).json({
        message: "Business verification is required before creating listings",
        verificationStatus: business.verificationStatus,
      });
    }

    const listing = await Listing.create({
      ...req.body,
      business: business._id,

      // Business listings must be reviewed by MetroVybe.
      status: "pending",

      // Business cannot self-feature a listing.
      featured: false,
    });

    res.status(201).json({
      message: "Listing submitted for review",
      listing,
    });
  } catch (error) {
    console.error(error);

    res.status(400).json({
      message: "Failed to create listing",
      error: error.message,
    });
  }
});

/*
  PUT /api/listings/:id

  Business can edit only its own listing.
*/
router.put("/:id", auth, async (req, res) => {
  try {
    if (req.user.role !== "business") {
      return res.status(403).json({
        message: "Business account required",
      });
    }

    const business = await Business.findOne({
      owner: req.user.id,
    });

    if (!business) {
      return res.status(404).json({
        message: "Business profile not found",
      });
    }

    const listing = await Listing.findOne({
      _id: req.params.id,
      business: business._id,
    });

    if (!listing) {
      return res.status(404).json({
        message: "Listing not found or does not belong to your business",
      });
    }

    const allowedFields = [
      "title",
      "category",
      "description",
      "location",
      "price",
      "image",
      "images",
      "tags",
    ];

    allowedFields.forEach((field) => {
      if (req.body[field] !== undefined) {
        listing[field] = req.body[field];
      }
    });

    // Editing sends the listing back for review.
    listing.status = "pending";

    await listing.save();

    res.json({
      message: "Listing updated and submitted for review",
      listing,
    });
  } catch (error) {
    console.error(error);

    res.status(400).json({
      message: "Failed to update listing",
      error: error.message,
    });
  }
});

module.exports = router;
