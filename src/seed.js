require("dotenv").config();

const mongoose = require("mongoose");
const Listing = require("./models/Listing");

const listings = [
  {
    title: "Fully Furnished Room",
    category: "stay",
    location: "Sector 137, Noida",
    price: "₹11,000",
    rating: 4.7,
    reviews: 82,
    image: "/images/listing-room.jpg",
    tags: ["Furnished", "WiFi", "AC"],
    featured: true,
    status: "published",
  },
  {
    title: "Student Laundry Service",
    category: "live",
    location: "Sector 62, Noida",
    price: "₹499",
    rating: 4.8,
    reviews: 64,
    image: "/images/listing-laundry.jpg",
    tags: ["Pickup", "Delivery"],
    featured: true,
    status: "published",
  },
  {
    title: "Local Movers",
    category: "move",
    location: "Noida",
    price: "₹1,499",
    rating: 4.7,
    reviews: 51,
    image: "/images/listing-movers.jpg",
    tags: ["Moving", "Packing"],
    featured: true,
    status: "published",
  },
];

async function seed() {
  try {
    await mongoose.connect(process.env.MONGO_URI);

    console.log("MongoDB connected.");

    await Listing.deleteMany({});

    await Listing.insertMany(listings);

    console.log(`${listings.length} listings inserted successfully.`);

    await mongoose.disconnect();
    process.exit(0);
  } catch (error) {
    console.error("Seed failed:", error);
    process.exit(1);
  }
}

seed();
