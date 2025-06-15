const express = require("express");
const { executeQuery, executeTransaction } = require("../config/database");
const { authenticateToken, requireAdmin } = require("../middleware/auth");

const router = express.Router();

/*
 * ADMIN ROUTES
 *
 * Key Differences:
 * - GET /api/admin/requests -> Gets ALL borrowing requests from ALL users (admin view)
 * - GET /api/bookshelf/:id  -> Gets borrowing requests for a SPECIFIC user (user view)
 *
 * Admin can see:
 * - All users' borrowing history
 * - Filter by status (dipinjam, selesai)
 * - Filter by type (borrowed, returned, overdue, completed)
 * - User details (name, username, email, academic role)
 * - Book details with authors and publishers
 * - Return information and fines
 */

// GET /api/requests - Get all borrow and return requests (Admin only)
// GET /api/admin/requests - Get ALL borrowing requests from ALL users (Admin only)
// This is different from /bookshelf/:id which gets requests for a specific user
router.get("/requests", authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { status, type, page = 1, limit = 10 } = req.query;

    // Main query to get ALL borrowing requests with user and book details
    let query = `
      SELECT 
        p.id as peminjaman_id,
        p.tanggal_pinjam,
        p.tenggat_pengembalian,
        p.status as peminjaman_status,
        COALESCE(p.created_at, p.tanggal_pinjam) as created_at,
        a.id as user_id,
        a.nama as user_name,
        a.username,
        a.email,
        a.academic_role,
        a.no_induk,
        COUNT(DISTINCT pd.buku_id) as total_books,
        GROUP_CONCAT(DISTINCT b.judul ORDER BY b.judul SEPARATOR ', ') as book_titles,
        GROUP_CONCAT(DISTINCT CONCAT(pg.nama_depan, ' ', COALESCE(pg.nama_belakang, '')) ORDER BY pg.nama_depan SEPARATOR ', ') as book_authors,
        GROUP_CONCAT(DISTINCT pen.nama ORDER BY pen.nama SEPARATOR ', ') as publishers,        CASE 
          WHEN p.status = 'pending' THEN 'waiting for approval'
          WHEN p.status = 'dipinjam' AND peng.id IS NULL THEN 'borrowed'
          WHEN p.status = 'dipinjam' AND peng.id IS NOT NULL THEN 'returned'
          WHEN p.status = 'dikembalikan' THEN 'waiting for return approval'
          WHEN p.status = 'selesai' THEN 'completed'
          WHEN p.status = 'ditolak' THEN 'rejected'
          ELSE 'waiting for approval'
        END as current_status,
        MAX(peng.tanggal_dikembalikan) as return_date,
        SUM(COALESCE(peng.denda, 0)) as total_fine
      FROM Peminjaman p
      JOIN Anggota a ON p.user_id = a.id
      LEFT JOIN Peminjaman_Detail pd ON p.id = pd.peminjaman_id
      LEFT JOIN Buku b ON pd.buku_id = b.id
      LEFT JOIN Buku_Pengarang bp ON b.id = bp.id_buku
      LEFT JOIN Pengarang pg ON bp.id_pengarang = pg.id
      LEFT JOIN Penerbit pen ON b.id_penerbit = pen.id
      LEFT JOIN Pengembalian peng ON p.id = peng.peminjaman_id
    `;
    const conditions = [];
    const params = [];

    if (status) {
      conditions.push("p.status = ?");
      params.push(status);
    }
    if (type) {
      if (type === "waiting for approval") {
        conditions.push("p.status = 'pending'");
      } else if (type === "borrowed") {
        conditions.push("p.status = 'dipinjam' AND peng.id IS NULL");
      } else if (type === "returned") {
        conditions.push("p.status = 'dipinjam' AND peng.id IS NOT NULL");
      } else if (type === "waiting for return approval") {
        conditions.push("p.status = 'dikembalikan'");
      } else if (type === "completed") {
        conditions.push("p.status = 'selesai'");
      } else if (type === "rejected") {
        conditions.push("p.status = 'ditolak'");
      }
    }

    if (conditions.length > 0) {
      query += " WHERE " + conditions.join(" AND ");
    }

    query +=
      " GROUP BY p.id, a.id, a.nama, a.username, a.email, a.academic_role, a.no_induk ORDER BY COALESCE(p.created_at, p.tanggal_pinjam) DESC";

    const offset = (page - 1) * limit;
    query += " LIMIT ? OFFSET ?";
    params.push(parseInt(limit), parseInt(offset));

    const requests = await executeQuery(query, params); // Get total count for pagination
    let countQuery = `
      SELECT COUNT(DISTINCT p.id) as total
      FROM Peminjaman p
      JOIN Anggota a ON p.user_id = a.id
      LEFT JOIN Pengembalian peng ON p.id = peng.peminjaman_id
    `;

    if (conditions.length > 0) {
      countQuery += " WHERE " + conditions.join(" AND ");
    }

    const countParams = params.slice(0, -2); // Remove limit and offset
    const totalResult = await executeQuery(countQuery, countParams);
    const total = totalResult[0].total;
    res.json({
      success: true,
      message: "All borrowing requests from all users retrieved successfully",
      data: requests,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: parseInt(total),
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error("Get requests error:", error);
    res.status(500).json({
      success: false,
      message: "Server error retrieving requests",
      error: error.message,
    });
  }
});

