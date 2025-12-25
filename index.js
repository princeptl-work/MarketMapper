// Env setup
require("dotenv").config();

// Importing express
const express = require("express");
const app = express();
const mongoose = require("mongoose");

// Setting views path
const path = require("path");
app.set("views", path.join(__dirname, "views"));

// Setting ejs
app.set("view engine", "ejs");

// Importing utils
const expressError = require("./utils/errorHandler.js");
const isLoggedIn = require("./utils/isLoggedIn.js");
const wrapAsync = require("./utils/wrapAsync.js");
const saveUrl = require("./utils/saveUrl.js");

// Importing validation schema
const promptSchema = require("./validation/prompt.js");

// Data parsing from req body and forms
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// Static files
app.use(express.static(path.join(__dirname, "public")));

// EJS -mate
const ejsMate = require("ejs-mate");
const { title } = require("process");
app.engine("ejs", ejsMate);

// Express session
var session = require("express-session");
const MongoStore = require("connect-mongo");
const passport = require("passport");

const store = MongoStore.create({
  mongoUrl: process.env.DATABASE_LINK,
  secret: process.env.SECRET ,
  touchAfter: 24 * 3600,
});

app.use(
  session({
    store,
    secret: process.env.SECRET,
    resave: false,
    saveUninitialized: true,
    cookie: {
      expires: Date.now() + 7 * 24 * 60 * 60 * 1000,
      maxAge: 7 * 24 * 60 * 60 * 1000,
      httpOnly: true,
    },
  })
);

// Setting up passport
app.use(passport.initialize());
app.use(passport.session());

// Setting up flash
var flash = require("connect-flash");
app.use(flash());

// Middleware
app.use((req, res, next) => {
  res.locals.success = req.flash("success");
  res.locals.error = req.flash("error");
  res.locals.auth = req.isAuthenticated();
  next();
});

// Including passport js
require("./config/passport.js");

// Connecting to mongoose

mongoose
  .connect(process.env.DATABASE_LINK)
  .then(() => console.log("Connected!"));

// Listen
app.listen(8080);

// Home page
app.get("/", (req, res) => {
  res.render("home", { title: "Home", link: "home" });
});

// Login page
app.get("/login", (req, res) => {
  res.render("login", { link: "login", title: "Continue with Google" });
});

// Auth page
app.get(
  "/auth/google",
  passport.authenticate("google", { scope: ["profile", "email"] })
);

// auth/google/callback
app.get(
  "/auth/google/callback",
  saveUrl,
  passport.authenticate("google", { failureRedirect: "/", failureFlash: true }),
  (req, res) => {
    req.flash("success", "Welcome to MarketMapper !!");
    const redirectUrl = res.locals.url || "/";
    delete req.session.redirectUrl;
    res.redirect(redirectUrl);
  }
);

// Logout page
app.get("/logout", isLoggedIn, (req, res, next) => {
  req.logout((err) => {
    if (err) return next(err);
    res.redirect("/");
  });
});

// Result Page
app.post(
  "/result",
  isLoggedIn,
  wrapAsync(async (req, res) => {
    let { error } = promptSchema.validate(req.body);
    if (error) {
      let errMsg = error.details.map((el) => el.message).join(",");
      throw new expressError(404, errMsg);
    }
    res.send("Result will be shown here ...");
  })
);

// History page
app.get("/history", isLoggedIn, (req, res) => {
  res.send("Under production ..");
});

// Error handling middleware
app.use((err, req, res, next) => {
  let { status: st = 400, message = "This page not found" } = err;
  res
    .status(st)
    .render("error", { title: "Error", link: "error", code: st, message });
});
