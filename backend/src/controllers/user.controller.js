const { User } = require('../config/db');

async function getAllUsers(req, res) {
  try {
    const users = await User.findAll({
      attributes: ['id', 'name', 'email', 'is_registered', 'last_login_at']
    });
    return res.json(users);
  } catch (err) {
    console.error('GET USERS ERROR:', err);
    return res.status(500).json({ message: 'Error fetching users' });
  }
}

module.exports = { getAllUsers };
