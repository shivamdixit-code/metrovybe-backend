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

    if (!["customer", "business"].includes(role)) {
      return res.status(400).json({
        message: "Invalid registration role",
      });
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
      email: email.toLowerCase(),
    });

    if (existingUser) {
      return res.status(409).json({
        message: "An account with this email already exists",
      });
    }

    const hashedPassword = await bcrypt.hash(password, 12);

    const user = await User.create({
      name,
      email,
      phone: phone || "",
      password: hashedPassword,
      role,
      status: role === "business" ? "pending" : "active",
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
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        message: "Email and password are required",
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
    console.error(error);

    return res.status(500).json({
      message: "Login failed",
    });
  }
});

module.exports = router;
