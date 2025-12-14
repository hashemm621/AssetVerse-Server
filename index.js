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
    const assignedAssetsCollection = db.collection("assignAssets");
    const employeeAffiliationsCollection = db.collection("affiliatedEmploy");
    const requestsCollection = db.collection("assetsRequest");

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

    // All assets for employ
   app.get("/assigned-assets", verifyUserToken, async (req, res) => {
  try {
    const { page = 1, limit = 10, search = "", type = "" } = req.query;

    const pageNumber = parseInt(page);
    const limitNumber = parseInt(limit);
    const skip = (pageNumber - 1) * limitNumber;

    const query = {};
    if (search) query.productName = { $regex: search, $options: "i" };
    if (type) query.productType = type;

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
    console.error(error);
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

    // update assets to hr
    app.patch("/assets/:id", verifyUserToken, async (req, res) => {
      const { id } = req.params;
      const updatedData = req.body;

      if (!ObjectId.isValid(id)) {
        return res.status(400).send({ message: "Invalid asset ID" });
      }

      try {
        const result = await assetsCollection.updateOne(
          { _id: new ObjectId(id) },
          { $set: updatedData }
        );

        if (result.matchedCount === 0) {
          return res.status(404).send({ message: "Asset not found" });
        }

        res.send({ message: "Asset updated successfully" });
      } catch (error) {
        console.error("Update asset error:", error);
        res.status(500).send({ message: "Internal Server Error" });
      }
    });

    const isAffiliatedEmployee = async (hrEmail, employeeEmail) => {
      return await employeeAffiliationsCollection.findOne({
        hrEmail,
        employeeEmail,
        status: "active",
      });
    };

    // assign employ from hr
    app.patch("/assets/assign/:id", verifyUserToken, async (req, res) => {
      try {
        const { employeeEmail, employeeName } = req.body;
        const hrEmail = req.user.email;
        const assetId = req.params.id;

        if (!employeeEmail || !employeeName) {
          return res.status(400).send({ message: "Employee info required" });
        }

        const affiliated = await isAffiliatedEmployee(hrEmail, employeeEmail);
        if (!affiliated) {
          return res.status(403).send({ message: "Employee not affiliated" });
        }

        const asset = await assetsCollection.findOne({
          _id: new ObjectId(assetId),
          hrEmail,
        });

        if (!asset || asset.availableQuantity < 1) {
          return res.status(400).send({ message: "Asset unavailable" });
        }

        await assetsCollection.updateOne(
          { _id: asset._id },
          { $inc: { availableQuantity: -1 } }
        );

        await assignedAssetsCollection.insertOne({
          assetId: asset._id,
          assetName: asset.productName,
          assetImage: asset.productImage,
          assetType: asset.productType,
          employeeEmail,
          employeeName,
          hrEmail,
          companyName: asset.companyName,
          assignmentDate: new Date(),
          returnDate: null,
          status: "assigned",
        });

        res.send({ message: "Asset assigned successfully" });
      } catch (error) {
        res.status(500).send({ message: "Assign failed" });
      }
    });

    // assets return
    app.patch("/assets/return/:id", verifyUserToken, async (req, res) => {
      try {
        const assignmentId = req.params.id;

        const assignment = await assignedAssetsCollection.findOne({
          _id: new ObjectId(assignmentId),
        });

        if (!assignment) {
          return res.status(404).send({ message: "Assignment not found" });
        }

        if (assignment.status === "returned") {
          return res.status(400).send({ message: "Asset already returned" });
        }

        if (assignment.assetType === "non-returnable") {
          return res.status(403).send({
            message: "Non-returnable assets cannot be returned",
          });
        }

        await assignedAssetsCollection.updateOne(
          { _id: assignment._id },
          {
            $set: {
              status: "returned",
              returnDate: new Date(),
            },
          }
        );

        await assetsCollection.updateOne(
          { _id: assignment.assetId },
          { $inc: { availableQuantity: 1 } }
        );

        res.send({ message: "Asset returned successfully" });
      } catch (error) {
        console.error("Return asset error:", error);
        res.status(500).send({ message: "Return failed" });
      }
    });

    // post employ affiliation
    app.post("/affiliations", verifyUserToken, async (req, res) => {
      try {
        const { employeeEmail, employeeName, companyName, companyLogo } =
          req.body;

        const hrEmail = req.user.email;

        if (!employeeEmail || !employeeName) {
          return res.status(400).send({ message: "Employee info required" });
        }

        // prevent duplicate affiliation
        const exists = await employeeAffiliationsCollection.findOne({
          employeeEmail,
          hrEmail,
          status: "active",
        });

        if (exists) {
          return res
            .status(409)
            .send({ message: "Employee already affiliated" });
        }

        const affiliationDoc = {
          employeeEmail,
          employeeName,
          hrEmail,
          companyName,
          companyLogo,
          affiliationDate: new Date(),
          status: "active",
        };

        await employeeAffiliationsCollection.insertOne(affiliationDoc);

        res.send({ message: "Employee affiliated successfully" });
      } catch (error) {
        res.status(500).send({ message: "Affiliation failed" });
      }
    });

    // hr myEmployees
    app.get("/affiliations/hr", verifyUserToken, async (req, res) => {
      try {
        const hrEmail = req.decoded_email; // use the verified email from token
        const employees = await employeeAffiliationsCollection
          .find({ hrEmail, status: "active" })
          .toArray();
        res.send(employees);
      } catch (error) {
        console.error("Error fetching affiliated employees:", error);
        res.status(500).send({ message: "Internal Server Error" });
      }
    });

    // remove employ from company
    app.patch(
      "/affiliations/remove/:employeeEmail",
      verifyUserToken,
      async (req, res) => {
        try {
          const hrEmail = req.user.email;
          const { employeeEmail } = req.params;

          const result = await employeeAffiliationsCollection.updateOne(
            { hrEmail, employeeEmail, status: "active" },
            { $set: { status: "inactive" } }
          );

          if (!result.modifiedCount) {
            return res.status(404).send({ message: "Employee not found" });
          }

          res.send({ message: "Employee removed from team" });
        } catch (error) {
          res.status(500).send({ message: "Remove failed" });
        }
      }
    );

    //post employ to asset request
    app.post("/requests", verifyUserToken, async (req, res) => {
      try {
        const {
          assetId,
          assetName,
          assetType,
          requesterName,
          requesterEmail,
          hrEmail,
          companyName,
          note,
        } = req.body;

        if (!assetId || !requesterEmail || !hrEmail) {
          return res.status(400).send({ message: "Required fields missing" });
        }

        const requestDoc = {
          assetId: new ObjectId(assetId),
          assetName,
          assetType,
          requesterName,
          requesterEmail,
          hrEmail,
          companyName,
          requestDate: new Date(),
          approvalDate: null,
          requestStatus: "pending",
          note: note || "",
          processedBy: null,
        };

        const result = await requestsCollection.insertOne(requestDoc);

        res
          .status(201)
          .send({ message: "Request submitted", requestId: result.insertedId });
      } catch (error) {
        console.error(error);
        res.status(500).send({ message: "Request failed" });
      }
    });

    // approved employ request to hr
    app.patch("/requests/:id", verifyUserToken, async (req, res) => {
      try {
        const { id } = req.params;
        const { action, hrEmail } = req.body; // action = "approved" | "rejected"

        const request = await requestsCollection.findOne({
          _id: new ObjectId(id),
        });

        if (!request)
          return res.status(404).send({ message: "Request not found" });

        if (request.requestStatus !== "pending") {
          return res.status(400).send({ message: "Request already processed" });
        }

        let updateData = {
          requestStatus: action,
          approvalDate: new Date(),
          processedBy: hrEmail,
        };

        await requestsCollection.updateOne(
          { _id: new ObjectId(id) },
          { $set: updateData }
        );

        if (action === "approved") {
          await assignedAssetsCollection.insertOne({
            assetId: request.assetId,
            assetName: request.assetName,
            assetType: request.assetType,
            employeeEmail: request.requesterEmail,
            employeeName: request.requesterName,
            hrEmail: request.hrEmail,
            companyName: request.companyName,
            assignmentDate: new Date(),
            returnDate: null,
            status: "assigned",
          });
        }

        res.send({ message: `Request ${action}` });
      } catch (error) {
        console.error(error);
        res.status(500).send({ message: "Update failed" });
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
