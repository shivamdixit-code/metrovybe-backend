const express = require("express");
const mongoose = require("mongoose");

const auth = require("../middleware/auth");
const Booking = require("../models/Booking");
const Listing = require("../models/Listing");
const Business = require("../models/Business");
const User = require("../models/User");
const Notification = require("../models/Notification");

const router = express.Router();

async function createNotification({
  recipient,
  preferenceKey = "messages",
  type = "message",
  title,
  body,
  link = "",
  metadata = {},
  essential = false,
}) {
  try {
    const user = await User.findById(recipient).select("notificationPreferences");

    if (!user) return null;

    const preferences = {
      updates: true,
      saved: true,
      messages: true,
      security: true,
      ...(user.notificationPreferences?.toObject?.() ||
        user.notificationPreferences ||
        {}),
    };

    if (!essential && preferences[preferenceKey] === false) {
      return null;
    }

    return await Notification.create({
      recipient,
      type,
      preferenceKey,
      title,
      body,
      link,
      metadata,
      essential,
    });
  } catch (error) {
    console.error("Create booking notification failed:", error.message);
    return null;
  }
}

/*
  POST /api/bookings

  Customer creates a booking request for a published listing.
*/
router.post("/", auth, async (req, res) => {
  try {
    if (req.user.role !== "customer") {
      return res.status(403).json({
        message: "Customer account required",
      });
    }

    const { listingId, bookingDate, message } = req.body;

    if (!listingId) {
      return res.status(400).json({
        message: "Listing ID is required",
      });
    }

    if (!mongoose.Types.ObjectId.isValid(listingId)) {
      return res.status(400).json({
        message: "Invalid listing ID",
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

    if (business.status !== "active") {
      return res.status(400).json({
        message: "This business is currently unavailable",
      });
    }

    let parsedBookingDate = null;

    if (bookingDate) {
      parsedBookingDate = new Date(bookingDate);

      if (Number.isNaN(parsedBookingDate.getTime())) {
        return res.status(400).json({
          message: "Invalid booking date",
        });
      }
    }

    const booking = await Booking.create({
      customer: req.user.id,
      business: business._id,
      listing: listing._id,
      listingTitle: listing.title,
      bookingDate: parsedBookingDate,
      message:
        typeof message === "string"
          ? message.trim().slice(0, 2000)
          : "",
      status: "pending",
    });

    const populatedBooking = await Booking.findById(booking._id)
      .populate("listing", "title category location price image images")
      .populate(
        "business",
        "businessName category city verificationStatus logo phone email"
      )
      .populate("customer", "name email phone");

    await createNotification({
      recipient: business.owner,
      preferenceKey: "messages",
      type: "booking",
      title: "New booking request",
      body: `${req.user.name || "A customer"} sent a booking request for ${listing.title}.`,
      link: "/business/bookings",
      metadata: {
        bookingId: String(booking._id),
        listingId: String(listing._id),
      },
    });

    res.status(201).json({
      message: "Booking request sent successfully",
      booking: populatedBooking,
    });
  } catch (error) {
    console.error("Create booking failed:", error);

    res.status(500).json({
      message: "Failed to create booking",
    });
  }
});

/*
  GET /api/bookings/customer

  Customer gets their own bookings.
*/
router.get("/customer", auth, async (req, res) => {
  try {
    if (req.user.role !== "customer") {
      return res.status(403).json({
        message: "Customer account required",
      });
    }

    const bookings = await Booking.find({
      customer: req.user.id,
    })
      .populate(
        "listing",
        "title category location price image images"
      )
      .populate(
        "business",
        "businessName category city verificationStatus logo phone email"
      )
      .sort({ createdAt: -1 });

    res.json({
      bookings,
      total: bookings.length,
    });
  } catch (error) {
    console.error("Get customer bookings failed:", error);

    res.status(500).json({
      message: "Failed to fetch bookings",
    });
  }
});

/*
  GET /api/bookings/business

  Business gets bookings for its own listings.
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

    const bookings = await Booking.find({
      business: business._id,
    })
      .populate(
        "listing",
        "title category location price image images"
      )
      .populate("customer", "name email phone")
      .sort({ createdAt: -1 });

    res.json({
      bookings,
      total: bookings.length,
      pending: bookings.filter(
        (item) => item.status === "pending"
      ).length,
    });
  } catch (error) {
    console.error("Get business bookings failed:", error);

    res.status(500).json({
      message: "Failed to fetch business bookings",
    });
  }
});

/*
  PATCH /api/bookings/:id/status

  Business updates the status of its own booking.
*/
router.patch("/:id/status", auth, async (req, res) => {
  try {
    if (req.user.role !== "business") {
      return res.status(403).json({
        message: "Business account required",
      });
    }

    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({
        message: "Invalid booking ID",
      });
    }

    const { status, businessNote } = req.body;

    const allowedStatuses = [
      "confirmed",
      "rejected",
      "completed",
    ];

    if (!allowedStatuses.includes(status)) {
      return res.status(400).json({
        message:
          "Invalid status. Use confirmed, rejected or completed.",
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

    const booking = await Booking.findOne({
      _id: req.params.id,
      business: business._id,
    });

    if (!booking) {
      return res.status(404).json({
        message: "Booking not found",
      });
    }

    booking.status = status;

    if (typeof businessNote === "string") {
      booking.businessNote = businessNote.trim().slice(0, 2000);
    }

    await booking.save();

    await createNotification({
      recipient: booking.customer,
      preferenceKey: "messages",
      type: "booking",
      title:
        status === "confirmed"
          ? "Booking confirmed"
          : status === "rejected"
          ? "Booking request declined"
          : "Booking completed",
      body:
        status === "confirmed"
          ? `Your booking for ${booking.listingTitle} has been confirmed.`
          : status === "rejected"
          ? `Your booking request for ${booking.listingTitle} was declined.`
          : `Your booking for ${booking.listingTitle} has been marked as completed.`,
      link: "/profile/bookings",
      metadata: {
        bookingId: String(booking._id),
        listingId: String(booking.listing),
        status,
      },
    });

    const populatedBooking = await Booking.findById(booking._id)
      .populate(
        "listing",
        "title category location price image images"
      )
      .populate("customer", "name email phone");

    res.json({
      message: `Booking ${status} successfully`,
      booking: populatedBooking,
    });
  } catch (error) {
    console.error("Update booking status failed:", error);

    res.status(500).json({
      message: "Failed to update booking",
    });
  }
});

/*
  PATCH /api/bookings/:id/cancel

  Customer cancels their own pending/confirmed booking.
*/
router.patch("/:id/cancel", auth, async (req, res) => {
  try {
    if (req.user.role !== "customer") {
      return res.status(403).json({
        message: "Customer account required",
      });
    }

    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({
        message: "Invalid booking ID",
      });
    }

    const booking = await Booking.findOne({
      _id: req.params.id,
      customer: req.user.id,
    });

    if (!booking) {
      return res.status(404).json({
        message: "Booking not found",
      });
    }

    if (
      booking.status !== "pending" &&
      booking.status !== "confirmed"
    ) {
      return res.status(400).json({
        message: "This booking cannot be cancelled",
      });
    }

    booking.status = "cancelled";
    await booking.save();

    const business = await Business.findById(booking.business);

    if (business?.owner) {
      await createNotification({
        recipient: business.owner,
        preferenceKey: "messages",
        type: "booking",
        title: "Booking cancelled",
        body: `A customer cancelled their booking for ${booking.listingTitle}.`,
        link: "/business/bookings",
        metadata: {
          bookingId: String(booking._id),
          listingId: String(booking.listing),
        },
      });
    }

    res.json({
      message: "Booking cancelled successfully",
      booking,
    });
  } catch (error) {
    console.error("Cancel booking failed:", error);

    res.status(500).json({
      message: "Failed to cancel booking",
    });
  }
});

module.exports = router;
