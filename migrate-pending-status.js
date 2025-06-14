const mysql = require("mysql2/promise");
require("dotenv").config();

async function migratePendingStatus() {
  const connection = await mysql.createConnection({
    host: process.env.DB_HOST || "localhost",
    user: process.env.DB_USER || "root",
    password: process.env.DB_PASSWORD || "",
    database: process.env.DB_NAME || "perpustakaan",
    port: process.env.DB_PORT || 3306,
  });

  try {
    console.log("🔄 Running migration to add all required statuses..."); // Alter the enum to include all 5 statuses
    await connection.query(`
      ALTER TABLE peminjaman 
      MODIFY COLUMN status ENUM('pending', 'dipinjam', 'dikembalikan', 'selesai', 'ditolak') NOT NULL
    `);

    console.log(
      "✅ Successfully added all statuses (pending, dipinjam, dikembalikan, selesai, ditolak) to peminjaman table"
    );

    // Update any views that might be affected
    try {
      await connection.query(
        "DROP VIEW IF EXISTS vw_daftar_peminjaman_anggota"
      );
      await connection.query(
        "DROP VIEW IF EXISTS vw_daftar_peminjaman_perpustakaan"
      );

      // Recreate views with updated status
      await connection.query(`
        CREATE VIEW vw_daftar_peminjaman_anggota AS
        SELECT 
            p.id as peminjaman_id,
            a.nama as nama_anggota,
            a.username,
            a.academic_role,
            p.tanggal_pinjam,
            p.tenggat_pengembalian,
            p.status,
            GROUP_CONCAT(b.judul SEPARATOR ', ') as buku_dipinjam,
            COUNT(pd.buku_id) as jumlah_buku
        FROM peminjaman p
        JOIN anggota a ON p.user_id = a.id
        JOIN peminjaman_detail pd ON p.id = pd.peminjaman_id
        JOIN buku b ON pd.buku_id = b.id
        GROUP BY p.id, a.nama, a.username, a.academic_role, p.tanggal_pinjam, p.tenggat_pengembalian, p.status
      `);

      await connection.query(`
        CREATE VIEW vw_daftar_peminjaman_perpustakaan AS
        SELECT 
            p.id as peminjaman_id,
            a.nama as nama_anggota,
            a.username,
            p.tanggal_pinjam,
            p.tenggat_pengembalian,
            p.status,
            COUNT(pd.buku_id) as total_buku
        FROM peminjaman p
        JOIN anggota a ON p.user_id = a.id
        JOIN peminjaman_detail pd ON p.id = pd.peminjaman_id
        GROUP BY p.id, a.nama, a.username, p.tanggal_pinjam, p.tenggat_pengembalian, p.status
      `);

      console.log("✅ Successfully updated database views");
    } catch (viewError) {
      console.log(
        "⚠️  Views update had issues (might not exist):",
        viewError.message
      );
    }

    console.log("🎉 Migration completed successfully!");
  } catch (error) {
    console.error("❌ Migration failed:", error.message);
    process.exit(1);
  } finally {
    await connection.end();
  }
}

// Run migration if this file is executed directly
if (require.main === module) {
  migratePendingStatus();
}

module.exports = { migratePendingStatus };
