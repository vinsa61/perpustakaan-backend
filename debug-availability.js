/**
 * Debug script to understand trigger behavior and stock availability
 */

const { executeQuery, connectToDatabase } = require("./src/config/database");

async function debugStockAvailability() {
  console.log("🔍 Debugging stock availability logic...\n");

  try {
    // Connect to database
    console.log("Connecting to database...");
    await connectToDatabase();

    // 1. Check current triggers
    console.log("1. Current database triggers:");
    const triggers = await executeQuery("SHOW TRIGGERS");
    console.table(
      triggers.map((t) => ({
        name: t.Trigger,
        table: t.Table,
        event: t.Event,
        timing: t.Timing,
      }))
    );

    // 2. Check books with stock = 1
    console.log("\n2. Books with stock = 1:");
    const booksStock1 = await executeQuery(`
            SELECT id, judul, stok, tersedia 
            FROM buku 
            WHERE stok = 1 
            LIMIT 5
        `);
    console.table(booksStock1);

    // 3. Check if any books are available but have 0 stock
    console.log("\n3. Books with tersedia=TRUE but stok=0 (inconsistent):");
    const inconsistentBooks = await executeQuery(`
            SELECT id, judul, stok, tersedia 
            FROM buku 
            WHERE tersedia = TRUE AND stok = 0 
            LIMIT 5
        `);
    console.table(inconsistentBooks);

    // 4. Check pending requests
    console.log("\n4. Pending borrow requests:");
    const pendingRequests = await executeQuery(`
            SELECT 
                p.id,
                p.status,
                COUNT(pd.buku_id) as book_count,
                GROUP_CONCAT(b.judul) as books,
                GROUP_CONCAT(b.stok) as stock_levels
            FROM peminjaman p
            JOIN peminjaman_detail pd ON p.id = pd.peminjaman_id
            JOIN buku b ON pd.buku_id = b.id
            WHERE p.status = 'pending'
            GROUP BY p.id
            LIMIT 5
        `);
    console.table(pendingRequests);

    // 5. Show availability calculation
    console.log("\n5. Availability calculation test:");
    const availabilityTest = await executeQuery(`
            SELECT 
                id,
                judul,
                stok,
                tersedia,
                CASE 
                    WHEN tersedia = 1 AND stok > 0 THEN 'Available'
                    WHEN tersedia = 0 OR stok <= 0 THEN 'Unavailable'
                    ELSE 'Unknown'
                END as calculated_availability
            FROM buku 
            ORDER BY stok ASC
            LIMIT 10
        `);
    console.table(availabilityTest);

    console.log("\n✓ Debug completed successfully!");
  } catch (error) {
    console.error("❌ Error during debug:", error.message);
  }
}

// Run the debug
debugStockAvailability()
  .then(() => {
    console.log(
      "\n💡 If books with stock=1 show as unavailable, the issue is likely:"
    );
    console.log("   1. Database triggers firing at wrong time");
    console.log("   2. Frontend checking availability incorrectly");
    console.log("   3. Backend availability logic needs adjustment");
    process.exit(0);
  })
  .catch((error) => {
    console.error("Debug failed:", error);
    process.exit(1);
  });
