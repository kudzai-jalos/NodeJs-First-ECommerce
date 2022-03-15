require("dotenv").config();
// import express module
const fs = require("fs");
const path = require("path");
const https = require("https");

const express = require("express");
const session = require("express-session");
const MongoDBStore = require("connect-mongodb-session")(session);
const multer = require("multer");
const crypto = require("crypto");
// Import controllers
const errorController = require("./controllers/error");
const User = require("./models/user");

// Import routes
const adminRoutes = require("./routes/admin");
const shopRoutes = require("./routes/shop");
const authRoutes = require("./routes/auth");

const MONGODB_URI =
  "mongodb+srv://KudzaiJalos_node-complete:Uy589Cc422wprtH@cluster0.zrgns.mongodb.net/shop?retryWrites=true&w=majority";
// Create an express application
const app = express();
const store = new MongoDBStore({
  uri: MONGODB_URI,
  collection: "sessions",
});
const csrf = require("csurf");
const flash = require("connect-flash");

const csrfProtection = csrf();

const privateKey = fs.readFileSync("server.key");
const certificate = fs.readFileSync("server.cert");

const fileStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, "images");
  },
  filename: (req, file, cb) => {
    cb(null, crypto.randomBytes(8).toString("hex") + "-" + file.originalname);
  },
});

const fileFilter = (req, file, cb) => {
  cb(null, ["image/png", "image/jpeg", "image/jpg"].includes(file.mimetype));
};

// Initialize database and models
// const { mongoConnect } = require("./util/database");
const mongoose = require("mongoose");

// app.set("views","views")
app.set("view engine", "ejs");

//********Add middleware*******
const helmet = require("helmet");
const compression = require("compression");
const morgan = require("morgan");

const accessLogStream = fs.createWriteStream(
  path.join(__dirname, "access.log"),
  { flags: "a" }
);

app.use(helmet());
app.use(compression());
app.use(
  morgan("combined", {
    stream: accessLogStream,
  })
);

app.use(express.static("public"));
app.use("/images", express.static("images"));

app.use(require("body-parser").urlencoded({ extended: false }));
app.use(
  multer({ dest: "images", storage: fileStorage, fileFilter }).single("image")
);

app.use(
  session({
    secret: "m yse cret",
    resave: false,
    saveUninitialized: false,
    store,
  })
);
app.use(csrfProtection);
app.use(flash());
app.use((req, res, next) => {
  // throw new Error("Sync dummy")
  if (req.session?.isLoggedIn) {
    User.findById(req.session.user._id)
      .then((user) => {
        req.user = user;
        next();
      })
      .catch((err) => {
        console.log(err);
        next(err);
      });
  } else {
    next();
  }
});

app.use((req, res, next) => {
  res.locals.isAuthenticated = req.session?.isLoggedIn;
  res.locals.csrfToken = req.csrfToken();
  next();
});

app.use("/admin", adminRoutes);
app.use(shopRoutes);
app.use(authRoutes);

// Error handling middleware
app.use("/500", errorController.get500);
app.use(errorController.get404);

app.use((error, req, res, next) => {
  console.log(error);
  res.status(500).render("500", {
    // csrfToken: req.csrfToken(),
    docTitle: "500",
    path: "/500",
  });
});

// Listen for incoming requests

mongoose
  .connect(MONGODB_URI)
  .then((result) => {
    const PORT = process.env.PORT || 3000;
    // https
    //   .createServer({ key: privateKey, cert: certificate }, app)
    //   .listen(PORT, () => {
    //     console.log("Server running on port " + PORT);
    //   });
    app.listen(PORT,()=>{
      console.log("Server running on port "+PORT)
    })
  })
  .catch((err) => {
    console.log(err);
  });
