const express = require("express");
const { executeQuery } = require("../config/database");

const router = express.Router();

// GET /api/books - Get all books (removed kategori filter)
router.get("/", async (req, res) => {
  try {
    const { tersedia, search, page = 1, limit = 10 } = req.query;

    let query = `
      SELECT 
    b.id,
    b.judul,
    b.tahun_terbit,
    b.kategori,
    b.id_penerbit,
    b.stok,
    b.tersedia,
    p.nama as penerbit_nama,
    p.alamat_jalan as penerbit_alamat,
    p.kota as penerbit_kota,
    GROUP_CONCAT(CONCAT(pg.nama_depan, ' ', pg.nama_belakang) SEPARATOR ', ') as pengarang_names,
    GROUP_CONCAT(pg.kewarganegaraan SEPARATOR ', ') as pengarang_countries
  FROM Buku b
  LEFT JOIN Penerbit p ON b.id_penerbit = p.id
  LEFT JOIN Buku_Pengarang bp ON b.id = bp.id_buku
  LEFT JOIN Pengarang pg ON bp.id_pengarang = pg.id
    `;

    const conditions = [];
    const params = [];

    // Remove kategori filter
    if (tersedia !== undefined) {
      conditions.push("b.tersedia = ?");
      params.push(tersedia === "true" ? 1 : 0);
    }

    if (search) {
      conditions.push(
        '(b.judul LIKE ? OR CONCAT(pg.nama_depan, " ", pg.nama_belakang) LIKE ? OR p.nama LIKE ?)'
      );
      params.push(`%${search}%`, `%${search}%`, `%${search}%`);
    }

    if (conditions.length > 0) {
      query += " WHERE " + conditions.join(" AND ");
    }

    query += " GROUP BY b.id, p.id ORDER BY b.id DESC";

    // Add pagination
    const offset = (page - 1) * limit;
    query += " LIMIT ? OFFSET ?";
    params.push(parseInt(limit), parseInt(offset));

    const books = await executeQuery(query, params);

    // Transform the data (removed kategori)
    const transformedBooks = books.map((book) => ({
      id: book.id,
      judul: book.judul,
      tahun_terbit: book.tahun_terbit,
      id_penerbit: book.id_penerbit,
      stok: book.stok,
      tersedia: Boolean(book.tersedia),
      cover_image: book.cover_image,
      synopsis: book.synopsis,
      isbn: book.isbn,
      penerbit_nama: book.penerbit_nama,
      penerbit: book.penerbit_nama
        ? {
            nama: book.penerbit_nama,
            alamat_jalan: book.penerbit_alamat,
            kota: book.penerbit_kota,
          }
        : null,
      pengarang: book.pengarang_names
        ? book.pengarang_names.split(", ").map((name, index) => {
            const countries = book.pengarang_countries
              ? book.pengarang_countries.split(", ")
              : [];
            const [nama_depan, ...nama_belakang_parts] = name.split(" ");
            return {
              nama_depan: nama_depan || "",
              nama_belakang: nama_belakang_parts.join(" ") || "",
              kewarganegaraan: countries[index] || "Unknown",
            };
          })
        : [],
    }));

    // Get total count for pagination (removed kategori from count query)
    let countQuery = "SELECT COUNT(DISTINCT b.id) as total FROM Buku b";
    const countConditions = [];
    const countParams = [];

    if (search) {
      countQuery +=
        " LEFT JOIN Buku_Pengarang bp ON b.id = bp.id_buku LEFT JOIN Pengarang pg ON bp.id_pengarang = pg.id LEFT JOIN Penerbit p ON b.id_penerbit = p.id";
    }

    if (tersedia !== undefined) {
      countConditions.push("b.tersedia = ?");
      countParams.push(tersedia === "true" ? 1 : 0);
    }

    if (search) {
      countConditions.push(
        '(b.judul LIKE ? OR CONCAT(pg.nama_depan, " ", pg.nama_belakang) LIKE ? OR p.nama LIKE ?)'
      );
      countParams.push(`%${search}%`, `%${search}%`, `%${search}%`);
    }

    if (countConditions.length > 0) {
      countQuery += " WHERE " + countConditions.join(" AND ");
    }

    const totalResult = await executeQuery(countQuery, countParams);
    const total = totalResult[0].total;

    res.json({
      status: true,
      message: "Books retrieved successfully",
      data: transformedBooks,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: parseInt(total),
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error("Get books error:", error);
    res.status(500).json({
      status: false,
      message: "Server error retrieving books",
      error: error.message,
    });
  }
});

// GET /api/books/:id - Get book details (removed kategori)
router.get("/:id", async (req, res) => {
  try {
    const { id } = req.params;

    const bookQuery = `
  SELECT 
    b.id,
    b.judul,
    b.tahun_terbit,
    b.kategori,
    b.id_penerbit,
    b.stok,
    b.tersedia,
    p.nama as penerbit_nama,
    p.alamat_jalan as penerbit_alamat,
    p.kota as penerbit_kota
  FROM Buku b
  LEFT JOIN Penerbit p ON b.id_penerbit = p.id
  WHERE b.id = ?
    `;

    const books = await executeQuery(bookQuery, [id]);

    if (books.length === 0) {
      return res.status(404).json({
        status: false,
        message: "Book not found",
      });
    }

    // Get authors
    const authorsQuery = `
      SELECT pg.id, pg.nama_depan, pg.nama_belakang, pg.kewarganegaraan
      FROM Pengarang pg
      JOIN Buku_Pengarang bp ON pg.id = bp.id_pengarang
      WHERE bp.id_buku = ?
    `;

    const authors = await executeQuery(authorsQuery, [id]);

    const book = {
      ...books[0],
      tersedia: Boolean(books[0].tersedia),
      penerbit: books[0].penerbit_nama
        ? {
            nama: books[0].penerbit_nama,
            alamat_jalan: books[0].penerbit_alamat,
            kota: books[0].penerbit_kota,
          }
        : null,
      pengarang: authors.map((author) => ({
        id: author.id,
        nama_depan: author.nama_depan,
        nama_belakang: author.nama_belakang,
        kewarganegaraan: author.kewarganegaraan,
      })),
    };

    res.json({
      status: true,
      message: "Book details retrieved successfully",
      data: book,
    });
  } catch (error) {
    console.error("Get book details error:", error);
    res.status(500).json({
      status: false,
      message: "Server error retrieving book details",
      error: error.message,
    });
  }
});

// GET /api/books/search - Search books (removed kategori from search)
router.get("/search", async (req, res) => {
  try {
    const { q: query, page = 1, limit = 10 } = req.query;

    if (!query) {
      return res.status(400).json({
        status: false,
        message: "Search query is required",
      });
    }

    const searchQuery = `
SELECT 
    b.id,
    b.judul,
    b.tahun_terbit,
    b.kategori,
    b.id_penerbit,
    b.stok,
    b.tersedia,
    p.nama as penerbit_nama,
    GROUP_CONCAT(CONCAT(pg.nama_depan, ' ', pg.nama_belakang) SEPARATOR ', ') as pengarang_names
  FROM Buku b
  LEFT JOIN Penerbit p ON b.id_penerbit = p.id
  LEFT JOIN Buku_Pengarang bp ON b.id = bp.id_buku
  LEFT JOIN Pengarang pg ON bp.id_pengarang = pg.id
  WHERE b.judul LIKE ? 
     OR CONCAT(pg.nama_depan, ' ', pg.nama_belakang) LIKE ?
     OR p.nama LIKE ?
  GROUP BY b.id
  ORDER BY b.judul
  LIMIT ? OFFSET ?
    `;

    const searchTerm = `%${query}%`;
    const offset = (page - 1) * limit;
    const books = await executeQuery(searchQuery, [
      searchTerm,
      searchTerm,
      searchTerm,
      parseInt(limit),
      parseInt(offset),
    ]);

    const transformedBooks = books.map((book) => ({
      ...book,
      tersedia: Boolean(book.tersedia),
      pengarang: book.pengarang_names ? book.pengarang_names.split(", ") : [],
    }));

    res.json({
      status: true,
      message: "Search results retrieved successfully",
      data: transformedBooks,
    });
  } catch (error) {
    console.error("Search books error:", error);
    res.status(500).json({
      status: false,
      message: "Server error searching books",
      error: error.message,
    });
  }
});

// POST /api/admin/books - Create new book (removed kategori)
router.post("/admin/books", async (req, res) => {
  try {
    const {
      judul,
      id_penerbit,
      tahun_terbit,
      stok,
      cover_image,
      synopsis,
      isbn,
      pengarang_ids,
    } = req.body;

    // Validate required fields (removed kategori)
    if (!judul || !id_penerbit || !tahun_terbit || stok === undefined) {
      return res.status(400).json({
        status: false,
        message:
          "Missing required fields: judul, id_penerbit, tahun_terbit, stok",
      });
    }

    // Insert book (removed kategori)
    const insertBookQuery = `
  INSERT INTO Buku (judul, id_penerbit, tahun_terbit, kategori, stok, tersedia)
  VALUES (?, ?, ?, ?, ?, ?)
    `;

    const bookResult = await executeQuery(insertBookQuery, [
      judul,
      id_penerbit,
      tahun_terbit,
      kategori,
      stok,
      stok > 0 ? 1 : 0,
    ]);

    const bookId = bookResult.insertId;

    // Insert book-author relationships
    if (
      pengarang_ids &&
      Array.isArray(pengarang_ids) &&
      pengarang_ids.length > 0
    ) {
      const authorInsertQuery = `
        INSERT INTO Buku_Pengarang (id_buku, id_pengarang) VALUES ?
      `;

      const authorValues = pengarang_ids.map((authorId) => [bookId, authorId]);
      await executeQuery(authorInsertQuery, [authorValues]);
    }

    res.status(201).json({
      status: true,
      message: "Book created successfully",
      data: { id: bookId },
    });
  } catch (error) {
    console.error("Create book error:", error);
    res.status(500).json({
      status: false,
      message: "Server error creating book",
      error: error.message,
    });
  }
});

// PUT /api/admin/books/:id - Update book (removed kategori)
router.put("/admin/books/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const {
      judul,
      id_penerbit,
      tahun_terbit,
      stok,
      cover_image,
      synopsis,
      isbn,
      pengarang_ids,
    } = req.body;

    // Check if book exists
    const checkBook = await executeQuery("SELECT id FROM Buku WHERE id = ?", [
      id,
    ]);
    if (checkBook.length === 0) {
      return res.status(404).json({
        status: false,
        message: "Book not found",
      });
    }

    // Update book (removed kategori)
    const updateQuery = `
  UPDATE Buku 
  SET judul = ?, id_penerbit = ?, tahun_terbit = ?, kategori = ?, 
      stok = ?, tersedia = ?
  WHERE id = ?
    `;

    await executeQuery(updateQuery, [
      judul,
      id_penerbit,
      tahun_terbit,
      kategori,
      stok,
      stok > 0 ? 1 : 0,
      id,
    ]);

    // Update book-author relationships
    if (pengarang_ids && Array.isArray(pengarang_ids)) {
      await executeQuery("DELETE FROM Buku_Pengarang WHERE id_buku = ?", [id]);

      if (pengarang_ids.length > 0) {
        const authorInsertQuery = `
          INSERT INTO Buku_Pengarang (id_buku, id_pengarang) VALUES ?
        `;
        const authorValues = pengarang_ids.map((authorId) => [id, authorId]);
        await executeQuery(authorInsertQuery, [authorValues]);
      }
    }

    res.json({
      status: true,
      message: "Book updated successfully",
    });
  } catch (error) {
    console.error("Update book error:", error);
    res.status(500).json({
      status: false,
      message: "Server error updating book",
      error: error.message,
    });
  }
});

