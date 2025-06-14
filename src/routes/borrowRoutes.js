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
    }

    // Check if books are available
    const unavailableBooks = books.filter(
      (book) => !book.tersedia || book.stok <= 0
    );
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
      );
      peminjamanId = maxIdResult[0].next_id; // Create peminjaman record with explicit ID and pending status
      // After running migration, this will use 'pending' status for approval workflow
      await connection.query(
        `INSERT INTO peminjaman (id, user_id, tanggal_pinjam, tenggat_pengembalian, status, created_at) 
         VALUES (?, ?, NOW(), DATE_ADD(NOW(), INTERVAL 14 DAY), 'pending', NOW())`,
        [peminjamanId, userId]
      ); // Get next available starting ID for peminjaman_detail
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
    const userId = req.user.id; // Check if peminjaman exists and belongs to user
    const peminjamanResult = await executeQuery(
      "SELECT * FROM peminjaman WHERE id = ? AND user_id = ? AND status = 'dipinjam'",
      [peminjamanId, userId]
    );

    if (peminjamanResult.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Borrow record not found or not eligible for return",
      });
    }

    // Check if return already exists
    const existingReturnResult = await executeQuery(
      "SELECT * FROM pengembalian WHERE peminjaman_id = ?",
      [peminjamanId]
    );

    if (existingReturnResult.length > 0) {
      return res.status(400).json({
        success: false,
        message: "Return request already exists for this borrow",
      });
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
      await connection.beginTransaction();

      // Create return record
      await connection.query(
        `INSERT INTO pengembalian (peminjaman_id, tanggal_dikembalikan, denda, status, created_at) 
         VALUES (?, NOW(), ?, 'pending', NOW())`,
        [peminjamanId, fine]
      );

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
    res.status(500).json({
      success: false,
      message: "Server error creating return request",
      error: error.message,
    });
  }
});

// Debug endpoint to test database connectivity
router.get("/debug", async (req, res) => {
  try {
    // Test basic connectivity
    const dbTest = await executeQuery("SELECT 1 as test");

    // Test table structure
    const tableTest = await executeQuery("SHOW TABLES LIKE 'buku'");
    const columnTest = await executeQuery("DESCRIBE buku");

    // Test sample data
    const bookTest = await executeQuery(
      "SELECT id, judul, stok, tersedia FROM buku LIMIT 3"
    );

    res.json({
      success: true,
      message: "Database connection test",
      data: {
        connectivity: dbTest,
        tableExists: tableTest.length > 0,
        columns: columnTest,
        sampleBooks: bookTest,
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Database test failed",
      error: error.message,
    });
  }
});

module.exports = router;
