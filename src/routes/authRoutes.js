const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { executeQuery } = require("../config/database");
const { body, validationResult } = require("express-validator");

const router = express.Router();

// Register endpoint (Member only)
router.post(
  "/register",
  [
    body("nama").notEmpty().withMessage("Nama is required"),
    body("username")
      .isLength({ min: 3 })
      .withMessage("Username must be at least 3 characters"),
    body("email").isEmail().withMessage("Valid email is required"),
    body("password")
      .isLength({ min: 6 })
      .withMessage("Password must be at least 6 characters"),
    body("academic_role")
      .isIn(["mahasiswa", "dosen", "tendik"])
      .withMessage("Invalid academic role"),
    body("no_induk").notEmpty().withMessage("No induk is required"),
  ],
  async (req, res) => {
    try {
      // Check validation errors
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          message: "Validation errors",
          errors: errors.array(),
        });
      }

      const { nama, username, email, password, academic_role, no_induk } =
        req.body;

      // Check if user already exists
      const existingUser = await executeQuery(
        "SELECT id FROM Anggota WHERE username = ? OR email = ? OR no_induk = ?",
        [username, email, no_induk]
      );

      if (existingUser.length > 0) {
        return res.status(400).json({
          success: false,
          message: "User already exists with this username, email, or no_induk",
        });
      }

      // Hash password
      const salt = await bcrypt.genSalt(10);
      const hashedPassword = await bcrypt.hash(password, salt);

      // Insert new member
      const nextIdResult = await executeQuery(
        "SELECT COALESCE(MAX(id), 0) + 1 as next_id FROM Anggota"
      );
      const nextId = nextIdResult[0].next_id;

      // Insert new member with explicit ID
      const result = await executeQuery(
        "INSERT INTO Anggota (id, nama, username, email, password, academic_role, no_induk) VALUES (?, ?, ?, ?, ?, ?, ?)",
        [nextId, nama, username, email, hashedPassword, academic_role, no_induk]
      );

      // Use nextId instead of result.insertId for token and response
      const token = jwt.sign(
        {
          id: nextId,
          username,
          email,
          type: "member",
        },
        process.env.JWT_SECRET,
        { expiresIn: process.env.JWT_EXPIRES_IN }
      );

      res.status(201).json({
        success: true,
        message: "Member account created successfully",
        data: {
          id: nextId,
          nama,
          username,
          email,
          academic_role,
          no_induk,
          account_type: "member",
        },
        token,
      });
    } catch (error) {
      console.error("Registration error:", error);
      res.status(500).json({
        success: false,
        message: "Server error during registration",
        error: error.message,
      });
    }
  }
);

// Login endpoint (Member and Admin)
router.post(
  "/login",
  [
    body("username").notEmpty().withMessage("Username is required"),
    body("password").notEmpty().withMessage("Password is required"),
  ],
  async (req, res) => {
    try {
      // Check validation errors
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          message: "Validation errors",
          errors: errors.array(),
        });
      }

      const { username, password } = req.body;

      // First check if it's a member
      let user = await executeQuery(
        "SELECT id, nama, username, email, password, academic_role, no_induk FROM Anggota WHERE username = ?",
        [username]
      );

      let accountType = "member";

      // If not found in members, check admin
      if (user.length === 0) {
        user = await executeQuery(
          "SELECT id, nama, username, email, password FROM Admin WHERE username = ?",
          [username]
        );
        accountType = "admin";
      }

      if (user.length === 0) {
        return res.status(401).json({
          success: false,
          message: "Invalid credentials",
        });
      }

      const userData = user[0];

      // Check password
      const isValidPassword = await bcrypt.compare(password, userData.password);
      if (!isValidPassword) {
        return res.status(401).json({
          success: false,
          message: "Invalid credentials",
        });
      }

      // Create JWT token
      const tokenPayload = {
        id: userData.id,
        username: userData.username,
        email: userData.email,
        type: accountType,
      };

      const token = jwt.sign(tokenPayload, process.env.JWT_SECRET, {
        expiresIn: process.env.JWT_EXPIRES_IN,
      });

      // Prepare response data
      const responseData = {
        id: userData.id,
        nama: userData.nama,
        username: userData.username,
        email: userData.email,
        account_type: accountType,
      };

      if (accountType === "member") {
        responseData.academic_role = userData.academic_role;
        responseData.no_induk = userData.no_induk;
      }

      res.json({
        success: true,
        message: `${
          accountType.charAt(0).toUpperCase() + accountType.slice(1)
        } login successful`,
        data: responseData,
        token,
      });
    } catch (error) {
      console.error("Login error:", error);
      res.status(500).json({
        success: false,
        message: "Server error during login",
        error: error.message,
      });
    }
  }
);

module.exports = router;
