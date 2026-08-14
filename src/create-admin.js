require("dotenv").config();

const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");

const User = require("./models/User");

async function createAdmin() {
  try {
    await mongoose.connect(process.env.MONGO_URI);

    const email = "admin@metrovybe.com";
    const password = "ChangeThisAdminPassword123!";

    const existing = await User.findOne({ email });

    if (existing) {
      console.log("Admin already exists.");
      console.log("ID:", existing._id.toString());
      process.exit(0);
    }

    const hashedPassword = await bcrypt.hash(password, 12);

    const admin = await User.create({
      name: "MetroVybe Admin",
      email,
      password: hashedPassword,
      role: "admin",
      status: "active",
      emailVerified: true,
      phoneVerified: true,
    });

    console.log("Admin created successfully.");
    console.log("Email:", email);
    console.log("Password:", password);
    console.log("ID:", admin._id.toString());

    await mongoose.disconnect();
  } catch (error) {
    console.error("Failed to create admin:", error);
    process.exit(1);
  }
}

createAdmin();
