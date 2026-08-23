const express = require("express");

const Listing = require("../models/Listing");
const User = require("../models/User");
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

    let searchTerms = [];

    if (search?.trim()) {
      searchTerms = search
        .trim()
        .toLowerCase()
        .split(/\\s+/)
        .map((term) => term.replace(/[^a-z0-9₹.-]/gi, ""))
        .filter((term) => term.length >= 2);

      const searchRegexes = searchTerms.map(
        (term) => new RegExp(term.replace(/[.*+?^${}()|[\\]\\]/g, "\\\\$&"), "i")
      );

      const matchingBusinesses = await Business.find({
        $or: searchRegexes.map((regex) => ({
          businessName: { $regex: regex },
        })),
      })
        .select("_id")
        .lean();

      filter.$or = [
        ...searchRegexes.flatMap((regex) => [
          { title: { $regex: regex } },
          { description: { $regex: regex } },
          { category: { $regex: regex } },
          { tags: { $regex: regex } },
          { location: { $regex: regex } },
          { price: { $regex: regex } },
          { "serviceArea.areas": { $regex: regex } },
          { serviceDetails: { $regex: regex } },
          { availability: { $regex: regex } },
        ]),
        {
          business: {
            $in: matchingBusinesses.map((business) => business._id),
          },
        },
      ];
    }

    const listings = await Listing.find(filter)
      .populate(
        "business",
        "businessName category city verificationStatus logo"
      )
      .lean();

    if (searchTerms.length > 0) {
      const normalize = (value) =>
        String(value ?? "")
          .toLowerCase()
          .replace(/[^a-z0-9₹.\s-]/g, " ");

      const getSearchText = (listing) => {
        const serviceDetails =
          listing.serviceDetails &&
          typeof listing.serviceDetails === "object"
            ? JSON.stringify(listing.serviceDetails)
            : "";

        const availability =
          listing.availability &&
          typeof listing.availability === "object"
            ? JSON.stringify(listing.availability)
            : "";

        const serviceAreas = Array.isArray(listing.serviceArea?.areas)
          ? listing.serviceArea.areas.join(" ")
          : "";

        const tags = Array.isArray(listing.tags)
          ? listing.tags.join(" ")
          : "";

        const businessName =
          listing.business && typeof listing.business === "object"
            ? listing.business.businessName || ""
            : "";

        return {
          title: normalize(listing.title),
          businessName: normalize(businessName),
          category: normalize(listing.category),
          tags: normalize(tags),
          location: normalize(listing.location),
          description: normalize(listing.description),
          price: normalize(listing.price),
          serviceArea: normalize(serviceAreas),
          serviceDetails: normalize(serviceDetails),
          availability: normalize(availability),
        };
      };

      listings.forEach((listing) => {
        const text = getSearchText(listing);
        let score = 0;

        for (const term of searchTerms) {
          if (text.title.includes(term)) score += 100;
          if (text.businessName.includes(term)) score += 90;
          if (text.category.includes(term)) score += 80;
          if (text.tags.includes(term)) score += 70;
          if (text.location.includes(term)) score += 60;
          if (text.serviceArea.includes(term)) score += 50;
          if (text.description.includes(term)) score += 40;
          if (text.price.includes(term)) score += 25;
          if (text.serviceDetails.includes(term)) score += 30;
          if (text.availability.includes(term)) score += 20;
        }

        const fullQuery = normalize(search);
        const combined = Object.values(text).join(" ");

        if (text.title.includes(fullQuery)) score += 120;
        if (text.businessName.includes(fullQuery)) score += 110;
        if (text.location.includes(fullQuery)) score += 90;
        if (combined.includes(fullQuery)) score += 40;

        listing.__searchScore = score;
      });

      listings.sort(
        (a, b) =>
          (b.__searchScore || 0) - (a.__searchScore || 0)
      );

      listings.forEach((listing) => {
        delete listing.__searchScore;
      });
    }

    const token = (req.headers.authorization || "").startsWith("Bearer ")
      ? req.headers.authorization.split(" ")[1]
      : null;

    let customerLocation = null;

    if (token) {
      try {
        const jwt = require("jsonwebtoken");
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        if (decoded?.role === "customer") {
          const user = await User.findById(decoded.id).select("location").lean();
          const latitude = Number(user?.location?.latitude);
          const longitude = Number(user?.location?.longitude);

          if (
            Number.isFinite(latitude) &&
            Number.isFinite(longitude) &&
            latitude >= -90 && latitude <= 90 &&
            longitude >= -180 && longitude <= 180
          ) {
            customerLocation = { latitude, longitude };
          }
        }
      } catch {
        customerLocation = null;
      }
    }

    if (customerLocation) {
      const distanceKm = (lat1, lon1, lat2, lon2) => {
        const toRad = (value) => (value * Math.PI) / 180;
        const dLat = toRad(lat2 - lat1);
        const dLon = toRad(lon2 - lon1);
        const a =
          Math.sin(dLat / 2) ** 2 +
          Math.cos(toRad(lat1)) *
          Math.cos(toRad(lat2)) *
          Math.sin(dLon / 2) ** 2;
        return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
      };

      listings.sort((a, b) => {
        const aLat = Number(a.latitude);
        const aLng = Number(a.longitude);
        const bLat = Number(b.latitude);
        const bLng = Number(b.longitude);

        const aValid = Number.isFinite(aLat) && Number.isFinite(aLng);
        const bValid = Number.isFinite(bLat) && Number.isFinite(bLng);

        if (!aValid && !bValid) return 0;
        if (!aValid) return 1;
        if (!bValid) return -1;

        return distanceKm(
          customerLocation.latitude,
          customerLocation.longitude,
          aLat,
          aLng
        ) - distanceKm(
          customerLocation.latitude,
          customerLocation.longitude,
          bLat,
          bLng
        );
      });
    } else {
      listings.sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      );
    }
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

    const allowedFields = [
      "title",
      "category",
      "description",
      "location",
      "latitude",
      "longitude",
      "serviceArea",
      "serviceDetails",
      "availability",
      "price",
      "image",
      "images",
      "tags",
    ];

    const listingData = {
      business: business._id,

      // Business listings must be reviewed by MetroVybe.
      status: "pending",

      // Business cannot self-feature a listing.
      featured: false,
    };

    allowedFields.forEach((field) => {
      if (req.body[field] !== undefined) {
        listingData[field] = req.body[field];
      }
    });

    const listing = await Listing.create(listingData);

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
      "latitude",
      "longitude",
      "serviceArea",
      "serviceDetails",
      "availability",
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
