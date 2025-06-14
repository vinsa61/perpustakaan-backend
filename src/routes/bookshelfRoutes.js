const express = require("express");
const { executeQuery } = require("../config/database");
const { authenticateToken } = require("../middleware/auth");

const router = express.Router();

// GET /api/bookshelf/:id - Get all borrow requests for a specific user
router.get("/:id", authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { status, page = 1, limit = 10 } = req.query;

    // Check if user can access this bookshelf (own bookshelf or admin)
    if (req.user.type !== "admin" && req.user.id !== parseInt(id)) {
      return res.status(403).json({
        success: false,
        message: "Access denied. You can only view your own bookshelf.",
      });
    }

    // Replace the main query in the bookshelf route (around line 18-56):
    let query = `
  SELECT 
    p.id as peminjaman_id,
    p.tanggal_pinjam,
    p.tenggat_pengembalian,
    p.status as peminjaman_status,
    pd.id as detail_id,
    b.id as book_id,
    b.judul as book_title,
    b.kategori,
    b.tahun_terbit,
    b.stok,
    b.tersedia,
    GROUP_CONCAT(DISTINCT CONCAT(pg.nama_depan, ' ', pg.nama_belakang) SEPARATOR ', ') as book_authors,
    pen.nama as publisher_name,
    pen.alamat_jalan as publisher_address,
    pen.kota as publisher_city,
    peng.tanggal_dikembalikan,
    peng.denda,
    peng.admin_id,
    a.nama as admin_name,    CASE 
      WHEN p.status = 'pending' THEN 'waiting for approval'
      WHEN p.status = 'dipinjam' AND peng.id IS NULL THEN 'borrowed'
      WHEN p.status = 'dipinjam' AND peng.id IS NOT NULL THEN 'returned'
      WHEN p.status = 'selesai' THEN 'completed'
      WHEN p.status = 'ditolak' THEN 'rejected'
      ELSE 'waiting for approval'
    END as current_status,CASE 
      WHEN p.status = 'pending' THEN 'waiting for approval'
      WHEN p.status = 'dipinjam' AND peng.id IS NULL THEN 'borrowed'
      WHEN p.status = 'dipinjam' AND peng.id IS NOT NULL THEN 'returned'
      WHEN p.status = 'selesai' THEN 'completed'
      WHEN p.status = 'ditolak' THEN 'rejected'
      ELSE 'waiting for approval'
    END as status_detail
  FROM Peminjaman p
  JOIN Peminjaman_Detail pd ON p.id = pd.peminjaman_id
  JOIN Buku b ON pd.buku_id = b.id
  LEFT JOIN Buku_Pengarang bp ON b.id = bp.id_buku
  LEFT JOIN Pengarang pg ON bp.id_pengarang = pg.id
  LEFT JOIN Penerbit pen ON b.id_penerbit = pen.id
  LEFT JOIN Pengembalian peng ON p.id = peng.peminjaman_id
  LEFT JOIN Admin a ON peng.admin_id = a.id
  WHERE p.user_id = ?
`;
    const params = [id]; // Add status filter based on the new 5-state system
    if (status) {
      if (status === "waiting for approval") {
        query += " AND p.status = 'pending'";
      } else if (status === "borrowed") {
        query += " AND p.status = 'dipinjam' AND peng.id IS NULL";
      } else if (status === "returned") {
        query += " AND p.status = 'dipinjam' AND peng.id IS NOT NULL";
      } else if (status === "completed") {
        query += " AND p.status = 'selesai'";
      } else if (status === "rejected") {
        query += " AND p.status = 'ditolak'";
      }
    }

    // Fix the GROUP BY clause to include all non-aggregated columns
    query += ` 
  GROUP BY 
    p.id, p.tanggal_pinjam, p.tenggat_pengembalian, p.status,
    pd.id, 
    b.id, b.judul, b.kategori, b.tahun_terbit, b.stok, b.tersedia,
    pen.nama, pen.alamat_jalan, pen.kota,
    peng.id, peng.tanggal_dikembalikan, peng.denda, peng.admin_id,
    a.nama
  ORDER BY p.tanggal_pinjam DESC
`;

    // Add pagination
    const offset = (page - 1) * limit;
    query += " LIMIT ? OFFSET ?";
    params.push(parseInt(limit), parseInt(offset));

    const bookshelf = await executeQuery(query, params);

    // Get total count for pagination
    let countQuery = `
      SELECT COUNT(DISTINCT CONCAT(p.id, '-', pd.id)) as total
      FROM Peminjaman p
      JOIN Peminjaman_Detail pd ON p.id = pd.peminjaman_id
      JOIN Buku b ON pd.buku_id = b.id
      LEFT JOIN Pengembalian peng ON p.id = peng.peminjaman_id
      WHERE p.user_id = ?
    `;

    let countParams = [id];

    // Apply same status filter to count query
    if (status) {
      if (status === "returned") {
        countQuery += " AND peng.id IS NOT NULL";
      } else if (status === "borrowed" || status === "dipinjam") {
        countQuery += ' AND p.status = "dipinjam" AND peng.id IS NULL';
      } else if (status === "completed" || status === "selesai") {
        countQuery += ' AND p.status = "selesai"';
      } else if (status === "overdue") {
        countQuery +=
          ' AND p.status = "dipinjam" AND p.tenggat_pengembalian < NOW() AND peng.id IS NULL';
      }
    }

    const totalResult = await executeQuery(countQuery, countParams);
    const total = totalResult[0].total;

    // Get user info from Anggota table
    const userInfo = await executeQuery(
      "SELECT nama, username, email, academic_role, no_induk FROM Anggota WHERE id = ?",
      [id]
    );

    // Transform data to match the expected structure
    const transformedBooks = bookshelf.map((book) => ({
      peminjaman_id: book.peminjaman_id,
      detail_id: book.detail_id,
      book_id: book.book_id,
      book_title: book.book_title,
      book_authors: book.book_authors ? book.book_authors.split(", ") : [],
      kategori: book.kategori,
      tahun_terbit: book.tahun_terbit,
      stok: book.stok,
      tersedia: Boolean(book.tersedia),
      publisher: {
        name: book.publisher_name,
        address: book.publisher_address,
        city: book.publisher_city,
      },
      borrow_info: {
        tanggal_pinjam: book.tanggal_pinjam,
        tenggat_pengembalian: book.tenggat_pengembalian,
        peminjaman_status: book.peminjaman_status,
        current_status: book.current_status,
        status_detail: book.status_detail,
        days_overdue: book.days_overdue,
      },
      return_info: book.tanggal_dikembalikan
        ? {
            tanggal_dikembalikan: book.tanggal_dikembalikan,
            denda: book.denda || 0,
            admin_id: book.admin_id,
            admin_name: book.admin_name,
          }
        : null,
    })); // Calculate summary statistics
    const summary = {
      total_requests: total,
      active_borrowed: transformedBooks.filter(
        (book) => book.borrow_info.current_status === "borrowed"
      ).length,
      returned: transformedBooks.filter(
        (book) => book.borrow_info.current_status === "returned"
      ).length,
      completed: transformedBooks.filter(
        (book) => book.borrow_info.current_status === "completed"
      ).length,
      rejected: transformedBooks.filter(
        (book) => book.borrow_info.current_status === "rejected"
      ).length,
      overdue: transformedBooks.filter(
        (book) => book.borrow_info.status_detail === "overdue"
      ).length,
    };

    res.json({
      success: true,
      message: "User bookshelf retrieved successfully",
      data: {
        user: userInfo[0] || null,
        borrow_requests: transformedBooks,
        summary: summary,
      },
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: parseInt(total),
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error("Get user bookshelf error:", error);
    res.status(500).json({
      success: false,
      message: "Server error retrieving user bookshelf",
      error: error.message,
    });
  }
});

