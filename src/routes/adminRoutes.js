const express = require("express");

const User = require("../models/User");
const Business = require("../models/Business");
const BusinessVerification = require("../models/BusinessVerification");

const auth = require("../middleware/auth");

const router = express.Router();

/*
  Admin-only middleware
*/
function adminOnly(req, res, next) {
  if (req.user.role !== "admin") {
    return res.status(403).json({
      message: "Admin access required",
    });
  }

  next();
}


/*
  GET /api/admin/dashboard

  Real-time admin dashboard statistics from MongoDB.
*/
router.get(
  "/dashboard",
  auth,
  adminOnly,
  async (req, res) => {
    try {
      const Listing = require("../models/Listing");

      const [
        totalUsers,
        customers,
        businesses,
        pendingBusinesses,
        verifiedBusinesses,
        totalListings,
        publishedListings,
        pendingListings,
        rejectedListings,
      ] = await Promise.all([
        User.countDocuments(),

        User.countDocuments({
          role: "customer",
        }),

        Business.countDocuments(),

        Business.countDocuments({
          verificationStatus: {
            $in: [
              "pending",
              "under_review",
              "more_information_required",
            ],
          },
        }),

        Business.countDocuments({
          verificationStatus: "verified",
        }),

        Listing.countDocuments(),

        Listing.countDocuments({
          status: "published",
        }),

        Listing.countDocuments({
          status: "pending",
        }),

        Listing.countDocuments({
          status: "rejected",
        }),
      ]);

      res.json({
        users: {
          total: totalUsers,
          customers,
          businesses,
        },

        businesses: {
          total: businesses,
          pending: pendingBusinesses,
          verified: verifiedBusinesses,
        },

        listings: {
          total: totalListings,
          published: publishedListings,
          pending: pendingListings,
          rejected: rejectedListings,
        },
      });
    } catch (error) {
      console.error("Admin dashboard error:", error);

      res.status(500).json({
        message: "Failed to load admin dashboard",
      });
    }
  }
);


/*
  GET /api/admin/customers

  Real customer records from MongoDB.
*/
router.get(
  "/customers",
  auth,
  adminOnly,
  async (req, res) => {
    try {
      const customers = await User.find({
        role: "customer",
      })
        .select("name email phone status createdAt")
        .sort({ createdAt: -1 })
        .lean();

      res.json(customers);
    } catch (error) {
      console.error("Admin customers error:", error);

      res.status(500).json({
        message: "Failed to load customers",
      });
    }
  }
);

/*
  GET /api/admin/businesses/pending

  Get businesses waiting for verification.
*/
router.get(
  "/businesses/pending",
  auth,
  adminOnly,
  async (req, res) => {
    try {
      const businesses = await Business.find({
        verificationStatus: {
          $in: ["pending", "under_review", "more_information_required"],
        },
      })
        .populate("owner", "name email phone")
        .sort({ createdAt: -1 });

      res.json(businesses);
    } catch (error) {
      console.error(error);

      res.status(500).json({
        message: "Failed to fetch pending businesses",
      });
    }
  }
);

/*
  GET /api/admin/businesses/:id/verification

  View business + submitted documents.
*/
router.get(
  "/businesses/:id/verification",
  auth,
  adminOnly,
  async (req, res) => {
    try {
      const business = await Business.findById(req.params.id)
        .populate("owner", "name email phone");

      if (!business) {
        return res.status(404).json({
          message: "Business not found",
        });
      }

      const verification = await BusinessVerification.findOne({
        business: business._id,
      });

      res.json({
        business,
        verification,
      });
    } catch (error) {
      console.error(error);

      res.status(500).json({
        message: "Failed to fetch business verification",
      });
    }
  }
);

