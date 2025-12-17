require("dotenv").config();
const express = require("express");
const cors = require("cors");
const stripe = require('stripe')(process.env.STRIPE_SECRET);

const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const app = express();
const port = process.env.Port || 3000;

// service account
const admin = require("firebase-admin");

const serviceAccount = JSON.parse(
  Buffer.from(process.env.ASSETVERSE_SERVICE_KEY_BASE64, "base64").toString("utf-8")
);
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

// middle ware
app.use(express.json());

app.use(cors({
  origin:["http://localhost:5173","https://profound-dragon-cef170.netlify.app"]
}))

// app.use(
//   cors({
//     origin: (origin, callback) => {
//       const allowedOrigins = [
//         process.env.CLIENT_DOMAIN,
//         "http://localhost:5173",
        
//       ];

//       if (!origin || allowedOrigins.includes(origin)) {
//         callback(null, true);
//       } else {
//         callback(new Error("Not allowed by CORS"));
//       }
//     },
//     credentials: true,
//     methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
//     allowedHeaders: ["Content-Type", "Authorization"],
//   })
// );





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

function generateTrackingId() {
  return (
    "AV-" +
    Date.now().toString(36).toUpperCase() +
    "-" +
    Math.random().toString(36).substring(2, 8).toUpperCase()
  );
}


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
    // await client.connect();

    const db = client.db("assetVerse_DB");
    const usersCollection = db.collection("users");
    const assetsCollection = db.collection("assets");
    const assignedAssetsCollection = db.collection("assignAssets");
    const employeeAffiliationsCollection = db.collection("affiliatedEmploy");
    const requestsCollection = db.collection("assetsRequest");
    const packagesCollection = db.collection("packages");
    const paymentsCollection = db.collection("payments");






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
        const hrEmail = req.decoded_email;
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

        const hrEmail = req.decoded_email;

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

        console.log("===>> ====>>");
        console.log(affiliationDoc);
        console.log("===>> ====>>");

        await employeeAffiliationsCollection.insertOne(affiliationDoc);

        res.send({ message: "Employee affiliated successfully" });
      } catch (error) {
        res.status(500).send({ message: "Affiliation failed" });
      }
    });

    // employee team
    app.get(
      "/affiliations/employee-team",
      verifyUserToken,
      async (req, res) => {
        try {
          const employeeEmail = req.decoded_email;

          // employee এর active company affiliations
          const affiliations = await employeeAffiliationsCollection
            .find({ employeeEmail, status: "active" })
            .toArray();

          if (!affiliations.length) return res.send([]);

          // প্রতিটি company-এর active employees fetch করা
          const companyEmployees = await Promise.all(
            affiliations.map(async aff => {
              const employees = await employeeAffiliationsCollection
                .find({ companyName: aff.companyName, status: "active" })
                .toArray();

              const employeesWithDetails = await Promise.all(
                employees.map(async emp => {
                  const user = await usersCollection.findOne({
                    email: emp.employeeEmail,
                  });
                  const assetsCount =
                    await assignedAssetsCollection.countDocuments({
                      employeeEmail: emp.employeeEmail,
                      companyName: emp.companyName,
                      status: "assigned",
                    });

                  return {
                    employeeEmail: emp.employeeEmail,
                    employeeName: emp.employeeName,
                    companyName: emp.companyName,
                    photo: user?.photo || user?.photoURL || "",
                    dateOfBirth: user?.dob,
                    assetsCount,
                    joinDate: emp.affiliationDate,
                  };
                })
              );

              return {
                companyName: aff.companyName,
                employees: employeesWithDetails,
              };
            })
          );

          res.send(companyEmployees);
        } catch (error) {
          console.error(error);
          res.status(500).send({ message: "Failed to fetch employee team" });
        }
      }
    );

    // hr myEmployees
    app.get("/affiliations/hr", verifyUserToken, async (req, res) => {
      try {
        const hrEmail = req.decoded_email;

        const employees = await employeeAffiliationsCollection
          .find({ hrEmail, status: "active" })
          .toArray();

        const employeesWithDetails = await Promise.all(
          employees.map(async emp => {
            const user = await usersCollection.findOne({
              email: emp.employeeEmail,
            });

            const assetsCount = await assignedAssetsCollection.countDocuments({
              employeeEmail: emp.employeeEmail,
              hrEmail,
              status: "assigned",
            });

            return {
              ...emp,
              photo: user?.photo || user?.photoURL || "",
              joinDate: emp.affiliationDate,
              assetsCount,
            };
          })
        );

        res.send(employeesWithDetails);
      } catch (error) {
        console.error(error);
        res.status(500).send({ message: "Internal Server Error" });
      }
    });

    // remove employ from company
    app.patch(
      "/affiliations/remove/:employeeEmail",
      verifyUserToken,
      async (req, res) => {
        try {
          const hrEmail = req.decoded_email;
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

    // get all requests for HR
    app.get("/requests/hr", verifyUserToken, async (req, res) => {
      try {
        const hrEmail = req.decoded_email;
        const requests = await requestsCollection
          .find({ hrEmail })
          .sort({ requestDate: -1 })
          .toArray();
        res.send(requests);
      } catch (error) {
        console.error(error);
        res.status(500).send({ message: "Internal Server Error" });
      }
    });

    // approved employ request to hr
    app.patch("/requests/:id", verifyUserToken, async (req, res) => {
      try {
        const { id } = req.params;
        const { action } = req.body;
        const hrEmail = req.decoded_email;

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

  const hrUser = await usersCollection.findOne({ email: hrEmail });
  const employeeCount = await employeeAffiliationsCollection.countDocuments({
    hrEmail,
    status: "active",
  });

  if (employeeCount >= hrUser.package.employeesLimit) {
    return res.status(403).send({
      message: "Employee limit exceeded. Upgrade package first.",
    });
  }

  
}

        if (action === "approved") {
          // 1. Add to assignedAssets
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

          // 2. Deduct from asset quantity
          await assetsCollection.updateOne(
            { _id: request.assetId },
            { $inc: { availableQuantity: -1 } }
          );

          // 3. Create affiliation if first time
          const existingAffiliation =
            await employeeAffiliationsCollection.findOne({
              hrEmail: request?.hrEmail,
              employeeEmail: request?.requesterEmail,

              status: "active",
            });

          if (!existingAffiliation) {
            await employeeAffiliationsCollection.insertOne({
              hrEmail: request.hrEmail,
              employeeEmail: request.requesterEmail,
              employeeName: request.requesterName,
              companyName: request.companyName,

              affiliationDate: new Date(),
              status: "active",
            });
          }
        }

        res.send({ message: `Request ${action}` });
      } catch (error) {
        console.error(error);
        res.status(500).send({ message: "Update failed" });
      }
    });

    // packages collection get api
    app.get("/packages", verifyUserToken, async (req, res) => {
  const packages = await packagesCollection.find().toArray();
  res.send(packages);
});

//payments
app.post("/create-checkout-session", verifyUserToken, async (req, res) => {
  const { packageName, price, employeeLimit } = req.body;

  const trackingId = generateTrackingId();
  const session = await stripe.checkout.sessions.create({
    payment_method_types: ["card"],
    line_items: [
      {
        price_data: {
          currency: "usd",
          product_data: {
            name: packageName,
          },
          unit_amount: price * 100,
        },
        quantity: 1,
      },
    ],
    mode: "payment",
    success_url: `${process.env.CLIENT_DOMAIN}/dashboard/payment-success?pkg=${packageName}&limit=${employeeLimit}&price=${price}&trackingId=${trackingId}`,
    cancel_url: `${process.env.CLIENT_DOMAIN}/packages`,
  });

  res.send({ url: session.url });
});

app.post("/payments", verifyUserToken, async (req, res) => {
  const {
    packageName,
    employeeLimit,
    amount,
    trackingId
    
  } = req.body;


  if (!trackingId) {
  return res.status(400).send({
    message: "trackingId is required",
  });
}


  const hrEmail = req.decoded_email;

    const existingPayment = await paymentsCollection.findOne({ trackingId });

  if (existingPayment) {
    return res.send({
      success: true,
      trackingId: existingPayment.trackingId,
      message: "Payment already recorded",
    });
  }



  // Save payment history
  await paymentsCollection.insertOne({
    hrEmail,
    packageName,
    employeeLimit,
    amount,
    trackingId,
    transactionId: trackingId,
    paymentDate: new Date(),
    status: "completed",
  });

  //  Update HR package
  await usersCollection.updateOne(
    { email: hrEmail },
    {
      $set: {
        package: {
          name: packageName,
          employeesLimit: employeeLimit,
          price: amount,
          activatedAt: new Date(),
        },
      },
    }
  );

  res.send({ success: true,trackingId });
});

app.get("/payments/history", verifyUserToken, async (req, res) => {
  const hrEmail = req.decoded_email;

  const history = await paymentsCollection
    .find({ hrEmail })
    .sort({ paymentDate: -1 })
    .toArray();

  res.send(history);
});


app.post("/downgrade-to-free", verifyUserToken, async (req, res) => {
  const hrEmail = req.decoded_email;

  const freePackage = {
    name: "Default Free Package",
    employeesLimit: 5,
    price: 0,
    activatedAt: new Date(),
  };

  // Update HR package
  await usersCollection.updateOne(
    { email: hrEmail },
    { $set: { package: freePackage } }
  );

  // Fetch active employees
  const activeEmployees = await employeeAffiliationsCollection
    .find({ hrEmail, status: "active" })
    .sort({ affiliationDate: 1 })
    .toArray();

  // Keep only first 5 active
  const limit = freePackage.employeesLimit;
  if (activeEmployees.length > limit) {
    const toDeactivate = activeEmployees.slice(limit);
    for (const emp of toDeactivate) {
      await employeeAffiliationsCollection.updateOne(
        { _id: emp._id },
        { $set: { status: "inactive" } }
      );
    }
  }

  res.send({ success: true, message: "Switched to Free Package" });
});





    // Send a ping to confirm a successful connection
    // await client.db("admin").command({ ping: 1 });
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


