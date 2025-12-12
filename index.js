const express = require("express");
const cors = require("cors");
require("dotenv").config();
const { MongoClient, ServerApiVersion } = require("mongodb");
const app = express();
const port = process.env.Port || 3000;

// service account
const admin = require("firebase-admin");

const serviceAccount = require(process.env.ASSETVERSE_SERVICE_KEY);

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

// middle ware
app.use(express.json())
app.use(express.urlencoded({ extended: true }));
app.use(
  cors({
    origin: [process.env.CLIENT_DOMAIN],
    credentials: true,
    optionsSuccessStatus: 200,
  })
);

// verifyUserToken
const verifyUserToken = async (req, res, next) => {
  const tokenHeader = req.headers.authorization;

  if (!tokenHeader) {
    return res.status(401).send({ message: "Unauthorized access" });
  }

  try {
    const idToken = tokenHeader.split(" ")[1];
    const decoded = await admin.auth().verifyIdToken(idToken);

    req.decoded_email = decoded.email;
    next();
  } catch (error) {
    console.log(error);
    return res.status(401).send({ message: "Invalid or expired token" });
  }
};

const uri = process.env.URI;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});
async function run() {
  try {
    await client.connect();
    const db = client.db("assetVerse_DB");
    const usersCollection = db.collection("users");

app.post("/users", async (req, res) => {
  try {
    const user = req.body;

    user.createdAt = new Date();
    const email = user.email;

    const existingUser = await usersCollection.findOne({ email });
    if (existingUser) {
      return res.status(400).send({ message: "User already exists" });
    }

    // HR user setup
    if (user.role === "hr") {
      user.package = {
        name: "Default Free Package",
        employeesLimit: 5,
        price: 0,
        activatedAt: new Date(),
      };
      user.companyId = new Date().getTime().toString();
    }

    // Employee setup
    if (user.role === "employee") {
      user.companyId = null;
      user.status = "unassigned";
    }

    const result = await usersCollection.insertOne(user);

    res.send({
      success: true,
      message: "User created successfully",
      data: result,
    });

  } catch (error) {
    console.error(error);
    res.status(500).send({ message: "Something went wrong" });
  }
});


    // Send a ping to confirm a successful connection
    await client.db("admin").command({ ping: 1 });
    console.log(
      "Pinged your deployment. You successfully connected to MongoDB!"
    );
  } finally {
    
  }
}
run().catch(console.dir);

app.get("/", (req, res) => {
  res.send("Welcome to Asset Verse Server ");
});

app.listen(port, () => {
  console.log(`assetVerse app is listening on port ${port}`);
});
