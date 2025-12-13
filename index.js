const express = require("express");
const cors = require("cors");
require("dotenv").config();
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const app = express();
const port = process.env.Port || 3000;

// service account
const admin = require("firebase-admin");

const serviceAccount = require(process.env.ASSETVERSE_SERVICE_KEY);

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

// middle ware
app.use(express.json());
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
    const assetsCollection = db.collection("assets");

    // user create
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

    // user get by role for userUsers hook
    app.get("/users/:email/role", verifyUserToken, async (req, res) => {
      const email = req.params.email;
      const query = { email };
      const user = await usersCollection.findOne(query);
      res.send({ role: user?.role || "employee" });
    });

    // get users by users email for user information
    app.get("/users/:email", verifyUserToken, async (req, res) => {
      try {
        const email = req.params.email;
        if (!email) {
          return res
            .status(400)
            .send({ message: "Email parametar is required" });
        }

        const user = await usersCollection.findOne({ email: email });
        res.send(user);
      } catch (error) {
        console.error("error fetching user info", error);
        res.status(500).send({ message: "Internal server Error" });
      }
    });

    // create asset to hr
    app.post("/assets", verifyUserToken, async (req, res) => {
      try {
        const asset = req.body;
        if (
          !asset.productName ||
          !asset.productImage ||
          !asset.productType ||
          !asset.hrEmail ||
          !asset.companyName
        ) {
          return res.status(400).send({ message: "Missing required fields" });
        }

        const result = await assetsCollection.insertOne(asset);
        res.status(201).send({
          insertedId: result.insertedId,
          message: "Asset added successfully",
        });
      } catch (error) {
        console.error("Error adding asset", error);
        res.status(500).send({ message: "Internal Server Error" });
      }
    });

    // my assets for hr get assets find by hr email
    app.get("/assets", verifyUserToken, async (req, res) => {
      try {
        const { hrEmail, page = 1, limit = 10 } = req.query;
        if (!hrEmail) {
          return res
            .status(400)
            .send({ message: "Invalid format for field: 'email'." });
        }

        const pageNumber = parseInt(page);
        const limitNumber = parseInt(limit);
        const skip = (pageNumber - 1) * limitNumber;

        const query = { hrEmail };

        const totalItems = await assetsCollection.countDocuments(query);

        const items = await assetsCollection
          .find(query)
          .sort({ createdAt: -1 })
          .skip(skip)
          .limit(limitNumber)
          .toArray();

        res.send({
          items,
          totalItems,
          totalPages: Math.ceil(totalItems / limitNumber),
          currentPage: pageNumber,
        });
      } catch (error) {
        console.error("Error fetching assets:", error);
        res.status(500).send({ message: "Internal Server Error" });
      }
    });

    // delete assets hr
    app.delete("/assets/:id", verifyUserToken, async (req, res) => {
      const { id } = req.params;
      console.log(id);

      if (!id || !ObjectId.isValid(id)) {
        return res.status(400).send({ message: "Invalid asset ID" });
      }

      try {
        const result = await assetsCollection.deleteOne({
          _id: new ObjectId(id),
        });

        if (result.deletedCount === 0) {
          return res.status(404).send({ message: "Asset not found" });
        }

        res.send({ message: "Asset deleted successfully" });
      } catch (error) {
        console.error("Delete asset error:", error);
        res.status(500).send({ message: "Internal Server Error" });
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
