const express = require("express");
const { executeQuery } = require("../config/database");
const { authenticateToken } = require("../middleware/auth");

const router = express.Router();

// GET /api/bookshelf/:id - Get user's bookshelf (borrowed, returned, waiting for approval)
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

    // Updated query with only existing database fields
    let query = `
      SELECT 
        p.id as peminjaman_id,
        p.tanggal_pinjam,
        p.tenggat_pengembalian,
        p.status,
        p.tanggal_pinjam as request_date,
        b.id as book_id,
        b.judul as book_title,
        b.kategori,
        b.tahun_terbit,
        b.stok,
        b.tersedia,
        GROUP_CONCAT(CONCAT(pg.nama_depan, ' ', pg.nama_belakang) SEPARATOR ', ') as book_author,
        pen.nama as publisher,
        pen.alamat_jalan as publisher_address,
        pen.kota as publisher_city,
        pen2.tanggal_dikembalikan,
        pen2.denda,
        CASE 
          WHEN pen2.id IS NOT NULL THEN 'returned'
          WHEN p.status = 'dipinjam' THEN 'borrowed'
          ELSE p.status
        END as book_status
      FROM Peminjaman p
      JOIN Peminjaman_Detail pd ON p.id = pd.peminjaman_id
      JOIN Buku b ON pd.buku_id = b.id
      LEFT JOIN Buku_Pengarang bp ON b.id = bp.id_buku
      LEFT JOIN Pengarang pg ON bp.id_pengarang = pg.id
      LEFT JOIN Penerbit pen ON b.id_penerbit = pen.id
      LEFT JOIN Pengembalian pen2 ON p.id = pen2.peminjaman_id
      WHERE p.user_id = ?
    `;

    const params = [id];

    // Add status filter (only use actual database enum values)
    if (status) {
      if (status === "returned") {
        query += " AND pen2.id IS NOT NULL";
      } else if (status === "borrowed") {
        query += ' AND p.status = "dipinjam" AND pen2.id IS NULL';
      } else if (status === "dipinjam") {
        query += ' AND p.status = "dipinjam" AND pen2.id IS NULL';
      } else if (status === "selesai") {
        query += ' AND p.status = "selesai"';
      }
    }

    query += " GROUP BY p.id, b.id ORDER BY p.tanggal_pinjam DESC";

    // Add pagination
    const offset = (page - 1) * limit;
    query += " LIMIT ? OFFSET ?";
    params.push(parseInt(limit), parseInt(offset));

    const bookshelf = await executeQuery(query, params);

    // Get total count - only use existing tables and fields
    let countQuery = `
      SELECT COUNT(DISTINCT CONCAT(p.id, '-', b.id)) as total
      FROM Peminjaman p
      JOIN Peminjaman_Detail pd ON p.id = pd.peminjaman_id
      JOIN Buku b ON pd.buku_id = b.id
      LEFT JOIN Pengembalian pen2 ON p.id = pen2.peminjaman_id
      WHERE p.user_id = ?
    `;

    let countParams = [id];

    if (status) {
      if (status === "returned") {
        countQuery += " AND pen2.id IS NOT NULL";
      } else if (status === "borrowed") {
        countQuery += ' AND p.status = "dipinjam" AND pen2.id IS NULL';
      } else if (status === "dipinjam") {
        countQuery += ' AND p.status = "dipinjam" AND pen2.id IS NULL';
      } else if (status === "selesai") {
        countQuery += ' AND p.status = "selesai"';
      }
    }

    const totalResult = await executeQuery(countQuery, countParams);
    const total = totalResult[0].total;

    // Get user info from Anggota table (only existing fields)
    const userInfo = await executeQuery(
      "SELECT nama, username, email, academic_role, no_induk FROM Anggota WHERE id = ?",
      [id]
    );

    // Transform data to include only existing fields
    const transformedBooks = bookshelf.map(book => ({
      peminjaman_id: book.peminjaman_id,
      book_id: book.book_id,
      book_title: book.book_title,
      book_author: book.book_author,
      kategori: book.kategori,
      tahun_terbit: book.tahun_terbit,
      stok: book.stok,
      tersedia: Boolean(book.tersedia),
      publisher: book.publisher,
      publisher_address: book.publisher_address,
      publisher_city: book.publisher_city,
      tanggal_pinjam: book.tanggal_pinjam,
      tenggat_pengembalian: book.tenggat_pengembalian,
      status: book.status,
      book_status: book.book_status,
      tanggal_dikembalikan: book.tanggal_dikembalikan,
      denda: book.denda || 0,
      request_date: book.request_date
    }));

    res.json({
      success: true,
      message: "Bookshelf retrieved successfully",
      data: {
        user: userInfo[0] || null,
        books: transformedBooks,
        summary: {
          total_requests: total,
          borrowed: transformedBooks.filter((book) => book.book_status === "borrowed").length,
          returned: transformedBooks.filter((book) => book.book_status === "returned").length,
          dipinjam: transformedBooks.filter((book) => book.status === "dipinjam").length,
          selesai: transformedBooks.filter((book) => book.status === "selesai").length,
        },
      },
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: parseInt(total),
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error("Get bookshelf error:", error);
    res.status(500).json({
      success: false,
      message: "Server error retrieving bookshelf",
      error: error.message,
    });
  }
});