// PATCH /api/admin/requests/:id - Update request status (Admin only)
router.patch(
  "/requests/:id",
  authenticateToken,
  requireAdmin,
  async (req, res) => {
    try {
      const { id } = req.params;
      const { action } = req.body; // action can be "approve" or "reject"

      // Validate action
      if (!["approve", "reject"].includes(action)) {
        return res.status(400).json({
          success: false,
          message: 'Action must be either "approve" or "reject"',
        });
      }

      // Check if request exists and is pending
      const existingRequest = await executeQuery(
        "SELECT * FROM peminjaman WHERE id = ? AND status = 'pending'",
        [id]
      );

      if (existingRequest.length === 0) {
        return res.status(404).json({
          success: false,
          message: "Pending request not found",
        });
      }

      const newStatus = action === "approve" ? "dipinjam" : "ditolak";

      // Use transaction for atomic operation
      const { getPool } = require("../config/database");
      const pool = getPool();
      const connection = await pool.getConnection();

      try {
        await connection.beginTransaction();

        // Update request status
        await connection.query(
          "UPDATE peminjaman SET status = ? WHERE id = ?",
          [newStatus, id]
        ); // If approved, stock is automatically updated by database triggers
        if (action === "approve") {
          // Since database triggers already decreased stock when request was created,
          // no additional stock validation or updates are needed here
          // The triggers handle stock management automatically
        } else if (action === "reject") {
          // For reject action, we need to restore stock since triggers decreased it
          // during request creation, but the books were never actually borrowed
          const bookDetails = await connection.query(
            `SELECT pd.buku_id, b.stok, b.judul 
             FROM peminjaman_detail pd 
             JOIN buku b ON pd.buku_id = b.id 
             WHERE pd.peminjaman_id = ?`,
            [id]
          );

          // Restore stock for each book that was decremented by triggers
          for (const book of bookDetails[0]) {
            await connection.query(
              `UPDATE buku 
               SET stok = stok + 1, 
                   tersedia = TRUE 
               WHERE id = ?`,
              [book.buku_id]
            );
          }
        }

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
        message: `Request ${action}d successfully`,
        data: {
          id: parseInt(id),
          action,
          new_status: newStatus,
          updated_by: req.user.id,
          updated_at: new Date().toISOString(),
        },
      });
    } catch (error) {
      console.error("Update request status error:", error);
      res.status(500).json({
        success: false,
        message: "Server error updating request status",
        error: error.message,
      });
    }
  }
);