/*
  POST /api/admin/businesses/:id/approve
*/
router.post(
  "/businesses/:id/approve",
  auth,
  adminOnly,
  async (req, res) => {
    try {
      const business = await Business.findById(req.params.id);

      if (!business) {
        return res.status(404).json({
          message: "Business not found",
        });
      }

      const verification = await BusinessVerification.findOne({
        business: business._id,
      });

      if (!verification) {
        return res.status(404).json({
          message: "Verification submission not found",
        });
      }

      verification.status = "approved";
      verification.reviewedBy = req.user.id;
      verification.reviewedAt = new Date();
      verification.rejectionReason = "";

      verification.documents.forEach((document) => {
        document.status = "approved";
        document.rejectionReason = "";
      });

      await verification.save();

      business.verificationStatus = "verified";
      business.verifiedAt = new Date();
      business.rejectionReason = "";

      await business.save();

      await User.findByIdAndUpdate(business.owner, {
        status: "active",
      });

      res.json({
        message: "Business approved successfully",
        business,
        verification,
      });
    } catch (error) {
      console.error(error);

      res.status(500).json({
        message: "Failed to approve business",
      });
    }
  }
);

/*
  POST /api/admin/businesses/:id/reject
*/
router.post(
  "/businesses/:id/reject",
  auth,
  adminOnly,
  async (req, res) => {
    try {
      const business = await Business.findById(req.params.id);

      if (!business) {
        return res.status(404).json({
          message: "Business not found",
        });
      }

      const verification = await BusinessVerification.findOne({
        business: business._id,
      });

      if (!verification) {
        return res.status(404).json({
          message: "Verification submission not found",
        });
      }

      const { reason } = req.body;

      if (!reason) {
        return res.status(400).json({
          message: "Rejection reason is required",
        });
      }

      verification.status = "rejected";
      verification.rejectionReason = reason;
      verification.reviewedBy = req.user.id;
      verification.reviewedAt = new Date();

      await verification.save();

      business.verificationStatus = "rejected";
      business.rejectionReason = reason;

      await business.save();

      await User.findByIdAndUpdate(business.owner, {
        status: "active",
      });

      res.json({
        message: "Business rejected",
        business,
        verification,
      });
    } catch (error) {
      console.error(error);

      res.status(500).json({
        message: "Failed to reject business",
      });
    }
  }
);

/*
  POST /api/admin/businesses/:id/request-information
*/
router.post(
  "/businesses/:id/request-information",
  auth,
  adminOnly,
  async (req, res) => {
    try {
      const business = await Business.findById(req.params.id);

      if (!business) {
        return res.status(404).json({
          message: "Business not found",
        });
      }

      const verification = await BusinessVerification.findOne({
        business: business._id,
      });

      if (!verification) {
        return res.status(404).json({
          message: "Verification submission not found",
        });
      }

      const { message } = req.body;

      if (!message) {
        return res.status(400).json({
          message: "Additional information request is required",
        });
      }

      verification.status = "more_information_required";
      verification.adminNotes = message;
      verification.reviewedBy = req.user.id;
      verification.reviewedAt = new Date();

      await verification.save();

      business.verificationStatus = "pending";

      await business.save();

      res.json({
        message: "Additional information requested",
        business,
        verification,
      });
    } catch (error) {
      console.error(error);

      res.status(500).json({
        message: "Failed to request additional information",
      });
    }
  }
);


/*
  POST /api/admin/businesses/:id/documents/:documentId/approve

  Admin approves one submitted business document.
*/
router.post(
  "/businesses/:id/documents/:documentId/approve",
  auth,
  adminOnly,
  async (req, res) => {
    try {
      const business = await Business.findById(req.params.id);

      if (!business) {
        return res.status(404).json({
          message: "Business not found",
        });
      }

      const verification = await BusinessVerification.findOne({
        business: business._id,
      });

      if (!verification) {
        return res.status(404).json({
          message: "Verification submission not found",
        });
      }

      const document = verification.documents.id(req.params.documentId);

      if (!document) {
        return res.status(404).json({
          message: "Document not found",
        });
      }

      document.status = "approved";
      document.rejectionReason = "";

      await verification.save();

      res.json({
        message: "Document approved successfully",
        document,
        verification,
      });
    } catch (error) {
      console.error("Admin approve document error:", error);

      if (error.name === "CastError") {
        return res.status(400).json({
          message: "Invalid business or document ID",
        });
      }

      res.status(500).json({
        message: "Failed to approve document",
      });
    }
  }
);