// GET /api/bookshelf/:id/summary - Get borrowing summary statistics
router.get("/:id/summary", authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;

    // Check access permissions
    if (req.user.type !== "admin" && req.user.id !== parseInt(id)) {
      return res.status(403).json({
        success: false,
        message: "Access denied. You can only view your own bookshelf.",
      });
    }

    // Get comprehensive borrowing statistics
    const summaryQuery = `
      SELECT 
        COUNT(DISTINCT CASE WHEN p.status = 'dipinjam' AND peng.id IS NULL THEN p.id END) as currently_borrowed,
        COUNT(DISTINCT CASE WHEN peng.id IS NOT NULL THEN p.id END) as total_returned,
        COUNT(DISTINCT p.id) as total_borrowings,
        COALESCE(SUM(peng.denda), 0) as total_fines,
        COUNT(DISTINCT CASE WHEN p.tenggat_pengembalian < NOW() AND p.status = 'dipinjam' AND peng.id IS NULL THEN p.id END) as overdue_count
      FROM Peminjaman p
      LEFT JOIN Pengembalian peng ON p.id = peng.peminjaman_id
      WHERE p.user_id = ?
    `;

    const summaryResult = await executeQuery(summaryQuery, [id]);
    const summary = summaryResult[0];

    res.json({
      success: true,
      message: "Bookshelf summary retrieved successfully",
      data: {
        currently_borrowed: parseInt(summary.currently_borrowed),
        total_returned: parseInt(summary.total_returned),
        total_borrowings: parseInt(summary.total_borrowings),
        total_fines: parseFloat(summary.total_fines),
        overdue_count: parseInt(summary.overdue_count),
      },
    });
  } catch (error) {
    console.error("Get bookshelf summary error:", error);
    res.status(500).json({
      success: false,
      message: "Server error retrieving bookshelf summary",
      error: error.message,
    });
  }
});

