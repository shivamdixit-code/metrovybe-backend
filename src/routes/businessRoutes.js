const express = require("express");

const Business = require("../models/Business");
const BusinessVerification = require("../models/BusinessVerification");
const auth = require("../middleware/auth");

const router = express.Router();

/*
  POST /api/business/verification

  Submit legitimacy documents for admin review.
*/
router.post("/verification", auth, async (req, res) => {
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

    if (business.verificationStatus === "verified") {
      return res.status(400).json({
        message: "Business is already verified",
      });
    }

    const { documents } = req.body;

    if (!Array.isArray(documents) || documents.length === 0) {
      return res.status(400).json({
        message: "At least one verification document is required",
      });
    }

    for (const document of documents) {
      if (!document.documentType || !document.fileUrl) {
        return res.status(400).json({
          message:
            "Each document requires documentType and fileUrl",
        });
      }

      if (typeof document.fileUrl !== "string" ||
          !document.fileUrl.startsWith("https://")) {
        return res.status(400).json({
          message: "Each verification document must contain a valid uploaded file URL",
        });
      }

      if (document.documentNumber !== undefined &&
          typeof document.documentNumber !== "string") {
        return res.status(400).json({
          message: "Document number must be a string",
        });
      }
    }

    let verification = await BusinessVerification.findOne({
      business: business._id,
    });

    if (!verification) {
      verification = await BusinessVerification.create({
        business: business._id,
        submittedBy: req.user.id,
        documents,
        status: "under_review",
      });
    } else {
      verification.documents = documents;
      verification.status = "under_review";
      verification.rejectionReason = "";
      verification.adminNotes = "";
      verification.reviewedBy = null;
      verification.reviewedAt = null;

      await verification.save();
    }

    business.verificationStatus = "under_review";
    business.rejectionReason = "";
    await business.save();

    return res.status(201).json({
      message: "Verification submitted successfully",
      verification,
    });
  } catch (error) {
    console.error(error);

    return res.status(500).json({
      message: "Failed to submit verification",
    });
  }
});

/*
  GET /api/business/verification

  Get current business verification status.
*/

/*
  GET /api/business/me

  Get current business profile.
*/
router.get("/me", auth, async (req, res) => {
  try {
    res.set("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
    res.set("Pragma", "no-cache");
    res.set("Expires", "0");

    if (req.user.role !== "business") {
      return res.status(403).json({
        message: "Business account required",
      });
    }

    console.log("===== BUSINESS /ME ID DEBUG =====");
    console.log("JWT user:", req.user);
    console.log("JWT user.id:", req.user.id);

    const business = await Business.findOne({
      owner: req.user.id,
    }).populate("owner", "name email phone role status");

    console.log("Matched Business:", business ? {
      id: business._id,
      owner: business.owner?._id,
      businessName: business.businessName,
      email: business.email,
      phone: business.phone,
    } : null);

    if (!business) {
      return res.status(404).json({
        message: "Business profile not found",
      });
    }

    const verification = await BusinessVerification.findOne({
      business: business._id,
    });

    return res.json({
      business,
      verification,
    });
  } catch (error) {
    console.error(error);

    return res.status(500).json({
      message: "Failed to fetch business profile",
    });
  }
});


/*
  PATCH /api/business/me
  Update current business profile.
*/
router.patch("/me", auth, async (req, res) => {
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

    const allowedFields = [
      "businessName",
      "description",
      "businessHours",
      "category",
      "address",
      "city",
      "state",
      "pincode",
      "logo",
    ];

    for (const field of allowedFields) {
      if (Object.prototype.hasOwnProperty.call(req.body, field)) {
        business[field] =
          typeof req.body[field] === "string"
            ? req.body[field].trim()
            : req.body[field];
      }
    }

    if (req.body.location && typeof req.body.location === "object") {
      const latitude = Number(req.body.location.latitude);
      const longitude = Number(req.body.location.longitude);

      if (Number.isFinite(latitude) && Number.isFinite(longitude)) {
        business.location = { latitude, longitude };
      }
    }

    if (!business.businessName || !business.category ||
        !business.address || !business.city) {
      return res.status(400).json({
        message: "Business name, category, address and city are required.",
      });
    }

    await business.save();

    const updatedBusiness = await Business.findById(business._id)
      .populate("owner", "name email phone role status");

    return res.json({
      message: "Business details updated successfully.",
      business: updatedBusiness,
    });
  } catch (error) {
    console.error("Update business profile error:", error);
    return res.status(500).json({
      message: "Failed to update business details.",
    });
  }
});


router.get("/verification", auth, async (req, res) => {
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

    const verification = await BusinessVerification.findOne({
      business: business._id,
    });

    return res.json({
      business: {
        id: business._id,
        businessName: business.businessName,
        verificationStatus: business.verificationStatus,
      },
      verification,
    });
  } catch (error) {
    console.error(error);

    return res.status(500).json({
      message: "Failed to fetch verification",
    });
  }
});

module.exports = router;
