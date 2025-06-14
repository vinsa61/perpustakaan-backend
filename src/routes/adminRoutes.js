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
          WHEN p.status = 'selesai' THEN 'completed'
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
    `; // Add filtering conditions
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
      } else if (type === "completed") {
        conditions.push("p.status = 'selesai'");
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

// PATCH /api/requests/:id - Update request status (Admin only)
router.patch(
  "/requests/:id",
  authenticateToken,
  requireAdmin,
  async (req, res) => {
    try {
      const { id } = req.params;
      const { status } = req.body;

      // Validate status
      if (!["approved", "rejected"].includes(status)) {
        return res.status(400).json({
          success: false,
          message: 'Status must be either "approved" or "rejected"',
        });
      }

      // Check if request exists
      const existingRequest = await executeQuery(
        "SELECT * FROM Peminjaman WHERE id = ?",
        [id]
      );

      if (existingRequest.length === 0) {
        return res.status(404).json({
          success: false,
          message: "Request not found",
        });
      }

      if (existingRequest[0].status !== "pending") {
        return res.status(400).json({
          success: false,
          message: "Can only update pending requests",
        });
      }

      // Update request status
      await executeQuery(
        "UPDATE Peminjaman SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
        [status, id]
      );

      // If approved, update book availability
      if (status === "approved") {
        const bookDetails = await executeQuery(
          `
        SELECT pd.buku_id, b.stok 
        FROM Peminjaman_Detail pd 
        JOIN Buku b ON pd.buku_id = b.id 
        WHERE pd.peminjaman_id = ?
      `,
          [id]
        );

        for (const book of bookDetails) {
          const newStok = book.stok - 1;
          const tersedia = newStok > 0;

          await executeQuery(
            "UPDATE Buku SET stok = ?, tersedia = ? WHERE id = ?",
            [newStok, tersedia, book.buku_id]
          );
        }
      }

      res.json({
        success: true,
        message: `Request ${status} successfully`,
        data: {
          id: parseInt(id),
          status,
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

// GET /api/admin/statistics - Get borrowing statistics (Admin only)
router.get("/statistics", authenticateToken, requireAdmin, async (req, res) => {
  try {
    // Get statistics query
    const statsQuery = `
      SELECT 
        COUNT(*) as total_requests,
        SUM(CASE WHEN p.status = 'pending' THEN 1 ELSE 0 END) as waiting_approval,
        SUM(CASE WHEN p.status = 'dipinjam' AND peng.id IS NULL THEN 1 ELSE 0 END) as borrowed,
        SUM(CASE WHEN p.status = 'dipinjam' AND peng.id IS NOT NULL THEN 1 ELSE 0 END) as returned,
        SUM(CASE WHEN p.status = 'selesai' THEN 1 ELSE 0 END) as completed
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

module.exports = router;