// POST /api/admin/requests/:id/approve - Approve a pending borrow request
router.post(
  "/requests/:id/approve",
  authenticateToken,
  requireAdmin,
  async (req, res) => {
    try {
      const { id: peminjamanId } = req.params;

      // Check if the request exists and is pending
      const requestResult = await executeQuery(
        "SELECT * FROM peminjaman WHERE id = ? AND status = 'pending'",
        [peminjamanId]
      );

      if (requestResult.length === 0) {
        return res.status(404).json({
          success: false,
          message: "Pending borrow request not found",
        });
      } // Get books for this request (for logging purposes)
      const booksResult = await executeQuery(
        `
      SELECT pd.buku_id, b.judul, b.stok
      FROM peminjaman_detail pd
      JOIN buku b ON pd.buku_id = b.id
      WHERE pd.peminjaman_id = ?
    `,
        [peminjamanId]
      );

      // No stock availability check needed since database triggers
      // already decreased stock when the request was created// Use transaction to approve request
      const { getPool } = require("../config/database");
      const pool = getPool();
      const connection = await pool.getConnection();

      try {
        await connection.beginTransaction();

        // Update peminjaman status to 'dipinjam'
        await connection.query(
          "UPDATE peminjaman SET status = 'dipinjam' WHERE id = ?",
          [peminjamanId]
        );

        // Stock is automatically updated by database triggers
        // No manual stock update needed here

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
        message: "Borrow request approved successfully",
        data: {
          peminjaman_id: parseInt(peminjamanId),
          approved_books: booksResult.map((b) => b.judul).join(", "),
        },
      });
    } catch (error) {
      console.error("Approve request error:", error);
      res.status(500).json({
        success: false,
        message: "Server error approving request",
        error: error.message,
      });
    }
  }
);

// POST /api/admin/requests/:id/reject - Reject a pending borrow request
router.post(
  "/requests/:id/reject",
  authenticateToken,
  requireAdmin,
  async (req, res) => {
    try {
      const { id: peminjamanId } = req.params;
      const { reason } = req.body; // Optional rejection reason

      // Check if the request exists and is pending
      const requestResult = await executeQuery(
        "SELECT * FROM peminjaman WHERE id = ? AND status = 'pending'",
        [peminjamanId]
      );

      if (requestResult.length === 0) {
        return res.status(404).json({
          success: false,
          message: "Pending borrow request not found",
        });
      } // Get books for this request to restore stock
      const booksResult = await executeQuery(
        `SELECT pd.buku_id, b.judul, b.stok
         FROM peminjaman_detail pd
         JOIN buku b ON pd.buku_id = b.id
         WHERE pd.peminjaman_id = ?`,
        [peminjamanId]
      );

      // Use transaction to reject and restore stock
      const { getPool } = require("../config/database");
      const pool = getPool();
      const connection = await pool.getConnection();

      try {
        await connection.beginTransaction();

        // Update status to 'ditolak' (rejected)
        await connection.query(
          "UPDATE peminjaman SET status = 'ditolak' WHERE id = ?",
          [peminjamanId]
        );

        // Restore stock since triggers decreased it during request creation
        // but the books were never actually borrowed
        for (const book of booksResult) {
          await connection.query(
            `UPDATE buku 
             SET stok = stok + 1, 
                 tersedia = TRUE 
             WHERE id = ?`,
            [book.buku_id]
          );
        }

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
        message: "Borrow request rejected successfully",
        data: {
          peminjaman_id: parseInt(peminjamanId),
          reason: reason || "No reason provided",
        },
      });
    } catch (error) {
      console.error("Reject request error:", error);
      res.status(500).json({
        success: false,
        message: "Server error rejecting request",
        error: error.message,
      });
    }
  }
);

