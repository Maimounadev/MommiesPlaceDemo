const { result } = require("lodash");
const { ObjectId } = require("mongodb");
// Set environment variables for your credentials: PUT THESE SECRETS IN A .ENV FILE BEFORE PUSHING
const accountSid = "AC328c19c3020444bb7b9975f5ffd1b79e";
TWILIO_AUTH_TOKEN = '825ce5242991901b0828f522734d0e2a'
let client = require("twilio")(accountSid, TWILIO_AUTH_TOKEN);
const { Configuration, OpenAIApi } = require("openai");
const fs = require("fs");
const { captureRejectionSymbol } = require("events");
const stripe = require("stripe")(process.env.SECRET_KEY);
// delete fs if test fails
require("dotenv").config();
// test =======

module.exports = function (app, passport, db, multer) {
  // Image Upload Code =========================================================================
  const storage = multer.diskStorage({
    destination: function (req, file, cb) {
      cb(null, "public/images/uploads");
    },
    filename: function (req, file, cb) {
      cb(null, file.originalname);
    },
  });

  const upload = multer({ storage: storage });

  // normal routes ===============================================================

  // show the home page (will also have our login links)
  // starter api for my marketplace feature, users can buy and sell products.
  app.get("/", function (req, res) {
    res.render("signup.ejs");
  });
// Get Marketplace :It retrieves items from a MongoDB collection based on an optional price filter, 
// fetches purchased items from another collection, and renders a marketplace view with the retrieved data, 
// including the user's email, items, purchased items, and the user's address.

  app.get("/marketplace", isLoggedIn, function (req, res) {
    let boughtItems = [];
    let filter = req.query.price
      ? { price: parseInt(req.query.price) }
      : undefined;
    db.collection("marketplace")
      .find(filter)
      .toArray((err, items) => {
        db.collection("purchased")
          .find()
          .toArray((err, result) => {
            if (err) return console.log(err);
            for (let i = 0; i < result.length; i++) {
              boughtItems.push(result[i].item[0]._id);
            }
            res.render("marketplace.ejs", {
              user: req.user.local.email,
              items,
              result,
              boughtItems: boughtItems,
              myAddress: req.user.local.address,
            });
          });
      });
  });

  // expects a form submission with fields including "title", "price", "address", "description", "condition", "age", 
  // and a file upload field named "file-to-upload". Upon receiving the form data, 
  // it saves a new item to the "marketplace" collection in the MongoDB database,
  //  with various properties extracted from the request body and file,
  //  and then redirects the user to the "/marketplace" page.

  app.post("/sell", isLoggedIn, upload.single("file-to-upload"), (req, res) => {
    const { title, price, address, description, condition, age } = req.body;
    db.collection("marketplace").save(
      {
        isAvailabale: true,
        buyer: "noBody",
        title,
        price: Number(price),
        address,
        seller: req.user.local.email,
        description,
        age,
        condition,
        imgPath: "images/uploads/" + req.file.filename,
      },
      (err, result) => {
        if (err) return console.log(err);
        console.log("saved to database");
        res.redirect("/marketplace");
      }
    );
  });

  
  // This code represents a route handler for the "/edit" endpoint in a web application. 
  // It receives a PUT request, updates a document in the "marketplace" collection 
  // in MongoDB based on the provided ID and new text, 
  // and sends the updated document as the response.

  app.put('/edit', (req, res) => {
    console.log(req.body)
    db.collection('marketplace').findOneAndUpdate({ _id: ObjectId(req.body.id) },
   {
    $set: {
      msg: req.body.newText
    }
  }, {
    sort: {_id: -1},
    upsert: true
  }, (err, result) => {
    if (err) return res.send(err)
    res.send(result)
  })
})



  app.get("/listings", isLoggedIn, function (req, res) {
    db.collection("marketplace")
      .find({ seller: req.user.local.email })
      .toArray((err, data) => {
        console.log(data);
        if (err) return console.log(err);
        db.collection("purchased")
          .find()
          .toArray((err, result) => {
            if (err) return console.log(err);
            res.render("purchasedTwo.ejs", {
              data,
              result,
              myAddress: req.user.local.address,
            });
          });
      });
  });

  app.put("/listings", (req, res) => {
    db.collection("marketplace").findOneAndUpdate(
      { _id: ObjectId(req.body.itemId) },
      {
        $set: {
          buyer: req.body.buyer,
          isAvailabale: false,
        },
      },
      {
        sort: { _id: -1 },
        upsert: true,
      },
      (err, result) => {
        if (err) return res.send(err);
        res.send(result);
      }
    );
  });

  app.post("/editListing", (req, res) => {
    console.log(req.body)
    db.collection("marketplace").findOneAndUpdate(
      { _id: ObjectId(req.body.itemId) },
      {
        $set: {
         description: req.body.description
       
        },
      },
      {
        sort: { _id: -1 },
        upsert: true,
      },
      (err, result) => {
        if (err) return res.send(err);
        res.redirect('/listings');
      }
    );
  });


  app.get("/purchased", isLoggedIn, function (req, res) {
    db.collection("purchased")
      .find({ user: req.user.local.email })
      .toArray((err, data) => {
        console.log(data);
        if (err) return console.log(err);
        db.collection("marketplace")
          .find()
          .toArray((err, listings) => {
            console.log(listings);
            if (err) return console.log(err);
            res.render("purchased.ejs", {
              data,
              myEmail: req.user.local.email,
              myAddress: req.user.local.address,
              listings: listings,
            });
          });
      });
  });

  app.post("/purchase/:id", isLoggedIn, (req, res) => {
    const item = db
      .collection("marketplace")
      .find({ _id: ObjectId(req.params.id) })
      .toArray((err, item) => {
        db.collection("purchased").save(
          { item, purchasedOn: new Date(), user: req.user.local.email },
          (err, result) => {
            if (err) return res.send(err);
            res.redirect("/purchased");
          }
        );
      });
  });

  app.delete("/marketplace", isLoggedIn, (req, res) => {
    const _id = ObjectId(req.body._id);
    db.collection("marketplace").findOneAndDelete({ _id }, (err, result) => {
      if (err) return res.send(500, err);
      res.send("Message deleted!");
    });
  });

  // PROFILE SECTION =========================
  app.get("/profile", isLoggedIn, function (req, res) {
    db.collection("messages")
      .find()
      .toArray((err, result) => {
        if (err) return console.log(err);
        const isNewMom = req.user.local.momType == "first-time-mom";
        // if (isNewMom) {
        //   res.render('newMomProfile.ejs')
        // }
        // else{
        res.render("profile.ejs", {
          user: req.user.local,
          messages: result,
        });
        // }
      });
  });

  // LOGOUT ==============================
  app.get("/logout", function (req, res) {
    req.logout(() => {
      console.log("User has logged out!");
    });
    res.render("signup.ejs");
  });

  // message board routes ===============================================================

  // =============================================================================
  // AUTHENTICATE (FIRST LOGIN) ==================================================
  // =============================================================================

  // locally --------------------------------
  // LOGIN ===============================
  // process the login form
  app.post(
    "/login",
    passport.authenticate("local-login", {
      successRedirect: "/profile", // redirect to the secure profile section
      failureRedirect: "/login", // redirect back to the signup page if there is an error
      failureFlash: true, // allow flash messages
    })
  );

  // SIGNUP =================================
  // show the signup form
  app.get("/signup", function (req, res) {
    res.render("signup.ejs", { message: req.flash("signupMessage") });
  });

  // process the signup form
  app.post(
    "/signup",
    passport.authenticate("local-signup", {
      successRedirect: "/welcome-msg", // redirect to the secure profile section
      failureRedirect: "/signup", // redirect back to the signup page if there is an error
      failureFlash: true, // allow flash messages
    })
  );

  // ===================================================

  app.get("/welcome-msg", function (req, res) {
    client.messages
      .create({
        body: "Welcome to my app",
        from: "+1315625229",
        to: "+16103875392",
      })
      .then((message) => {
        console.log("message sent!", message.sid);
        res.redirect("/profile.ejs");
      })
      .catch((error) => console.error(error));
  });

  // =============================================================================
  // UNLINK ACCOUNTS =============================================================
  // =============================================================================
  // used to unlink accounts. for social accounts, just remove the token
  // for local account, remove email and password
  // user account will stay active in case they want to reconnect in the future

  // local -----------------------------------
  app.get("/unlink/local", isLoggedIn, function (req, res) {
    var user = req.user;
    user.local.email = undefined;
    user.local.password = undefined;
    user.save(function (err) {
      res.redirect("/profile");
    });
  });
};

// route middleware to ensure user is logged in
function isLoggedIn(req, res, next) {
  if (req.isAuthenticated()) return next();

  res.redirect("/");
}
