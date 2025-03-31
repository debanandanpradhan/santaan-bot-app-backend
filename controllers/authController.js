const admin = require('firebase-admin');
const dotenv = require('dotenv');
dotenv.config();

const serviceAccount = require("../serviceAccountKey.json"); // Use actual file

admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
});

exports.verifyToken = async (req, res) => {
    const token = req.headers.authorization;
    try {
        const decoded = await admin.auth().verifyIdToken(token);
        res.status(200).json({ user: decoded });
    } catch (err) {
        res.status(401).json({ message: 'Unauthorized' });
    }
};
