const express = require("express");
const cors = require("cors");
require("dotenv").config();
const { MongoClient, ServerApiVersion } = require('mongodb');
const app = express();
const port = process.env.Port || 3000;

// middle ware
app.use(
  cors({
    origin: [process.env.CLIENT_DOMAIN],
    credentials: true,
    optionsSuccessStatus: 200,
  })
);

const uri = process.env.URI



// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  }
});
async function run() {
  try {
    const db = client.db('assetVerse_DB')
    const usersCollection = db.collection('users')
    
    app.post('/users',async(req,res)=>{
        
    })


    // Send a ping to confirm a successful connection
    await client.db("admin").command({ ping: 1 });
    console.log("Pinged your deployment. You successfully connected to MongoDB!");
  } finally {
    // Ensures that the client will close when you finish/error
    await client.close();
  }
}
run().catch(console.dir);











app.get("/", (req, res) => {
  res.send("Welcome to Asset Verse Server ");
});


app.listen(port, () => {
  console.log(`assetVerse app is listening on port ${port}`);
});
