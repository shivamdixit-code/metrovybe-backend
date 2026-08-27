const express = require("express");
const auth = require("../middleware/auth");
const User = require("../models/User");
const Notification = require("../models/Notification");

const router = express.Router();

const DEFAULT_PREFERENCES = {
  updates: true,
  saved: true,
  messages: true,
  security: true,
};

/*
  GET /api/notifications/preferences
*/
router.get("/preferences", auth, async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select("notificationPreferences");

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    res.json({
      preferences: {
        ...DEFAULT_PREFERENCES,
        ...(user.notificationPreferences?.toObject?.() || user.notificationPreferences || {}),
      },
    });
  } catch (error) {
    console.error("Get notification preferences failed:", error);
    res.status(500).json({ message: "Failed to fetch notification preferences" });
  }
});

/*
  PATCH /api/notifications/preferences
*/
router.patch("/preferences", auth, async (req, res) => {
  try {
    const allowedKeys = Object.keys(DEFAULT_PREFERENCES);
    const incoming = req.body?.preferences || req.body || {};
    const updates = {};

    for (const key of allowedKeys) {
      if (typeof incoming[key] === "boolean") {
        updates[`notificationPreferences.${key}`] = incoming[key];
      }
    }

    if (!Object.keys(updates).length) {
      return res.status(400).json({
        message: "Provide at least one valid notification preference",
      });
    }

    const user = await User.findByIdAndUpdate(
      req.user.id,
      { $set: updates },
      { new: true }
    ).select("notificationPreferences");

    res.json({
      message: "Notification preferences updated",
      preferences: {
        ...DEFAULT_PREFERENCES,
        ...(user.notificationPreferences?.toObject?.() || user.notificationPreferences || {}),
      },
    });
  } catch (error) {
    console.error("Update notification preferences failed:", error);
    res.status(500).json({ message: "Failed to update notification preferences" });
  }
});

/*
  GET /api/notifications
*/
router.get("/", auth, async (req, res) => {
  try {
    const notifications = await Notification.find({
      recipient: req.user.id,
    })
      .sort({ createdAt: -1 })
      .limit(100);

    const Booking = require("../models/Booking");
    const Business = require("../models/Business");

    const bookingNotifications = notifications.filter(
      (item) =>
        item.type === "booking" &&
        !item.metadata?.bookingId
    );

    if (bookingNotifications.length) {
      const businesses = await Business.find({
        owner: req.user.id,
      }).select("_id");

      const businessIds = businesses.map((business) => business._id);

      const relevantBookings = await Booking.find({
        $or: [
          { customer: req.user.id },
          ...(businessIds.length ? [{ business: { $in: businessIds } }] : []),
        ],
      })
        .sort({ createdAt: -1 })
        .select("_id customer business listing listingTitle status createdAt updatedAt");

      for (const notification of bookingNotifications) {
        const title = String(notification.title || "").toLowerCase();
        const body = String(notification.body || "").toLowerCase();
        const searchText = `${title} ${body}`;

        let expectedStatus = null;

        if (searchText.includes("new booking request")) {
          expectedStatus = "pending";
        } else if (searchText.includes("booking confirmed")) {
          expectedStatus = "confirmed";
        } else if (searchText.includes("booking request declined")) {
          expectedStatus = "rejected";
        } else if (searchText.includes("booking cancelled")) {
          expectedStatus = "cancelled";
        } else if (searchText.includes("marked as completed")) {
          expectedStatus = "completed";
        }

        const notificationTime = new Date(notification.createdAt).getTime();

        const candidates = relevantBookings
          .filter((booking) => {
            if (
              expectedStatus &&
              booking.status !== expectedStatus
            ) {
              return false;
            }

            const listingTitle = String(
              booking.listingTitle || ""
            ).trim().toLowerCase();

            if (!listingTitle) {
              return false;
            }

            return searchText.includes(listingTitle);
          })
          .map((booking) => ({
            booking,
            distance: Math.abs(
              new Date(
                booking.createdAt || booking.updatedAt
              ).getTime() - notificationTime
            ),
          }))
          .sort((a, b) => a.distance - b.distance);

        if (candidates.length) {
          const matchedBooking = candidates[0].booking;

          notification.metadata = {
            ...(notification.metadata?.toObject?.() ||
              notification.metadata ||
              {}),
            bookingId: String(matchedBooking._id),
          };

          notification.link =
            `/bookings?bookingId=${encodeURIComponent(
              String(matchedBooking._id)
            )}`;
        }
      }
    }

    const unreadCount = notifications.filter((item) => !item.read).length;

    res.json({
      notifications,
      unreadCount,
    });
  } catch (error) {
    console.error("Get notifications failed:", error);
    res.status(500).json({ message: "Failed to fetch notifications" });
  }
});

/*
  PATCH /api/notifications/:id/read
*/
router.patch("/:id/read", auth, async (req, res) => {
  try {
    const notification = await Notification.findOneAndUpdate(
      {
        _id: req.params.id,
        recipient: req.user.id,
      },
      { $set: { read: true } },
      { new: true }
    );

    if (!notification) {
      return res.status(404).json({ message: "Notification not found" });
    }

    res.json({
      message: "Notification marked as read",
      notification,
    });
  } catch (error) {
    console.error("Mark notification read failed:", error);
    res.status(500).json({ message: "Failed to update notification" });
  }
});

/*
  PATCH /api/notifications/read-all
*/
router.patch("/read-all", auth, async (req, res) => {
  try {
    await Notification.updateMany(
      {
        recipient: req.user.id,
        read: false,
      },
      {
        $set: { read: true },
      }
    );

    res.json({ message: "All notifications marked as read" });
  } catch (error) {
    console.error("Mark all notifications read failed:", error);
    res.status(500).json({ message: "Failed to update notifications" });
  }
});

module.exports = router;