// Other routes remain the same...
router.delete("/admin/books/:id", async (req, res) => {
  try {
    const { id } = req.params;

    const checkBook = await executeQuery("SELECT id FROM Buku WHERE id = ?", [
      id,
    ]);
    if (checkBook.length === 0) {
      return res.status(404).json({
        status: false,
        message: "Book not found",
      });
    }

    const activeBorrowings = await executeQuery(
      `
      SELECT COUNT(*) as count 
      FROM Peminjaman_Detail pd
      JOIN Peminjaman p ON pd.peminjaman_id = p.id
      WHERE pd.buku_id = ? AND p.status = 'dipinjam'
    `,
      [id]
    );

    if (activeBorrowings[0].count > 0) {
      return res.status(400).json({
        status: false,
        message: "Cannot delete book with active borrowings",
      });
    }

    await executeQuery("DELETE FROM Buku_Pengarang WHERE id_buku = ?", [id]);
    await executeQuery("DELETE FROM Buku WHERE id = ?", [id]);

    res.json({
      status: true,
      message: "Book deleted successfully",
    });
  } catch (error) {
    console.error("Delete book error:", error);
    res.status(500).json({
      status: false,
      message: "Server error deleting book",
      error: error.message,
    });
  }
});

router.post("/admin/books/:id/cover", async (req, res) => {
  try {
    const { id } = req.params;
    const { cover_image } = req.body;

    if (!cover_image) {
      return res.status(400).json({
        status: false,
        message: "Cover image URL is required",
      });
    }

    const checkBook = await executeQuery("SELECT id FROM Buku WHERE id = ?", [
      id,
    ]);
    if (checkBook.length === 0) {
      return res.status(404).json({
        status: false,
        message: "Book not found",
      });
    }

    await executeQuery("UPDATE Buku SET cover_image = ? WHERE id = ?", [
      cover_image,
      id,
    ]);

    res.json({
      status: true,
      message: "Book cover updated successfully",
    });
  } catch (error) {
    console.error("Update book cover error:", error);
    res.status(500).json({
      status: false,
      message: "Server error updating book cover",
      error: error.message,
    });
  }
});

module.exports = router;
