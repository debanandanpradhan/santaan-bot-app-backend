const express = require("express"); // ✅ Import express
const admin = require("firebase-admin");
const router = express.Router();

router.post("/verify-token", async (req, res) => {
    const { token } = req.body;
    try {
        const decodedToken = await admin.auth().verifyIdToken(token);
        res.status(200).json({ uid: decodedToken.uid });
    } catch (error) {
        res.status(401).json({ error: "Unauthorized", details: error.message });
    }
});

module.exports = router;
