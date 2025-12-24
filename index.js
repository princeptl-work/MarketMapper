// Importing express
const express = require("express");
const app = express();
// Setting views path
const path = require("path");
app.set("views", path.join(__dirname, "views"));
// Setting ejs
app.set("view engine", "ejs");
// Setting custom error handler
const expressError = require("./errorHandler.js");
// Data parsing from req body and forms
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
// Static files
app.use(express.static(path.join(__dirname, "public")));

app.listen(3000);
// Home page 
app.get("/", (req, res) => {
  res.render("home");
});
// Error handling middleware
app.use((err, req, res) => {
  let { status = 400, message = "This page not found" } = err;
  res.status(status).render("error", { code: status, message });
});