// GET /api/bookshelf/:id/history - Get borrowing history from Log_Peminjaman
router.get("/:id/history", authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { page = 1, limit = 20 } = req.query;

    // Check access permissions
    if (req.user.type !== "admin" && req.user.id !== parseInt(id)) {
      return res.status(403).json({
        success: false,
        message: "Access denied.",
      });
    }

    // Get history from Log_Peminjaman table
    const historyQuery = `
      SELECT 
        lp.id,
        lp.aksi,
        lp.tanggal_aksi,
        lp.jumlah_buku,
        lp.keterangan,
        p.id as peminjaman_id,
        p.tanggal_pinjam,
        p.tenggat_pengembalian,
        p.status as peminjaman_status
      FROM Log_Peminjaman lp
      JOIN Peminjaman p ON lp.peminjaman_id = p.id
      WHERE lp.user_id = ?
      ORDER BY lp.tanggal_aksi DESC
      LIMIT ? OFFSET ?
    `;

    const offset = (page - 1) * limit;
    const historyResult = await executeQuery(historyQuery, [
      id,
      parseInt(limit),
      parseInt(offset),
    ]);

    // Get total count
    const countResult = await executeQuery(
      "SELECT COUNT(*) as total FROM Log_Peminjaman WHERE user_id = ?",
      [id]
    );

    res.json({
      success: true,
      message: "Borrowing history retrieved successfully",
      data: historyResult,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: parseInt(countResult[0].total),
        totalPages: Math.ceil(countResult[0].total / limit),
      },
    });
  } catch (error) {
    console.error("Get borrowing history error:", error);
    res.status(500).json({
      success: false,
      message: "Server error retrieving borrowing history",
      error: error.message,
    });
  }
});

// GET /api/bookshelf/:id/statistics - Get borrowing statistics for a specific user
router.get("/:id/statistics", authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;

    // Check if user can access this bookshelf (own bookshelf or admin)
    if (req.user.type !== "admin" && req.user.id !== parseInt(id)) {
      return res.status(403).json({
        success: false,
        message:
          "Access denied. You can only view your own bookshelf statistics.",
      });
    } // Get statistics query for specific user
    const statsQuery = `
      SELECT 
        COUNT(*) as total_requests,
        SUM(CASE WHEN p.status = 'pending' THEN 1 ELSE 0 END) as waiting_approval,
        SUM(CASE WHEN p.status = 'dipinjam' AND peng.id IS NULL THEN 1 ELSE 0 END) as borrowed,
        SUM(CASE WHEN p.status = 'dipinjam' AND peng.id IS NOT NULL THEN 1 ELSE 0 END) as returned,
        SUM(CASE WHEN p.status = 'selesai' THEN 1 ELSE 0 END) as completed,
        SUM(CASE WHEN p.status = 'ditolak' THEN 1 ELSE 0 END) as rejected
      FROM Peminjaman p
      LEFT JOIN Pengembalian peng ON p.id = peng.peminjaman_id
      WHERE p.user_id = ?
    `;

    const stats = await executeQuery(statsQuery, [id]);

    res.json({
      success: true,
      message: "User bookshelf statistics retrieved successfully",
      data: stats[0],
    });
  } catch (error) {
    console.error("Get bookshelf statistics error:", error);
    res.status(500).json({
      success: false,
      message: "Server error retrieving bookshelf statistics",
      error: error.message,
    });
  }
});

module.exports = router;
