-- Migration to add 'pending' status to peminjaman table
-- Run this SQL command to update the database schema

ALTER TABLE peminjaman 
MODIFY COLUMN status ENUM('pending', 'dipinjam', 'selesai') NOT NULL;

-- Also update the related views if they exist
-- Drop and recreate views that depend on the status column

DROP VIEW IF EXISTS vw_daftar_peminjaman_anggota;
DROP VIEW IF EXISTS vw_daftar_peminjaman_perpustakaan;

-- Recreate the views with updated status enum
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
GROUP BY p.id, a.nama, a.username, a.academic_role, p.tanggal_pinjam, p.tenggat_pengembalian, p.status;

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
GROUP BY p.id, a.nama, a.username, p.tanggal_pinjam, p.tenggat_pengembalian, p.status;
