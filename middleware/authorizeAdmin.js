require('dotenv').config();
const authorizeAdmin = (req, res, next) => {
  if (!req.user || req.user.id !== process.env.ADMIN_USER_ID) {
    return res.status(403).json({ message: 'Access denied. Admin only.' });
  }
  next();
};

module.exports = authorizeAdmin;