/*
  POST /api/admin/businesses/:id/documents/:documentId/reject

  Admin rejects one submitted business document.
*/
router.post(
  "/businesses/:id/documents/:documentId/reject",
  auth,
  adminOnly,
  async (req, res) => {
    try {
      const business = await Business.findById(req.params.id);

      if (!business) {
        return res.status(404).json({
          message: "Business not found",
        });
      }

      const verification = await BusinessVerification.findOne({
        business: business._id,
      });

      if (!verification) {
        return res.status(404).json({
          message: "Verification submission not found",
        });
      }

      const document = verification.documents.id(req.params.documentId);

      if (!document) {
        return res.status(404).json({
          message: "Document not found",
        });
      }

      const { reason } = req.body;

      if (!reason || typeof reason !== "string" || !reason.trim()) {
        return res.status(400).json({
          message: "Document rejection reason is required",
        });
      }

      document.status = "rejected";
      document.rejectionReason = reason.trim();

      await verification.save();

      res.json({
        message: "Document rejected successfully",
        document,
        verification,
      });
    } catch (error) {
      console.error("Admin reject document error:", error);

      if (error.name === "CastError") {
        return res.status(400).json({
          message: "Invalid business or document ID",
        });
      }

      res.status(500).json({
        message: "Failed to reject document",
      });
    }
  }
);


/*
  GET /api/admin/listings/pending

  Admin gets listings waiting for moderation.
*/
router.get(
  "/listings/pending",
  auth,
  adminOnly,
  async (req, res) => {
    try {
      const Listing = require("../models/Listing");

      const listings = await Listing.find({
        status: "pending",
      })
        .populate(
          "business",
          "businessName category city state verificationStatus logo phone email"
        )
        .sort({ createdAt: -1 })
        .lean();

      res.json({
        listings,
        total: listings.length,
      });
    } catch (error) {
      console.error("Admin pending listings error:", error);

      res.status(500).json({
        message: "Failed to fetch pending listings",
      });
    }
  }
);

/*
  POST /api/admin/listings/:id/approve

  Admin publishes a pending listing.
*/
router.post(
  "/listings/:id/approve",
  auth,
  adminOnly,
  async (req, res) => {
    try {
      const Listing = require("../models/Listing");

      const listing = await Listing.findOne({
        _id: req.params.id,
        status: "pending",
      }).populate(
        "business",
        "businessName category city state verificationStatus logo"
      );

      if (!listing) {
        return res.status(404).json({
          message: "Pending listing not found",
        });
      }

      if (!listing.business) {
        return res.status(400).json({
          message: "Cannot publish a listing without a business",
        });
      }

      if (listing.business.verificationStatus !== "verified") {
        return res.status(400).json({
          message: "Business verification is required before publishing this listing",
          verificationStatus: listing.business.verificationStatus,
        });
      }

      listing.status = "published";
      listing.rejectionReason = "";

      await listing.save();

      res.json({
        message: "Listing approved and published successfully",
        listing,
      });
    } catch (error) {
      console.error("Admin approve listing error:", error);

      if (error.name === "CastError") {
        return res.status(400).json({
          message: "Invalid listing ID",
        });
      }

      res.status(500).json({
        message: "Failed to approve listing",
      });
    }
  }
);

/*
  POST /api/admin/listings/:id/reject

  Admin rejects a pending listing.
*/
router.post(
  "/listings/:id/reject",
  auth,
  adminOnly,
  async (req, res) => {
    try {
      const Listing = require("../models/Listing");

      const { reason } = req.body;

      if (!reason || typeof reason !== "string" || !reason.trim()) {
        return res.status(400).json({
          message: "Rejection reason is required",
        });
      }

      const listing = await Listing.findOne({
        _id: req.params.id,
        status: "pending",
      });

      if (!listing) {
        return res.status(404).json({
          message: "Pending listing not found",
        });
      }

      listing.status = "rejected";
      listing.rejectionReason = reason.trim();

      await listing.save();

      res.json({
        message: "Listing rejected successfully",
        listing,
      });
    } catch (error) {
      console.error("Admin reject listing error:", error);

      if (error.name === "CastError") {
        return res.status(400).json({
          message: "Invalid listing ID",
        });
      }

      res.status(500).json({
        message: "Failed to reject listing",
      });
    }
  }
);

module.exports = router;
