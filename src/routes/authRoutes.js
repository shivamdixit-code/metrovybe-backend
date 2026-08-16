const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

const User = require("../models/User");
const Business = require("../models/Business");

const router = express.Router();

function createToken(user) {
  return jwt.sign(
    {
      id: user._id,
      role: user.role,
    },
    process.env.JWT_SECRET,
    {
      expiresIn: "7d",
    }
  );
}

/*
  POST /api/auth/register

  Customer:
  {
    name,
    email,
    phone,
    password,
    role: "customer"
  }

  Business:
  {
    name,
    email,
    phone,
    password,
    role: "business",
    businessName,
    category,
    address,
    city,
    state,
    pincode
  }
*/
router.post("/register", async (req, res) => {
  try {
    const {
      name,
      email,
      phone,
      gender,
      dateOfBirth,
      latitude,
      longitude,
      locationLabel,
      password,
      role = "customer",
      businessName,
      category,
      address,
      city,
      state,
      pincode,
    } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({
        message: "Name, email and password are required",
      });
    }

    const normalizedEmail = String(email).trim().toLowerCase();

    console.log("===== REGISTER EMAIL DEBUG =====");
    console.log("RAW EMAIL:", JSON.stringify(email));
    console.log("NORMALIZED EMAIL:", JSON.stringify(normalizedEmail));
    console.log("EMAIL LENGTH:", normalizedEmail.length);
    console.log("EMAIL CHARS:", [...normalizedEmail].map((c) => `${c}=${c.charCodeAt(0)}`));

    const emailPattern =
      /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

    if (!emailPattern.test(normalizedEmail)) {
      return res.status(400).json({
        message: "Please enter a valid email address.",
      });
    }

    if (!["customer", "business"].includes(role)) {
      return res.status(400).json({
        message: "Invalid registration role",
      });
    }

    if (role === "customer") {
      const cleanPhone = String(phone || "").replace(/[\s-]/g, "");

      const validPhone =
        /^\+91[6-9]\d{9}$/.test(cleanPhone) ||
        /^\+44 7\d{9}$/.test(cleanPhone) ||
        /^\+1[2-9]\d{9}$/.test(cleanPhone) ||
        /^\+61 4\d{8}$/.test(cleanPhone) ||
        /^\+64 2\d{8}$/.test(cleanPhone) ||
        /^\+65[89]\d{7}$/.test(cleanPhone) ||
        /^\+60 1\d{8}$/.test(cleanPhone) ||
        /^\+9715\d{8}$/.test(cleanPhone);

      if (!validPhone) {
        return res.status(400).json({
          message: "Please enter a valid international mobile number.",
        });
      }

      const allowedGenders = [
        "male",
        "female",
        "non-binary",
        "prefer-not-to-say",
      ];

      if (!allowedGenders.includes(gender)) {
        return res.status(400).json({
          message: "Gender is required.",
        });
      }

      if (!dateOfBirth) {
        return res.status(400).json({
          message: "Date of birth is required.",
        });
      }

      const dob = new Date(dateOfBirth);

      if (Number.isNaN(dob.getTime())) {
        return res.status(400).json({
          message: "Please enter a valid date of birth.",
        });
      }

      const today = new Date();

      if (dob >= today) {
        return res.status(400).json({
          message: "Date of birth must be in the past.",
        });
      }

      if (
        latitude === undefined ||
        longitude === undefined ||
        latitude === null ||
        longitude === null
      ) {
        return res.status(400).json({
          message: "Precise location is required.",
        });
      }

      const lat = Number(latitude);
      const lng = Number(longitude);

      if (
        !Number.isFinite(lat) ||
        !Number.isFinite(lng) ||
        lat < -90 ||
        lat > 90 ||
        lng < -180 ||
        lng > 180
      ) {
        return res.status(400).json({
          message: "Please provide a valid precise location.",
        });
      }
    }

    if (role === "business") {
      if (!businessName || !category || !address || !city) {
        return res.status(400).json({
          message:
            "Business name, category, address and city are required",
        });
      }
    }

    const existingUser = await User.findOne({
      email: normalizedEmail,
    });

    if (existingUser) {
      return res.status(409).json({
        message: "An account with this email already exists",
      });
    }

    const hashedPassword = await bcrypt.hash(password, 12);

    const user = await User.create({
      name,
      email: normalizedEmail,
      phone: phone || "",
      password: hashedPassword,
      role,
      status: role === "business" ? "pending" : "active",
      ...(role === "customer"
        ? {
            gender,
            dateOfBirth: new Date(dateOfBirth),
            location: {
              latitude: Number(latitude),
              longitude: Number(longitude),
              label: String(locationLabel || "").trim(),
            },
          }
        : {}),
    });

    let business = null;

    if (role === "business") {
      business = await Business.create({
        owner: user._id,
        businessName,
        category,
        phone: phone || "",
        email,
        address,
        city,
        state: state || "",
        pincode: pincode || "",
        verificationStatus: "pending",
      });
    }

    const token = createToken(user);

    return res.status(201).json({
      message:
        role === "business"
          ? "Business account created. Verification is required before listings can go live."
          : "Customer account created successfully.",
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        role: user.role,
        status: user.status,
        ...(user.role === "customer"
          ? {
              gender: user.gender,
              dateOfBirth: user.dateOfBirth,
              location: user.location,
            }
          : {}),
      },
      business,
    });
  } catch (error) {
    console.error(error);

    return res.status(500).json({
      message: "Registration failed",
      error: error.message,
    });
  }
});

