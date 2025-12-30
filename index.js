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

// Gemini
const { GoogleGenerativeAI } = require("@google/generative-ai");
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-3-flash-preview" });

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

// Importing report model
const Report = require("./models/Report.js");

// Express session
var session = require("express-session");
const MongoStore = require("connect-mongo");
const passport = require("passport");

const store = MongoStore.create({
  mongoUrl: process.env.DATABASE_LINK,
  secret: process.env.SECRET,
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

// Dummy route
app.get("/test", async (req, res) => {
  try {
    console.log("--> Sending request to Gemini...");
    const result = await model.generateContent(`Hello how are you`);
    const response = await result.response;
    let text = response.text();
    res.send(text);
  } catch (e) {
    console.error("Gemini Error:", e);
    req.flash("error", "AI Analysis failed. Please try again.");
    res.redirect("/home");
  }
});

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

    console.log("--> Sending request to Gemini...");

    const prCompetition = `Act as a senior Geospatial Engineer. 
Generate a lightweight Overpass query to find direct competitors for: "${req.body.prompt.business}".

### CONSTRAINTS
- ONLY use node and way. NEVER use relations.
- Limit the query to the 2 most relevant OSM keys (e.g., amenity, shop, or craft).
- Use [out:json][timeout:30]; and "out tags center;".
- Return ONLY the raw string. No prose, no markdown.

### STRUCTURE
[out:json][timeout:30];
(
  node(around:1000,${req.body.prompt.lat},${req.body.prompt.lon})[key~"val1|val2",i];
  way(around:1000,${req.body.prompt.lat},${req.body.prompt.lon})[key~"val1|val2",i];
);
out tags center;
Now again Act as a senior Geospatial Engineer and Business Intelligence Analyst.

Your task is to generate a **lightweight Overpass query** to find **complementary businesses** that increase foot traffic for a given business type.

### RULES
- Pick 2–4 highly relevant complementary categories.
- Include only nodes (skip ways/relations for speed).
- Use minimal regex per tag, max 3–4 keywords per line.
- Keep radius 1000m max.
- Output JSON only, with \`out center;\`.
- Do not include markdown, explanations, or variable names.

### USER INPUT
- Latitude: ${req.body.prompt.lat}
- Longitude: ${req.body.prompt.lon}
- Radius: 1000
- Business Type: "${req.body.prompt.business}"
Now again Act as a senior Geospatial Engineer and Urban Planner.

Your task is to generate an **ultra-lightweight** Overpass query to check accessibility.

### LOGIC RULES
1. **NODE-ONLY SEARCH**: To prevent server timeouts and massive JSON files, search ONLY for nodes (points). 
2. **INFRASTRUCTURE**: Target bus stops, railway stations, subway entrances, and taxi points.
3. **NO ROADS**: Do NOT query highway ways (lines). This is the cause of the data bloat.
4. **DATA EFFICIENCY**: Use [out:json][timeout:30]; and "out tags center;".

### STRICT OUTPUT FORMAT
- Return ONLY the raw Overpass query string.
- No markdown, no prose.
- Start with [out:json][timeout:30];

### STRUCTURE
[out:json][timeout:30];
(
  node(around:1000,${req.body.prompt.lat},${req.body.prompt.lon})[highway~"bus_stop|platform",i];
  node(around:1000,${req.body.prompt.lat},${req.body.prompt.lon})[railway~"station|subway_entrance",i];
  node(around:1000,${req.body.prompt.lat},${req.body.prompt.lon})[amenity~"bus_station|taxi_point",i];
);
out tags center;
Now you will have 3 queries for overpass
    const fetchOverpass = async (query) => {
      const url =
        "https://overpass-api.de/api/interpreter?data=" +
        encodeURIComponent(query);
      const result = await fetch(url);
      if (!result.ok) throw new Error("Overpass rate limit hit");
      return result.json();
    };
    const data = await fetchOverpass(overpassQuery);
    await new Promise((resolve) => setTimeout(resolve, 1000)); // 0.6s gap
    const dataC = await fetchOverpass(overpassQueryC);
    await new Promise((resolve) => setTimeout(resolve, 1000)); // 0.6s gap
    const dataA = await fetchOverpass(overpassQueryA);

    now by performing above described operations 
    get data , dataA and data C accurately 
    and return them as json file
    dont return anything else
      just {data, dataA , dataC} accurate and complete
    dont add query in your answer
    and syntax to return
    {
      data,
      dataC,
      dataA
    }
      no additional symbols around this
      maintain consistency in your answer 
      double check before giving result
`;
    let result = await model.generateContent(prCompetition);
    let response = await result.response;
    const jsObject = JSON.parse(
      response
        .text()
        .trim()
        .replace(/```json|```/g, "")
        .trim()
    );
    const competitorCount = jsObject.data.elements.length;
    const complementCount = jsObject.dataC.elements.length;
    const accessibilityCount = jsObject.dataA.elements.length;

    const prScoring = `Act as a Senior Business Intelligence Analyst and Urban Planner.

    ### DATA INPUT
    - Business: ${req.body.prompt.business}
    - Location: Lat ${req.body.prompt.lat}, Lon ${req.body.prompt.lon}
    - Competitor Count: ${competitorCount}
    - Complementary Count: ${complementCount}
    - Accessibility Count: ${accessibilityCount}

    ### YOUR TASK
    1. **Estimate Population Density:** Based on the coordinates provided, estimate the residential/commercial density on a scale of 0-100 (e.g., dense urban center = 90+, suburban = 40, rural = 10).
    2. **Set Dynamic Caps:** Based on the density, define the ideal "Max" caps for this specific area.
    3. **Calculate Scores:** Use the formulas below with your dynamic caps.

    ### FORMULAS
    - **Competition Score:** Max(0, 100 - (competitorCount / DynamicMaxComp) * 100)
    - **Complementary Score:** Min(100, (complementCount / DynamicMaxComp) * 100)
    - **Accessibility Score:** Min(100, (accessibilityCount / DynamicMaxAcc) * 100)

    ### STRICT OUTPUT FORMAT (JSON ONLY)
    {
        "competition": number,
        "complementary": number,
        "accessibility": number,
        "density": number,
      "verdict": "string ( summary of viability , discuss the given business and above 4 parameters on that business)"
    }
    // `;
    result = await model.generateContent(prScoring);
    response = await result.response.text().trim();
    let data = JSON.parse(response);
    console.log(data);
    const report = new Report({ data });
    await report.save();
    res.render("result", { title: "Result", link: "result", data });
  })
);

// History page
app.get("/history", isLoggedIn, wrapAsync(async (req, res) => {
  const history = await Report.find();
  res.render("history", { title: "History", link: "history", history });
}));

// Error handling middleware
app.use((err, req, res, next) => {
  let { status: st = 400, message = "This page not found" } = err;
  res
    .status(st)
    .render("error", { title: "Error", link: "error", code: st, message });
});