// GET /api/admin/statistics - Get borrowing statistics (Admin only)
router.get("/statistics", authenticateToken, requireAdmin, async (req, res) => {
  try {
    const statsQuery = `
      SELECT 
        COUNT(*) as total_requests,
        SUM(CASE WHEN p.status = 'pending' THEN 1 ELSE 0 END) as waiting_approval,
        SUM(CASE WHEN p.status = 'dipinjam' AND peng.id IS NULL THEN 1 ELSE 0 END) as borrowed,
        SUM(CASE WHEN p.status = 'dipinjam' AND peng.id IS NOT NULL THEN 1 ELSE 0 END) as returned,
        SUM(CASE WHEN p.status = 'dikembalikan' THEN 1 ELSE 0 END) as waiting_return_approval,
        SUM(CASE WHEN p.status = 'selesai' THEN 1 ELSE 0 END) as completed,
        SUM(CASE WHEN p.status = 'ditolak' THEN 1 ELSE 0 END) as rejected
      FROM Peminjaman p
      LEFT JOIN Pengembalian peng ON p.id = peng.peminjaman_id
    `;

    const stats = await executeQuery(statsQuery);

    res.json({
      success: true,
      message: "Statistics retrieved successfully",
      data: stats[0],
    });
  } catch (error) {
    console.error("Get statistics error:", error);
    res.status(500).json({
      success: false,
      message: "Server error retrieving statistics",
      error: error.message,
    });
  }
});

// POST /api/admin/returns/:id/approve - Approve a return request
router.post(
  "/returns/:id/approve",
  authenticateToken,
  requireAdmin,
  async (req, res) => {
    try {
      const { id: peminjamanId } = req.params;

      // Check if the return request exists and is in 'dikembalikan' status
      const requestResult = await executeQuery(
        `SELECT p.*, pen.denda, pen.tanggal_dikembalikan
         FROM peminjaman p
         JOIN pengembalian pen ON p.id = pen.peminjaman_id
         WHERE p.id = ? AND p.status = 'dikembalikan'`,
        [peminjamanId]
      );

      if (requestResult.length === 0) {
        return res.status(404).json({
          success: false,
          message: "Return request not found or not ready for approval",
        });
      }

      // Get books for this return to restore stock
      const booksResult = await executeQuery(
        `SELECT pd.buku_id, b.judul, b.stok
         FROM peminjaman_detail pd
         JOIN buku b ON pd.buku_id = b.id
         WHERE pd.peminjaman_id = ?`,
        [peminjamanId]
      );

      // Use transaction to approve return and restore stock
      const { getPool } = require("../config/database");
      const pool = getPool();
      const connection = await pool.getConnection();

      try {
        await connection.beginTransaction(); // Update peminjaman status to 'selesai' (completed)
        await connection.query(
          "UPDATE peminjaman SET status = 'selesai' WHERE id = ?",
          [peminjamanId]
        );

        // Stock is automatically restored by database triggers
        // No manual stock update needed here

        // Update pengembalian admin_id to mark as approved
        await connection.query(
          "UPDATE pengembalian SET admin_id = ? WHERE peminjaman_id = ?",
          [req.user.id, peminjamanId]
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
        message: "Return request approved successfully",
        data: {
          peminjaman_id: parseInt(peminjamanId),
          returned_books: booksResult.map((b) => b.judul).join(", "),
          fine: requestResult[0].denda,
        },
      });
    } catch (error) {
      console.error("Approve return error:", error);
      res.status(500).json({
        success: false,
        message: "Server error approving return",
        error: error.message,
      });
    }
  }
);

