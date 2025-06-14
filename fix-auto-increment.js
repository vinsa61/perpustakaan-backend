const mysql = require("mysql2/promise");
require("dotenv").config();

async function fixPengembalianAutoIncrement() {
  const connection = await mysql.createConnection({
    host: process.env.DB_HOST || "localhost",
    user: process.env.DB_USER || "root",
    password: process.env.DB_PASSWORD || "",
    database: process.env.DB_NAME || "perpustakaan",
    port: process.env.DB_PORT || 3306,
  });

  try {
    console.log("🔄 Fixing pengembalian table id AUTO_INCREMENT issue...");

    // Check current table structure
    const [tableInfo] = await connection.query("DESCRIBE pengembalian");
    console.log("Current table structure:", tableInfo);

    // Fix the id field to have AUTO_INCREMENT
    await connection.query(`
      ALTER TABLE pengembalian 
      MODIFY COLUMN id int NOT NULL AUTO_INCREMENT
    `);

    console.log(
      "✅ Successfully added AUTO_INCREMENT to pengembalian.id field"
    ); // Also check if peminjaman table needs AUTO_INCREMENT fix
    console.log("🔄 Checking peminjaman table...");
    const [peminjamanInfo] = await connection.query("DESCRIBE peminjaman");
    console.log("Peminjaman table structure:", peminjamanInfo);

    // Check if peminjaman.id has AUTO_INCREMENT
    const idField = peminjamanInfo.find((field) => field.Field === "id");
    if (!idField.Extra.includes("auto_increment")) {
      console.log("🔄 Fixing peminjaman table id AUTO_INCREMENT...");
      await connection.query(`
        ALTER TABLE peminjaman 
        MODIFY COLUMN id int NOT NULL AUTO_INCREMENT
      `);
      console.log(
        "✅ Successfully added AUTO_INCREMENT to peminjaman.id field"
      );
    } else {
      console.log("✅ Peminjaman.id already has AUTO_INCREMENT");
    }

    // Also check if peminjaman_detail table needs AUTO_INCREMENT fix
    console.log("🔄 Checking peminjaman_detail table...");
    const [peminjamanDetailInfo] = await connection.query(
      "DESCRIBE peminjaman_detail"
    );
    console.log("Peminjaman_detail table structure:", peminjamanDetailInfo);

    // Check if peminjaman_detail.id has AUTO_INCREMENT
    const detailIdField = peminjamanDetailInfo.find(
      (field) => field.Field === "id"
    );
    if (!detailIdField.Extra.includes("auto_increment")) {
      console.log("🔄 Fixing peminjaman_detail table id AUTO_INCREMENT...");
      await connection.query(`
        ALTER TABLE peminjaman_detail 
        MODIFY COLUMN id int NOT NULL AUTO_INCREMENT
      `);
      console.log(
        "✅ Successfully added AUTO_INCREMENT to peminjaman_detail.id field"
      );
    } else {
      console.log("✅ Peminjaman_detail.id already has AUTO_INCREMENT");
    }

    console.log("🎉 Database schema fixes completed successfully!");
  } catch (error) {
    console.error("❌ Migration failed:", error.message);
    console.error("Full error:", error);
    process.exit(1);
  } finally {
    await connection.end();
  }
}

// Run migration if this file is executed directly
if (require.main === module) {
  fixPengembalianAutoIncrement();
}

module.exports = { fixPengembalianAutoIncrement };
