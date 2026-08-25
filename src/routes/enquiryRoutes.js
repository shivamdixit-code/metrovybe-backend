const express = require("express");

const Enquiry = require("../models/Enquiry");
const Listing = require("../models/Listing");
const Business = require("../models/Business");
const User = require("../models/User");
const Notification = require("../models/Notification");
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

    // Notify the business owner about the new enquiry
    await Notification.create({
      recipient: business.owner,
      type: "message",
      preferenceKey: "messages",
      title: "New enquiry received",
      body: `${customer.name || "A customer"} sent an enquiry about ${listing.title}.`,
      link: "/business/enquiries",
      read: false,
      metadata: {
        enquiryId: String(enquiry._id),
        listingId: String(listing._id),
      },
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

    // Fetch enquiries for listings that currently belong to this business.
    // This also supports older enquiries created before a listing's business
    // relationship was updated.
    const listingIds = await Listing.find({
      business: business._id,
    }).distinct("_id");

    const enquiries = await Enquiry.find({
      $or: [
        { business: business._id },
        { listing: { $in: listingIds } },
      ],
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

    // Support enquiries linked through either the business ID or its listings
    const listings = await Listing.find({ business: business._id }).select("_id");
    const listingIds = listings.map((item) => item._id);

    const enquiry = await Enquiry.findOne({
      _id: req.params.id,
      $or: [
        { business: business._id },
        { listing: { $in: listingIds } },
      ],
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