// POST /api/admin/returns/:id/reject - Reject a return request
router.post(
  "/returns/:id/reject",
  authenticateToken,
  requireAdmin,
  async (req, res) => {
    try {
      const { id: peminjamanId } = req.params;
      const { reason } = req.body; // Optional rejection reason

      // Check if the return request exists and is in 'dikembalikan' status
      const requestResult = await executeQuery(
        "SELECT * FROM peminjaman WHERE id = ? AND status = 'dikembalikan'",
        [peminjamanId]
      );

      if (requestResult.length === 0) {
        return res.status(404).json({
          success: false,
          message: "Return request not found or not ready for rejection",
        });
      }

      // Use transaction to reject return
      const { getPool } = require("../config/database");
      const pool = getPool();
      const connection = await pool.getConnection();
      try {
        await connection.beginTransaction();

        // Revert peminjaman status back to 'dipinjam' (still borrowed)
        await connection.query(
          "UPDATE peminjaman SET status = 'dipinjam' WHERE id = ?",
          [peminjamanId]
        );

        // Get books for this return to decrease stock (since books are still borrowed)
        const booksResult = await connection.query(
          `SELECT pd.buku_id, b.judul, b.stok
           FROM peminjaman_detail pd
           JOIN buku b ON pd.buku_id = b.id
           WHERE pd.peminjaman_id = ?`,
          [peminjamanId]
        ); // Decrease stock for each book since they're still borrowed
        for (const book of booksResult[0]) {
          await connection.query(
            `UPDATE buku 
             SET stok = stok - 1, 
                 tersedia = (stok - 1) > 0 
             WHERE id = ?`,
            [book.buku_id]
          );
        }

        // Mark pengembalian as rejected by setting admin_id to negative value
        // This way we keep the record but indicate it was rejected
        await connection.query(
          "UPDATE pengembalian SET admin_id = ? WHERE peminjaman_id = ?",
          [-req.user.id, peminjamanId] // Negative admin_id indicates rejection
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
        message: "Return request rejected successfully",
        data: {
          peminjaman_id: parseInt(peminjamanId),
          reason: reason || "No reason provided",
        },
      });
    } catch (error) {
      console.error("Reject return error:", error);
      res.status(500).json({
        success: false,
        message: "Server error rejecting return",
        error: error.message,
      });
    }
  }
);

// Database Views Endpoints

// Get vw_daftar_peminjaman_anggota
router.get(
  "/views/peminjaman-anggota",
  authenticateToken,
  requireAdmin,
  async (req, res) => {
    try {
      const result = await executeQuery(
        "SELECT * FROM vw_daftar_peminjaman_anggota"
      );      res.json({
        status: true,
        data: result,
      });
    } catch (error) {
      console.error("Error fetching peminjaman anggota view:", error);
      res.status(500).json({
        status: false,
        message: "Error fetching peminjaman anggota data",
        error: error.message,
      });
    }
  }
);

// Get vw_daftar_peminjaman_perpustakaan
router.get(
  "/views/peminjaman-perpustakaan",
  authenticateToken,
  requireAdmin,
  async (req, res) => {
    try {
      const result = await executeQuery(
        "SELECT * FROM vw_daftar_peminjaman_perpustakaan"
      );      res.json({
        status: true,
        data: result,
      });
    } catch (error) {
      console.error("Error fetching peminjaman perpustakaan view:", error);
      res.status(500).json({
        status: false,
        message: "Error fetching peminjaman perpustakaan data",
        error: error.message,
      });
    }
  }
);

// Get vw_daftar_pengembalian
router.get(
  "/views/pengembalian",
  authenticateToken,
  requireAdmin,
  async (req, res) => {
    try {
      const result = await executeQuery("SELECT * FROM vw_daftar_pengembalian");      res.json({
        status: true,
        data: result,
      });
    } catch (error) {
      console.error("Error fetching pengembalian view:", error);
      res.status(500).json({
        status: false,
        message: "Error fetching pengembalian data",
        error: error.message,
      });
    }
  }
);

// Get vw_laporan_buku_sering_dipinjam
router.get(
  "/views/buku-populer",
  authenticateToken,
  requireAdmin,
  async (req, res) => {
    try {
      const result = await executeQuery(
        "SELECT * FROM vw_laporan_buku_sering_dipinjam"
      );      res.json({
        status: true,
        data: result,
      });
    } catch (error) {
      console.error("Error fetching buku populer view:", error);
      res.status(500).json({
        status: false,
        message: "Error fetching buku populer data",
        error: error.message,
      });
    }
  }
);

// Get vw_statistik_perpustakaan
router.get(
  "/views/statistik",
  authenticateToken,
  requireAdmin,
  async (req, res) => {
    try {
      const result = await executeQuery(
        "SELECT * FROM vw_statistik_perpustakaan"
      );      res.json({
        status: true,
        data: result,
      });
    } catch (error) {
      console.error("Error fetching statistik view:", error);
      res.status(500).json({
        status: false,
        message: "Error fetching statistik data",
        error: error.message,
      });
    }
  }
);

module.exports = router;
