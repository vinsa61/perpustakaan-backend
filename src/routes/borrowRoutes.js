const express = require("express");
const { executeQuery, executeTransaction } = require("../config/database");
const { authenticateToken } = require("../middleware/auth");

const router = express.Router();

// POST /api/borrow/request - Create a new borrow request
router.post("/request", authenticateToken, async (req, res) => {
  try {
    const { bookIds } = req.body;
    const userId = req.user.id;

    // Validate input
    if (!bookIds || !Array.isArray(bookIds) || bookIds.length === 0) {
      return res.status(400).json({
        success: false,
        message: "Please provide at least one book ID",
      });
    } // Check if all books exist and are available
    const booksQuery = `
      SELECT id, judul, stok, tersedia 
      FROM buku 
      WHERE id IN (${bookIds.map(() => "?").join(",")})
    `;

    const books = await executeQuery(booksQuery, bookIds);

    if (books.length !== bookIds.length) {
      return res.status(400).json({
        success: false,
        message: "One or more books not found",
      });
    } // Check if books are available (more lenient check for trigger compatibility)
    // Only check actual stock level, not the tersedia flag which may be updated by triggers
    const unavailableBooks = books.filter((book) => book.stok < 1);
    if (unavailableBooks.length > 0) {
      return res.status(400).json({
        success: false,
        message: `Books not available: ${unavailableBooks
          .map((b) => b.judul)
          .join(", ")}`,
      });
    } // Check if user has any existing active loans or pending requests for these books
    // Include all active statuses: pending, dipinjam, and dikembalikan
    const existingRequestsQuery = `
      SELECT COUNT(*) as count
      FROM peminjaman p 
      JOIN peminjaman_detail pd ON p.id = pd.peminjaman_id
      WHERE p.user_id = ? AND p.status IN ('pending', 'dipinjam', 'dikembalikan') AND pd.buku_id IN (${bookIds
        .map(() => "?")
        .join(",")})
    `;

    const existingResult = await executeQuery(existingRequestsQuery, [
      userId,
      ...bookIds,
    ]);
    if (existingResult[0].count > 0) {
      return res.status(400).json({
        success: false,
        message:
          "You already have pending requests or active loans for one or more of these books",
      });
    } // Create borrow request using manual transaction for better control
    const { getPool } = require("../config/database");

    const pool = getPool();
    const connection = await pool.getConnection();
    let peminjamanId;
    try {
      await connection.beginTransaction();

      // Get next available ID for peminjaman
      const [maxIdResult] = await connection.query(
        "SELECT COALESCE(MAX(id), 0) + 1 as next_id FROM peminjaman"
      ); // Create peminjaman record with AUTO_INCREMENT ID and pending status
      // After running migration, this will use 'pending' status for approval workflow
      const [peminjamanResult] = await connection.query(
        `INSERT INTO peminjaman (user_id, tanggal_pinjam, tenggat_pengembalian, status, created_at) 
         VALUES (?, NOW(), DATE_ADD(NOW(), INTERVAL 14 DAY), 'pending', NOW())`,
        [userId]
      );

      peminjamanId = peminjamanResult.insertId; // Get next available starting ID for peminjaman_detail
      const [maxDetailIdResult] = await connection.query(
        "SELECT COALESCE(MAX(id), 0) + 1 as next_id FROM peminjaman_detail"
      );
      let nextDetailId = maxDetailIdResult[0].next_id;

      // Create peminjaman detail records and update stock for each book
      for (const bookId of bookIds) {
        // Insert peminjaman detail with explicit ID
        await connection.query(
          "INSERT INTO peminjaman_detail (id, peminjaman_id, buku_id) VALUES (?, ?, ?)",
          [nextDetailId, peminjamanId, bookId]
        );

        // Increment for next detail record
        nextDetailId++;
      }

      await connection.commit();
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }

    // Get the created request details
    const requestDetails = await executeQuery(
      `
      SELECT 
        p.id as peminjaman_id,
        p.tanggal_pinjam,
        p.tenggat_pengembalian,
        p.status,
        COUNT(pd.buku_id) as total_books,
        GROUP_CONCAT(b.judul ORDER BY b.judul SEPARATOR ', ') as book_titles
      FROM peminjaman p
      JOIN peminjaman_detail pd ON p.id = pd.peminjaman_id
      JOIN buku b ON pd.buku_id = b.id      WHERE p.id = ?
      GROUP BY p.id
    `,
      [peminjamanId]
    );
    res.status(201).json({
      success: true,
      status: true,
      message: "Borrow request submitted successfully!",
      data: {
        request: requestDetails[0],
        message: "Your borrow request is waiting for admin approval",
      },
    });
  } catch (error) {
    console.error("Create borrow request error:", error);
    res.status(500).json({
      success: false,
      message: "Server error creating borrow request",
      error: error.message,
    });
  }
});

