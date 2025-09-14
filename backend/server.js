// server.js
require('dotenv').config();
const express = require("express");
const cors = require("cors");
const app = express();

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// initialize DB (Sequelize)
const db = require('./src/config/db');
db.init(); // ensure tables synced

app.get("/", (req, res) => {
  res.json({ message: "Welcome to Mental Health Chatbot Backend" });
});

// routes
app.use("/api/auth", require("./src/routes/auth.routes"));
app.use("/api/chat", require("./src/routes/chat.routes"));
app.use("/api/mood", require("./src/routes/mood.routes"));

// start server
const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
