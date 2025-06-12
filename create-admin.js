// create-admin.js - Run this once to create admin
const bcrypt = require('bcryptjs');

async function createHashedPassword() {
  const password = 'tungtung'; // Change this to your desired password
  const salt = await bcrypt.genSalt(10);
  const hashedPassword = await bcrypt.hash(password, salt);
  console.log('Hashed password:', hashedPassword);
}

createHashedPassword();