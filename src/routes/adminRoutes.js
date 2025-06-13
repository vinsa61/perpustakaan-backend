const express = require('express');
const { executeQuery, executeTransaction } = require('../config/database');
const { authenticateToken, requireAdmin } = require('../middleware/auth');

const router = express.Router();

// GET /api/requests - Get all borrow and return requests (Admin only)
router.get('/requests', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { status, type, page = 1, limit = 10 } = req.query;

    let query = `
      SELECT 
        p.id,
        p.tanggal_pinjam,
        p.tenggat_pengembalian,
        p.status,
        p.created_at,
        ANY_VALUE(a.id) as user_id,
        ANY_VALUE(a.nama) as user_name,
        ANY_VALUE(a.username) as username,
        ANY_VALUE(a.email) as email,
        ANY_VALUE(a.academic_role) as academic_role,
        ANY_VALUE(a.no_induk) as no_induk,
        ANY_VALUE(b.id) as book_id,
        ANY_VALUE(b.judul) as book_title,
        GROUP_CONCAT(CONCAT(pg.nama_depan, ' ', pg.nama_belakang) SEPARATOR ', ') as book_author,
        ANY_VALUE(pen.nama) as publisher,
        CASE 
          WHEN MAX(pg2.id) IS NOT NULL THEN 'return'
          ELSE 'borrow'
        END as request_type
      FROM Peminjaman p
      JOIN Anggota a ON p.user_id = a.id
      JOIN Peminjaman_Detail pd ON p.id = pd.peminjaman_id
      JOIN Buku b ON pd.buku_id = b.id
      LEFT JOIN Buku_Pengarang bp ON b.id = bp.id_buku
      LEFT JOIN Pengarang pg ON bp.id_pengarang = pg.id
      LEFT JOIN Penerbit pen ON b.id_penerbit = pen.id
      LEFT JOIN Pengembalian pg2 ON p.id = pg2.peminjaman_id
    `;

    const conditions = [];
    const params = [];

    if (status) {
      conditions.push('p.status = ?');
      params.push(status);
    }

    if (type) {
      if (type === 'borrow') {
        conditions.push('pg2.id IS NULL');
      } else if (type === 'return') {
        conditions.push('pg2.id IS NOT NULL');
      }
    }

    if (conditions.length > 0) {
      query += ' WHERE ' + conditions.join(' AND ');
    }

    query += ' GROUP BY p.id ORDER BY p.created_at DESC';

    const offset = (page - 1) * limit;
    query += ' LIMIT ? OFFSET ?';
    params.push(parseInt(limit), parseInt(offset));

    const requests = await executeQuery(query, params);

    // Get total count
    let countQuery = `
      SELECT COUNT(DISTINCT p.id) as total
      FROM Peminjaman p
      JOIN Anggota a ON p.user_id = a.id
      LEFT JOIN Pengembalian pg2 ON p.id = pg2.peminjaman_id
    `;

    if (conditions.length > 0) {
      countQuery += ' WHERE ' + conditions.join(' AND ');
    }

    const countParams = params.slice(0, -2); // Remove limit and offset
    const totalResult = await executeQuery(countQuery, countParams);
    const total = totalResult[0].total;

    res.json({
      success: true,
      message: 'Requests retrieved successfully',
      data: requests,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: parseInt(total),
        totalPages: Math.ceil(total / limit)
      }
    });

  } catch (error) {
    console.error('Get requests error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error retrieving requests',
      error: error.message
    });
  }
});

// PATCH /api/requests/:id - Update request status (Admin only)
router.patch('/requests/:id', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    // Validate status
    if (!['approved', 'rejected'].includes(status)) {
      return res.status(400).json({
        success: false,
        message: 'Status must be either "approved" or "rejected"'
      });
    }

    // Check if request exists
    const existingRequest = await executeQuery(
      'SELECT * FROM Peminjaman WHERE id = ?',
      [id]
    );

    if (existingRequest.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Request not found'
      });
    }

    if (existingRequest[0].status !== 'pending') {
      return res.status(400).json({
        success: false,
        message: 'Can only update pending requests'
      });
    }

    // Update request status
    await executeQuery(
      'UPDATE Peminjaman SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      [status, id]
    );

    // If approved, update book availability
    if (status === 'approved') {
      const bookDetails = await executeQuery(`
        SELECT pd.buku_id, b.stok 
        FROM Peminjaman_Detail pd 
        JOIN Buku b ON pd.buku_id = b.id 
        WHERE pd.peminjaman_id = ?
      `, [id]);

      for (const book of bookDetails) {
        const newStok = book.stok - 1;
        const tersedia = newStok > 0;
        
        await executeQuery(
          'UPDATE Buku SET stok = ?, tersedia = ? WHERE id = ?',
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
        updated_at: new Date().toISOString()
      }
    });

  } catch (error) {
    console.error('Update request status error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error updating request status',
      error: error.message
    });
  }
});

module.exports = router;
