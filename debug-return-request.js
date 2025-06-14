require("dotenv").config();
const { executeQuery, connectToDatabase } = require("./src/config/database");

async function debugReturnRequest() {
  try {
    console.log("=== Debug Return Request ===");

    // Initialize database connection
    await connectToDatabase();

    // Check for active borrows
    const activeBorows = await executeQuery(`
      SELECT p.id, p.user_id, p.status, p.tanggal_pinjam, p.tenggat_pengembalian,
             b.judul, b.stok,
             pen.id as return_id, pen.admin_id, pen.tanggal_dikembalikan
      FROM peminjaman p
      JOIN peminjaman_detail pd ON p.id = pd.peminjaman_id
      JOIN buku b ON pd.buku_id = b.id
      LEFT JOIN pengembalian pen ON p.id = pen.peminjaman_id
      WHERE p.status = 'dipinjam'
      ORDER BY p.id DESC
      LIMIT 5
    `);

    console.log("Active borrows (status = dipinjam):");
    console.table(activeBorows);

    if (activeBorows.length > 0) {
      const testPeminjaman = activeBorows[0];
      console.log(`\nTesting return for peminjaman ID: ${testPeminjaman.id}`);
      console.log(`User ID: ${testPeminjaman.user_id}`);
      console.log(`Status: ${testPeminjaman.status}`);
      console.log(
        `Return record exists: ${testPeminjaman.return_id ? "Yes" : "No"}`
      );
      if (testPeminjaman.return_id) {
        console.log(`Return admin_id: ${testPeminjaman.admin_id}`);
      }

      // Calculate current status
      let currentStatus;
      if (testPeminjaman.status === "pending") {
        currentStatus = "waiting for approval";
      } else if (
        testPeminjaman.status === "dipinjam" &&
        !testPeminjaman.return_id
      ) {
        currentStatus = "borrowed";
      } else if (
        testPeminjaman.status === "dipinjam" &&
        testPeminjaman.return_id
      ) {
        currentStatus = "returned";
      } else if (testPeminjaman.status === "dikembalikan") {
        currentStatus = "waiting for return approval";
      } else if (testPeminjaman.status === "selesai") {
        currentStatus = "completed";
      } else if (testPeminjaman.status === "ditolak") {
        currentStatus = "rejected";
      }

      console.log(`Current status: ${currentStatus}`);
      console.log(
        `Can return: ${
          currentStatus === "borrowed" || currentStatus === "returned"
            ? "Yes"
            : "No"
        }`
      );
    }

    // Check all peminjaman statuses
    const statusCounts = await executeQuery(`
      SELECT status, COUNT(*) as count
      FROM peminjaman
      GROUP BY status
    `);

    console.log("\nPeminjaman status counts:");
    console.table(statusCounts);
  } catch (error) {
    console.error("Debug error:", error);
  } finally {
    process.exit(0);
  }
}

debugReturnRequest();
