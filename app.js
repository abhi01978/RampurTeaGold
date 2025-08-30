const express = require("express");
const mongoose = require("mongoose");
const session = require("express-session");
const path = require("path");

const User = require("./models/User");
const Product = require("./models/Product");
const Cart = require("./models/Cart");

const app = express();

// MongoDB Connection
mongoose.connect("mongodb+srv://ac9303720_db_user:dQJIpmwKweCThEpT@cluster0.bterq20.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0")
  .then(() => console.log("MongoDB Connected"))
  .catch(err => console.log("DB Error:", err));

app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));

// Session Setup
app.use(session({
  secret: "secret123",
  resave: false,
  saveUninitialized: true
}));

// Middleware to make isLoggedIn and cartItemCount available in all EJS templates
app.use(async (req, res, next) => {
  res.locals.isLoggedIn = !!req.session.userId;
  res.locals.cartItemCount = 0;  // Default value, in case user isn't logged in or cart is empty

  if (req.session.userId) {
    try {
      const cart = await Cart.findOne({ userId: req.session.userId });
      if (cart && cart.items) {
        res.locals.cartItemCount = cart.items.reduce((acc, item) => acc + item.quantity, 0);
      }
    } catch (err) {
      console.error(err);
    }
  }

  next();
});

// Auth middleware
function isLoggedIn(req, res, next) {
  if (req.session && req.session.userId) {
    return next();
  } else {
    return res.redirect("/login");
  }
}

// ===== Routes =====

// Login Page
app.get("/login", (req, res) => res.render("login"));
app.get("/about", (req, res) => res.render("about"));
app.get("/gallery", (req, res) => res.render("gallery"));
app.get("/contact", (req, res) => res.render("contact"));
app.get("/product", (req, res) => res.render("product"));

app.get("/checkout", async (req, res) => {
  try {
    const cart = await Cart.findOne({ userId: req.session.userId }).populate("items.productId");
    res.render("checkout", { cart });
  } catch (err) {
    console.error(err);
    res.render("checkout", { cart: { items: [] } });
  }
});

app.post("/login", async (req, res) => {
  const { username, password } = req.body;
  const user = await User.findOne({ username, password });
  if (user) {
    req.session.userId = user._id;
    res.redirect("/products");
  } else {
    res.send("Invalid credentials");
  }
});

// Register Page
app.get("/register", (req, res) => res.render("register"));

app.post("/register", async (req, res) => {
  const { username, password } = req.body;
  const user = new User({ username, password });
  await user.save();
  res.redirect("/login");
});

// Home Page -> Show products (login not required)
app.get("/", async (req, res) => {
  let products = await Product.find();
  if (products.length === 0) {
    await Product.insertMany([
      { name: "Rampur Gold Tea,1 Kg", price: 380, img: "/img/tea-1kg.jpeg", description: "Premium strong tea", reviews: 120 },
      { name: "Rampur Gold Tea,500 g", price: 190, img: "/img/teab-500.jpeg", description: "Refreshing flavor", reviews: 85 },
      { name: "Rampur Gold Tea,250 g", price: 100, img: "/img/tea-all.png", description: "Everyday pack", reviews: 40 },
      { name: "Rampur Gold Tea,100 g", price: 40, img: "/img/tea-all.png", description: "Trial pack", reviews: 20 },
      { name: "Rampur Gold Tea,50 g", price: 20, img: "/img/tea-all.png", description: "Pocket friendly", reviews: 12 },
      { name: "Rampur Gold Tea,10 g", price: 10, img: "/img/tea-all.png", description: "Sample size", reviews: 5 }
    ]);
    products = await Product.find();
  }
  res.render("products", { products });
});

// Products Page
app.get("/products", async (req, res) => {
  const products = await Product.find();
  res.render("products", { products });
});

// Add to cart -> only logged in users allowed
app.post("/add-to-cart/:productId", async (req, res) => {
  if (!req.session.userId) {
    return res.status(401).json({ success: false, message: "Please login first" });
  }

  const userId = req.session.userId;
  const productId = req.params.productId;

  let cart = await Cart.findOne({ userId });
  if (!cart) cart = new Cart({ userId, items: [] });

  const existingItem = cart.items.find(i => i.productId.equals(productId));
  if (existingItem) existingItem.quantity++;
  else cart.items.push({ productId, quantity: 1 });

  await cart.save();
  res.json({ success: true });
});

// Cart Page -> login required
app.get("/cart", isLoggedIn, async (req, res) => {
  try {
    const cart = await Cart.findOne({ userId: req.session.userId }).populate("items.productId");

    let totalPrice = 0;
    if (cart && cart.items && cart.items.length > 0) {
      totalPrice = cart.items.reduce((total, item) => total + item.productId.price * item.quantity, 0);
    }

    res.render("cart", { cart, totalPrice });
  } catch (err) {
    console.error(err);
    res.status(500).send("Something went wrong");
  }
});

// Increase quantity
app.post("/cart/increase/:productId", isLoggedIn, async (req, res) => {
  try {
    const cart = await Cart.findOne({ userId: req.session.userId });
    if (!cart) return res.redirect("/cart");

    const item = cart.items.find(i => i.productId.toString() === req.params.productId);
    if (item) {
      item.quantity += 1;
    }
    await cart.save();
    res.redirect("/cart");
  } catch (err) {
    console.error(err);
    res.status(500).send("Error increasing quantity");
  }
});

// Decrease quantity
app.post("/cart/decrease/:productId", isLoggedIn, async (req, res) => {
  try {
    const cart = await Cart.findOne({ userId: req.session.userId });
    if (!cart) return res.redirect("/cart");

    const item = cart.items.find(i => i.productId.toString() === req.params.productId);
    if (item && item.quantity > 1) {
      item.quantity -= 1;
    } else if (item && item.quantity === 1) {
      cart.items = cart.items.filter(i => i.productId.toString() !== req.params.productId);
    }
    await cart.save();
    res.redirect("/cart");
  } catch (err) {
    console.error(err);
    res.status(500).send("Error decreasing quantity");
  }
});

// Remove item
app.post("/cart/remove/:productId", isLoggedIn, async (req, res) => {
  try {
    const cart = await Cart.findOne({ userId: req.session.userId });
    if (!cart) return res.redirect("/cart");

    cart.items = cart.items.filter(i => i.productId.toString() !== req.params.productId);
    await cart.save();
    res.redirect("/cart");
  } catch (err) {
    console.error(err);
    res.status(500).send("Error removing item");
  }
});

// Logout
app.get("/logout", (req, res) => {
  req.session.destroy(err => {
    if (err) {
      return res.status(500).send("Logout failed!");
    }
    res.clearCookie("connect.sid", { path: "/" }); // session cookie clear karo
    res.redirect("/login");
  });
});

// Start Server
app.listen(3000, () => console.log("Server running on http://localhost:3000"));