// POST /api/borrow/return/:id - Create a return request
router.post("/return/:id", authenticateToken, async (req, res) => {
  try {
    const { id: peminjamanId } = req.params;
    const userId = req.user.id;

    console.log(
      `Return request for peminjaman ${peminjamanId} by user ${userId}`
    ); // Check if peminjaman exists and belongs to user
    // Allow both 'dipinjam' status (regular borrow) and books with rejected returns
    const peminjamanResult = await executeQuery(
      "SELECT * FROM peminjaman WHERE id = ? AND user_id = ? AND status = 'dipinjam'",
      [peminjamanId, userId]
    );

    console.log(`Found ${peminjamanResult.length} peminjaman records`);

    if (peminjamanResult.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Borrow record not found or not eligible for return",
      });
    } // Check if return already exists and is not rejected
    const existingReturnResult = await executeQuery(
      "SELECT admin_id FROM pengembalian WHERE peminjaman_id = ?",
      [peminjamanId]
    );

    console.log(`Found ${existingReturnResult.length} existing return records`);
    if (existingReturnResult.length > 0) {
      console.log(
        `Existing return admin_id: ${existingReturnResult[0].admin_id}`
      );
    } // Only block if there's an existing return that was approved by an admin
    if (existingReturnResult.length > 0) {
      const adminId = existingReturnResult[0].admin_id;
      if (adminId !== null && adminId > 0) {
        return res.status(400).json({
          success: false,
          message: "Return request already approved for this borrow",
        });
      }
      // If admin_id is NULL, 0, or negative (rejected/pending), allow the return to proceed
    }

    // Calculate fine if overdue
    const peminjaman = peminjamanResult[0];
    const currentDate = new Date();
    const dueDate = new Date(peminjaman.tenggat_pengembalian);
    const daysOverdue = Math.max(
      0,
      Math.ceil((currentDate - dueDate) / (1000 * 60 * 60 * 24))
    );
    const fine = daysOverdue * 1000; // 1000 per day fine    // Create return record and update peminjaman status to 'dikembalikan' (waiting for admin approval)
    const { getPool } = require("../config/database");
    const pool = getPool();
    const connection = await pool.getConnection();

    try {
      await connection.beginTransaction(); // Create return record
      // Check if pengembalian record already exists (from previous rejected return)
      const existingReturn = await connection.query(
        "SELECT id FROM pengembalian WHERE peminjaman_id = ?",
        [peminjamanId]
      );
      if (existingReturn[0].length > 0) {
        console.log(
          "Updating existing pengembalian record - this is a return retry after rejection"
        );
        // Update existing pengembalian record
        await connection.query(
          `UPDATE pengembalian 
           SET tanggal_dikembalikan = NOW(), denda = ?, admin_id = NULL 
           WHERE peminjaman_id = ?`,
          [fine, peminjamanId]
        );

        // Manually increase stock for books since no triggers handle this case
        const booksInReturn = await connection.query(
          `SELECT pd.buku_id, b.judul, b.stok
           FROM peminjaman_detail pd
           JOIN buku b ON pd.buku_id = b.id
           WHERE pd.peminjaman_id = ?`,
          [peminjamanId]
        );

        for (const book of booksInReturn[0]) {
          await connection.query(
            `UPDATE buku 
             SET stok = stok + 1, 
                 tersedia = TRUE 
             WHERE id = ?`,
            [book.buku_id]
          );
          console.log(
            `Increased stock for book ${book.judul} (ID: ${
              book.buku_id
            }) from ${book.stok} to ${book.stok + 1}`
          );
        }
      } else {
        console.log("Creating new pengembalian record - first time return");
        // Create new pengembalian record
        // Stock will be automatically increased by database triggers
        await connection.query(
          `INSERT INTO pengembalian (peminjaman_id, tanggal_dikembalikan, denda) 
           VALUES (?, NOW(), ?)`,
          [peminjamanId, fine]
        );
      }

      // Update peminjaman status to 'dikembalikan' (waiting for admin approval)
      await connection.query(
        "UPDATE peminjaman SET status = 'dikembalikan' WHERE id = ?",
        [peminjamanId]
      );

      await connection.commit();
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }

    res.json({
      success: true,
      status: true,
      message: "Return request created successfully",
      data: {
        peminjaman_id: parseInt(peminjamanId),
        return_date: new Date().toISOString(),
        fine: fine,
        days_overdue: daysOverdue,
        message:
          fine > 0
            ? `Your return request has been submitted with a fine of Rp ${fine.toLocaleString()} (${daysOverdue} days overdue)`
            : "Your return request has been submitted and is waiting for admin approval",
      },
    });
  } catch (error) {
    console.error("Create return request error:", error);
    console.error("Stack trace:", error.stack);
    res.status(500).json({
      success: false,
      message: "Server error creating return request",
      error: error.message,
      details: process.env.NODE_ENV === "development" ? error.stack : undefined,
    });
  }
});

module.exports = router;
