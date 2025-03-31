const admin = require("firebase-admin");
const dotenv = require("dotenv");
dotenv.config();

// Initialize Firebase Admin SDK
const serviceAccount = require("./serviceAccountKey.json");

admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
});

const auth = admin.auth();
module.exports = auth;