/*
  POST /api/auth/login
*/
router.post("/login", async (req, res) => {
  try {
    const { email, password, selectedRole } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        message: "Email and password are required",
      });
    }

    if (!selectedRole || !["customer", "business"].includes(selectedRole)) {
      return res.status(400).json({
        message: "Please select Customer or Business",
      });
    }

    const user = await User.findOne({
      email: email.toLowerCase(),
    });

    if (!user) {
      return res.status(401).json({
        message: "Invalid email or password",
      });
    }

    const passwordCorrect = await bcrypt.compare(
      password,
      user.password
    );

    if (!passwordCorrect) {
      return res.status(401).json({
        message: "Invalid email or password",
      });
    }

    if (user.status === "suspended") {
      return res.status(403).json({
        message: "Your account has been suspended",
      });
    }

    if (user.role !== selectedRole) {
      return res.status(403).json({
        message:
          selectedRole === "business"
            ? "This account is not a Business account. Please select Customer."
            : "This account is not a Customer account. Please select Business.",
      });
    }

    const token = createToken(user);

    let business = null;

    if (user.role === "business") {
      business = await Business.findOne({
        owner: user._id,
      });
    }

    return res.json({
      message: "Login successful",
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        role: user.role,
        status: user.status,
      },
      business,
    });
  } catch (error) {
    console.error("LOGIN ERROR:", error);
    console.error("LOGIN ERROR MESSAGE:", error.message);
    console.error("LOGIN ERROR STACK:", error.stack);

    return res.status(500).json({
      message: "Login failed",
    });
  }
});

// ==================== PHONE OTP ====================

const crypto = require("crypto");

function createPhoneOtp() {
  return String(crypto.randomInt(100000, 1000000));
}

function hashPhoneOtp(otp) {
  return crypto
    .createHash("sha256")
    .update(otp)
    .digest("hex");
}


// ==================== SIGNUP PHONE OTP ====================
// Temporary in-memory OTP store for new customer signup.
// The User document is created only after signup is completed.

const signupPhoneOtps = new Map();

router.post("/send-signup-phone-otp", async (req, res) => {
  try {
    const phone = String(req.body.phone || "").trim();

    if (!phone) {
      return res.status(400).json({
        message: "Phone number is required.",
      });
    }

    const existingUser = await User.findOne({ phone });

    if (existingUser) {
      return res.status(409).json({
        message: "An account already exists with this phone number. Please log in instead.",
      });
    }

    const existing = signupPhoneOtps.get(phone);
    const now = Date.now();

    if (
      existing &&
      now - existing.lastSentAt < 60000
    ) {
      return res.status(429).json({
        message: "Please wait 60 seconds before requesting another OTP.",
      });
    }

    const otp = createPhoneOtp();

    signupPhoneOtps.set(phone, {
      otpHash: hashPhoneOtp(otp),
      expiresAt: now + 5 * 60 * 1000,
      attempts: 0,
      lastSentAt: now,
    });

    console.log("================================");
    console.log("METROVYBE SIGNUP PHONE OTP");
    console.log(`Phone: ${phone}`);
    console.log(`OTP: ${otp}`);
    console.log("Expires: 5 minutes");
    console.log("================================");

    return res.json({
      message: "Signup OTP generated successfully.",
      verified: false,
      otp: otp,
    });
  } catch (error) {
    console.error("SEND SIGNUP PHONE OTP ERROR:", error);

    return res.status(500).json({
      message: "Unable to send signup phone OTP.",
    });
  }
});