// GET /api/bookshelf/:id/summary - Get bookshelf summary using only existing fields
router.get("/:id/summary", authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;

    if (req.user.type !== "admin" && req.user.id !== parseInt(id)) {
      return res.status(403).json({
        success: false,
        message: "Access denied.",
      });
    }

    // Summary query using only existing database fields
    const summaryQuery = `
      SELECT 
        COUNT(DISTINCT CASE WHEN p.status = 'dipinjam' AND pen.id IS NULL THEN p.id END) as currently_borrowed,
        COUNT(DISTINCT CASE WHEN pen.id IS NOT NULL THEN p.id END) as total_returned,
        COUNT(DISTINCT p.id) as total_borrowings,
        COALESCE(SUM(pen.denda), 0) as total_fines,
        COUNT(DISTINCT CASE WHEN p.tenggat_pengembalian < NOW() AND p.status = 'dipinjam' AND pen.id IS NULL THEN p.id END) as overdue_count
      FROM Peminjaman p
      LEFT JOIN Pengembalian pen ON p.id = pen.peminjaman_id
      WHERE p.user_id = ?
    `;

    const summaryResult = await executeQuery(summaryQuery, [id]);
    const summary = summaryResult[0];

    res.json({
      success: true,
      message: 'Bookshelf summary retrieved successfully',
      data: {
        currently_borrowed: parseInt(summary.currently_borrowed),
        total_returned: parseInt(summary.total_returned),
        total_borrowings: parseInt(summary.total_borrowings),
        total_fines: parseFloat(summary.total_fines),
        overdue_count: parseInt(summary.overdue_count)
      }
    });

  } catch (error) {
    console.error('Get bookshelf summary error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error retrieving bookshelf summary',
      error: error.message
    });
  }
});

// GET /api/bookshelf/:id/history - Get borrowing history from Log_Peminjaman
router.get("/:id/history", authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { page = 1, limit = 20 } = req.query;

    if (req.user.type !== "admin" && req.user.id !== parseInt(id)) {
      return res.status(403).json({
        success: false,
        message: "Access denied.",
      });
    }

    // Get history from Log_Peminjaman table (existing table)
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
    const historyResult = await executeQuery(historyQuery, [id, parseInt(limit), parseInt(offset)]);

    // Get total count
    const countResult = await executeQuery(
      'SELECT COUNT(*) as total FROM Log_Peminjaman WHERE user_id = ?',
      [id]
    );

    res.json({
      success: true,
      message: 'Borrowing history retrieved successfully',
      data: historyResult,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: parseInt(countResult[0].total),
        totalPages: Math.ceil(countResult[0].total / limit)
      }
    });

  } catch (error) {
    console.error('Get borrowing history error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error retrieving borrowing history',
      error: error.message
    });
  }
});

module.exports = router;