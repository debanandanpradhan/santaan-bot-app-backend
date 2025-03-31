const express = require('express');
const { queryChatbot } = require('../controllers/queryController');
const router = express.Router();

router.post('/chat', queryChatbot);

module.exports = router;
