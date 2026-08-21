const express = require("express");

const Enquiry = require("../models/Enquiry");
const Listing = require("../models/Listing");
const Business = require("../models/Business");
const User = require("../models/User");
const auth = require("../middleware/auth");

const router = express.Router();

/*
  POST /api/enquiries
  Customer creates an enquiry for a published listing.
*/
router.post("/", auth, async (req, res) => {
  try {
    if (req.user.role !== "customer") {
      return res.status(403).json({
        message: "Customer account required",
      });
    }

    const { listingId, message } = req.body;

    if (!listingId || typeof listingId !== "string") {
      return res.status(400).json({
        message: "Listing is required",
      });
    }

    if (!message || typeof message !== "string" || !message.trim()) {
      return res.status(400).json({
        message: "Enquiry message is required",
      });
    }

    const listing = await Listing.findOne({
      _id: listingId,
      status: "published",
    });

    if (!listing) {
      return res.status(404).json({
        message: "Published listing not found",
      });
    }

    if (!listing.business) {
      return res.status(400).json({
        message: "This listing is not connected to a business",
      });
    }

    const business = await Business.findById(listing.business);

    if (!business) {
      return res.status(404).json({
        message: "Business not found",
      });
    }

    const customer = await User.findById(req.user.id).select(
      "name email phone"
    );

    if (!customer) {
      return res.status(404).json({
        message: "Customer not found",
      });
    }

    const enquiry = await Enquiry.create({
      listing: listing._id,
      business: business._id,
      customer: customer._id,
      message: message.trim(),
      customerName: customer.name || "",
      customerEmail: customer.email || "",
      customerPhone: customer.phone || "",
      status: "new",
    });

    const populatedEnquiry = await Enquiry.findById(enquiry._id)
      .populate("listing", "title category location image")
      .populate("business", "businessName category city")
      .populate("customer", "name email phone");

    return res.status(201).json({
      message: "Enquiry sent successfully",
      enquiry: populatedEnquiry,
    });
  } catch (error) {
    console.error("Create enquiry failed:", error);

    if (error.name === "CastError") {
      return res.status(400).json({
        message: "Invalid listing ID",
      });
    }

    return res.status(500).json({
      message: "Failed to create enquiry",
    });
  }
});

/*
  GET /api/enquiries/business
  Business gets only its own enquiries.
*/
router.get("/business", auth, async (req, res) => {
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

    const enquiries = await Enquiry.find({
      business: business._id,
    })
      .populate("listing", "title category location image")
      .populate("customer", "name email phone")
      .sort({ createdAt: -1 });

    return res.json({
      enquiries,
      total: enquiries.length,
      unread: enquiries.filter((item) => item.status === "new").length,
    });
  } catch (error) {
    console.error("Business enquiries failed:", error);

    return res.status(500).json({
      message: "Failed to fetch enquiries",
    });
  }
});

/*
  GET /api/enquiries/customer
  Customer gets only their own enquiries.
*/
router.get("/customer", auth, async (req, res) => {
  try {
    if (req.user.role !== "customer") {
      return res.status(403).json({
        message: "Customer account required",
      });
    }

    const enquiries = await Enquiry.find({
      customer: req.user.id,
    })
      .populate("listing", "title category location image")
      .populate("business", "businessName category city")
      .sort({ createdAt: -1 });

    return res.json({
      enquiries,
      total: enquiries.length,
    });
  } catch (error) {
    console.error("Customer enquiries failed:", error);

    return res.status(500).json({
      message: "Failed to fetch enquiries",
    });
  }
});

/*
  PATCH /api/enquiries/:id/read
  Business marks its own enquiry as read.
*/
router.patch("/:id/read", auth, async (req, res) => {
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

    const enquiry = await Enquiry.findOne({
      _id: req.params.id,
      business: business._id,
    });

    if (!enquiry) {
      return res.status(404).json({
        message: "Enquiry not found",
      });
    }

    if (enquiry.status === "new") {
      enquiry.status = "read";
      await enquiry.save();
    }

    return res.json({
      message: "Enquiry marked as read",
      enquiry,
    });
  } catch (error) {
    console.error("Mark enquiry read failed:", error);

    if (error.name === "CastError") {
      return res.status(400).json({
        message: "Invalid enquiry ID",
      });
    }

    return res.status(500).json({
      message: "Failed to update enquiry",
    });
  }
});

module.exports = router;