router.post("/verify-signup-phone-otp", async (req, res) => {
  try {
    const phone = String(req.body.phone || "").trim();
    const otp = String(req.body.otp || "").trim();

    if (!phone || !otp) {
      return res.status(400).json({
        message: "Phone number and OTP are required.",
      });
    }

    const existingUser = await User.findOne({ phone });

    if (existingUser) {
      return res.status(409).json({
        message: "An account already exists with this phone number.",
      });
    }

    const record = signupPhoneOtps.get(phone);

    if (!record) {
      return res.status(400).json({
        message: "Please request a new OTP.",
      });
    }

    if (Date.now() > record.expiresAt) {
      signupPhoneOtps.delete(phone);

      return res.status(400).json({
        message: "OTP has expired. Please request a new OTP.",
      });
    }

    if (record.attempts >= 5) {
      signupPhoneOtps.delete(phone);

      return res.status(429).json({
        message: "Too many incorrect attempts. Please request a new OTP.",
      });
    }

    if (hashPhoneOtp(otp) !== record.otpHash) {
      record.attempts += 1;
      signupPhoneOtps.set(phone, record);

      return res.status(400).json({
        message: "Invalid OTP.",
      });
    }

    signupPhoneOtps.delete(phone);

    return res.json({
      message: "Phone number verified successfully.",
      verified: true,
    });
  } catch (error) {
    console.error("VERIFY SIGNUP PHONE OTP ERROR:", error);

    return res.status(500).json({
      message: "Unable to verify signup phone OTP.",
    });
  }
});

router.post("/send-phone-otp", async (req, res) => {
  try {
    const phone = String(req.body.phone || "").trim();

    if (!phone) {
      return res.status(400).json({
        message: "Phone number is required.",
      });
    }

    const user = await User.findOne({ phone });

    if (!user) {
      return res.status(404).json({
        message: "No account found with this phone number.",
      });
    }

    if (user.phoneVerified) {
      return res.json({
        message: "Phone number is already verified.",
        verified: true,
      });
    }

    const now = Date.now();

    if (
      user.phoneOtpLastSentAt &&
      now - user.phoneOtpLastSentAt.getTime() < 60000
    ) {
      return res.status(429).json({
        message: "Please wait 60 seconds before requesting another OTP.",
      });
    }

    const otp = createPhoneOtp();

    user.phoneOtpHash = hashPhoneOtp(otp);
    user.phoneOtpExpiresAt = new Date(now + 5 * 60 * 1000);
    user.phoneOtpAttempts = 0;
    user.phoneOtpLastSentAt = new Date(now);

    await user.save();

    console.log("================================");
    console.log("METROVYBE PHONE OTP");
    console.log(`Phone: ${phone}`);
    console.log(`OTP: ${otp}`);
    console.log("Expires: 5 minutes");
    console.log("================================");

    return res.json({
      message: "OTP generated successfully.",
      verified: false,
    });
  } catch (error) {
    console.error("SEND PHONE OTP ERROR:", error);

    return res.status(500).json({
      message: "Unable to send phone OTP.",
    });
  }
});

router.post("/verify-phone-otp", async (req, res) => {
  try {
    const phone = String(req.body.phone || "").trim();
    const otp = String(req.body.otp || "").trim();

    if (!phone || !otp) {
      return res.status(400).json({
        message: "Phone number and OTP are required.",
      });
    }

    const user = await User.findOne({ phone });

    if (!user) {
      return res.status(404).json({
        message: "No account found with this phone number.",
      });
    }

    if (user.phoneVerified) {
      return res.json({
        message: "Phone number is already verified.",
        verified: true,
      });
    }

    if (!user.phoneOtpHash || !user.phoneOtpExpiresAt) {
      return res.status(400).json({
        message: "Please request a new OTP.",
      });
    }

    if (user.phoneOtpExpiresAt.getTime() < Date.now()) {
      return res.status(400).json({
        message: "OTP has expired. Please request a new OTP.",
      });
    }

    if (user.phoneOtpAttempts >= 5) {
      return res.status(429).json({
        message: "Too many incorrect attempts. Please request a new OTP.",
      });
    }

    if (hashPhoneOtp(otp) !== user.phoneOtpHash) {
      user.phoneOtpAttempts += 1;
      await user.save();

      return res.status(400).json({
        message: "Invalid OTP.",
      });
    }

    user.phoneVerified = true;
    user.phoneOtpHash = "";
    user.phoneOtpExpiresAt = undefined;
    user.phoneOtpAttempts = 0;
    user.phoneOtpLastSentAt = undefined;

    await user.save();

    return res.json({
      message: "Phone number verified successfully.",
      verified: true,
    });
  } catch (error) {
    console.error("VERIFY PHONE OTP ERROR:", error);

    return res.status(500).json({
      message: "Unable to verify phone number.",
    });
  }
});

module.exports = router;
