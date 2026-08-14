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

module.exports = router;
