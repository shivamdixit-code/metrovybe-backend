require("dotenv").config();

const mongoose = require("mongoose");
const Listing = require("./models/Listing");

const listings = [
  {
    title: "Premium Student PG",
    category: "stay",
    location: "Sector 62, Noida",
    price: "₹8,500",
    rating: 4.9,
    reviews: 128,
    image: "/images/listing-pg.jpg",
    tags: ["WiFi", "Food", "AC"],
    featured: true,
    status: "published",
  },
  {
    title: "Homemade Tiffin",
    category: "eat",
    location: "Sector 61, Noida",
    price: "₹2,999",
    rating: 4.8,
    reviews: 96,
    image: "/images/listing-tiffin.jpg",
    tags: ["Veg", "Delivery", "Healthy"],
    featured: true,
    status: "published",
  },
];

async function addListings() {
  try {
    await mongoose.connect(process.env.MONGO_URI);

    console.log("MongoDB connected.");

    for (const listing of listings) {
      const exists = await Listing.findOne({
        title: listing.title,
      });

      if (exists) {
        console.log(`Already exists: ${listing.title}`);
      } else {
        await Listing.create(listing);
        console.log(`Added: ${listing.title}`);
      }
    }

    await mongoose.disconnect();
    console.log("Done.");
  } catch (error) {
    console.error("Failed:", error);
    process.exit(1);
  }
}

addListings();
