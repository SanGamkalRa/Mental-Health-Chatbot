// server.js
require('dotenv').config();
if (!process.env.JWT_SECRET && process.env.NODE_ENV !== 'development') {
  console.error('FATAL: JWT_SECRET must be set in environment');
  process.exit(1);
}

const express = require("express");
const cors = require("cors");
const app = express();

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// // initialize DB (Sequelize)
// const db = require('./src/config/db');
// db.init(); // ensure tables synced

const DB_TYPE = process.env.DB_TYPE || 'mysql';

if (DB_TYPE === 'mysql') {
  const db = require('./src/config/db');
  db.init();
} else {
  console.log('DB_TYPE=dynamo — skipping Sequelize init');
}



app.get("/", (req, res) => {
  res.json({ message: "Welcome to Mental Health Chatbot Backend" });
});

// routes
app.use("/api/auth", require("./src/routes/auth.routes"));
app.use('/api/users', require('./src/routes/user.routes'));
app.use('/api/wellness', require('./src/routes/wellness.routes'));
app.use('/api/mood', require('./src/routes/mood.routes'));
app.use('/api/chat', require('./src/routes/chat.routes'));




// start server
const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
