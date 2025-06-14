-- Table: Admin
CREATE TABLE Admin (
    id int NOT NULL AUTO_INCREMENT,
    nama varchar(100)  NOT NULL,
    username varchar(100)  NOT NULL,
    email varchar(100)  NOT NULL,
    password varchar(100)  NOT NULL,
    CONSTRAINT Admin_pk PRIMARY KEY (id)
);

-- Table: Anggota
CREATE TABLE Anggota (
    id int NOT NULL AUTO_INCREMENT,
    nama varchar(100)  NOT NULL,
    username varchar(100)  NOT NULL,
    email varchar(100)  NOT NULL,
    password varchar(100)  NOT NULL,
    academic_role enum('mahasiswa', 'dosen', 'tendik')  NOT NULL,
    no_induk varchar(100)  NOT NULL,
    CONSTRAINT id PRIMARY KEY (id)
);

-- Table: Buku
CREATE TABLE Buku (
    id int NOT NULL AUTO_INCREMENT,
    judul varchar(100)  NOT NULL,
    id_pengarang int  NOT NULL,
    id_penerbit int  NOT NULL,
    tahun_terbit int  NOT NULL,
    kategori varchar(100)  NOT NULL,
    stok int  NOT NULL,
    tersedia bool  NOT NULL,
    CONSTRAINT Buku_pk PRIMARY KEY (id)
);

-- Table: Buku_Pengarang
CREATE TABLE Buku_Pengarang (
    id int NOT NULL AUTO_INCREMENT,
    id_pengarang int  NOT NULL,
    id_buku int  NOT NULL,
    CONSTRAINT Buku_Pengarang_pk PRIMARY KEY (id)
);

-- Table: Peminjaman
CREATE TABLE Peminjaman (
    id int  NOT NULL,
    tanggal_pinjam datetime  NOT NULL,
    tenggat_pengembalian datetime  NOT NULL,
    status enum('dipinjam', 'selesai')  NOT NULL,
    user_id int  NOT NULL,
    created_at datetime default current_timestamp,
    CONSTRAINT Peminjaman_pk PRIMARY KEY (id)
);

-- Table: Peminjaman_Detail
CREATE TABLE Peminjaman_Detail (
    id int NOT NULL AUTO_INCREMENT,
    peminjaman_id int  NOT NULL,
    buku_id int  NOT NULL,
    CONSTRAINT Peminjaman_Detail_pk PRIMARY KEY (id)
);

-- Table: Penerbit
CREATE TABLE Penerbit (
    id int NOT NULL AUTO_INCREMENT,
    nama varchar(100)  NOT NULL,
    alamat_jalan varchar(255)  NOT NULL,
    kota varchar(100)  NOT NULL,
    CONSTRAINT Penerbit_pk PRIMARY KEY (id)
);

-- Table: Pengarang
CREATE TABLE Pengarang (
    id int NOT NULL AUTO_INCREMENT,
    nama_depan varchar(100)  NOT NULL,
    nama_belakang varchar(100)  NOT NULL,
    kewarganegaraan varchar(100)  NOT NULL,
    CONSTRAINT Pengarang_pk PRIMARY KEY (id)
);

-- Table: Pengembalian
CREATE TABLE Pengembalian (
    id int NOT NULL AUTO_INCREMENT,
    tanggal_dikembalikan datetime  NOT NULL,
    denda int  NOT NULL,
    peminjaman_id int  NOT NULL,
    admin_id int  NULL,
    CONSTRAINT Pengembalian_pk PRIMARY KEY (id)
);

-- foreign keys
-- Reference: Admin_Pengembalian (table: Pengembalian)
ALTER TABLE Pengembalian ADD CONSTRAINT Admin_Pengembalian FOREIGN KEY Admin_Pengembalian (admin_id)
    REFERENCES Admin (id);

-- Reference: Buku_Peminjaman_Detail (table: Peminjaman_Detail)
ALTER TABLE Peminjaman_Detail ADD CONSTRAINT Buku_Peminjaman_Detail FOREIGN KEY Buku_Peminjaman_Detail (buku_id)
    REFERENCES Buku (id);

-- Reference: Buku_Penerbit (table: Buku)
ALTER TABLE Buku ADD CONSTRAINT Buku_Penerbit FOREIGN KEY Buku_Penerbit (id_penerbit)
    REFERENCES Penerbit (id);

-- Reference: Buku_Pengarang_Buku (table: Buku_Pengarang)
ALTER TABLE Buku_Pengarang ADD CONSTRAINT Buku_Pengarang_Buku FOREIGN KEY Buku_Pengarang_Buku (id_buku)
    REFERENCES Buku (id);

-- Reference: Buku_Pengarang_Pengarang (table: Buku_Pengarang)
ALTER TABLE Buku_Pengarang ADD CONSTRAINT Buku_Pengarang_Pengarang FOREIGN KEY Buku_Pengarang_Pengarang (id_pengarang)
    REFERENCES Pengarang (id);

-- Reference: Peminjaman_Anggota (table: Peminjaman)
ALTER TABLE Peminjaman ADD CONSTRAINT Peminjaman_Anggota FOREIGN KEY Peminjaman_Anggota (user_id)
    REFERENCES Anggota (id);

-- Reference: Peminjaman_Detail_Peminjaman (table: Peminjaman_Detail)
ALTER TABLE Peminjaman_Detail ADD CONSTRAINT Peminjaman_Detail_Peminjaman FOREIGN KEY Peminjaman_Detail_Peminjaman (peminjaman_id)
    REFERENCES Peminjaman (id);

-- Reference: Pengembalian_Peminjaman (table: Pengembalian)
ALTER TABLE Pengembalian ADD CONSTRAINT Pengembalian_Peminjaman FOREIGN KEY Pengembalian_Peminjaman (peminjaman_id)
    REFERENCES Peminjaman (id);

-- Functions
-- Fungsi untuk menghitung denda 
DELIMITER $$

CREATE FUNCTION fn_hitung_denda(p_peminjaman_id INT)
RETURNS INT
READS SQL DATA
BEGIN
    DECLARE v_tenggat DATE;
    DECLARE v_tanggal_kembali DATE;
    DECLARE v_selisih_hari INT;
    DECLARE v_denda INT;
    DECLARE v_tarif_denda_per_hari INT DEFAULT 10000;

    -- Ambil tanggal tenggat dari tabel Peminjaman
    SELECT DATE(tenggat_pengembalian) INTO v_tenggat
    FROM Peminjaman
    WHERE id = p_peminjaman_id;

    -- Ambil tanggal kembali dari tabel Pengembalian
    SELECT DATE(tanggal_dikembalikan) INTO v_tanggal_kembali
    FROM Pengembalian
    WHERE peminjaman_id = p_peminjaman_id;

    -- Jika buku belum dikembalikan, maka denda dianggap 0 untuk saat ini
    IF v_tanggal_kembali IS NULL THEN
        RETURN 0;
    END IF;
    
    -- Hitung selisih hari jika terlambat
    IF v_tanggal_kembali > v_tenggat THEN
        SET v_selisih_hari = DATEDIFF(v_tanggal_kembali, v_tenggat);
        SET v_denda = v_selisih_hari * v_tarif_denda_per_hari;
    ELSE
        SET v_denda = 0; 
    END IF;

    RETURN v_denda;
END$$

DELIMITER ;

-- !INSTRUCTION
-- SELECT fn_hitung_denda(id_buku);

-- Fungsi untuk mengecek stok buku
DELIMITER $$

CREATE FUNCTION fn_cek_stok_buku(p_buku_id INT)
RETURNS INT
READS SQL DATA
BEGIN
    DECLARE v_stok INT;

    SELECT stok INTO v_stok
    FROM Buku
    WHERE id = p_buku_id;

    -- Mengembalikan 0 jika buku tidak ditemukan
    IF v_stok IS NULL THEN
        RETURN 0;
    END IF;

    RETURN v_stok;
END$$

DELIMITER ;

-- !INSTRUCTION
-- SELECT fn_cek_stok_buku(id_buku);

-- Fungsi untuk menghitung jumlah buku yang sedang dipinjam
DELIMITER $$

CREATE FUNCTION fn_jumlah_buku_dipinjam_anggota(p_anggota_id INT)
RETURNS INT
READS SQL DATA
BEGIN
    DECLARE v_jumlah_buku INT;

    SELECT COUNT(pd.id) INTO v_jumlah_buku
    FROM Peminjaman p
    JOIN Peminjaman_Detail pd ON p.id = pd.peminjaman_id
    WHERE 
        p.user_id = p_anggota_id
        AND p.status = 'dipinjam';

    RETURN v_jumlah_buku;
END$$

DELIMITER ;

-- !INSTRUCTION
-- SELECT fn_jumlah_buku_dipinjam_anggota(id_anggota);

-- Fungsi untuk memeriksa anggota yang di-blacklist berdasarkan denda peminjaman
DELIMITER $$

CREATE FUNCTION fn_cek_blacklist_anggota(p_anggota_id INT)
RETURNS BOOLEAN
READS SQL DATA
BEGIN
    DECLARE v_total_denda INT DEFAULT 0;
    DECLARE v_batas_blacklist INT DEFAULT 100000;

    SELECT COALESCE(SUM(pen.denda), 0) INTO v_total_denda
    FROM peminjaman p
    JOIN PENGEMBALIAN pen ON p.id = pen.peminjaman_id
    WHERE p.user_id = p.anggota_id
        AND pen.denda > 0;

    IF v_total_denda >= v_batas_blacklist THEN
        RETURN TRUE;
    ELSE
        RETURN FALSE;
    END IF;
END$$

DELIMITER ;

-- !INSTRUCTION
-- SELECT fn_cek_blacklist_anggota(id_anggota);

-- Fungsi untuk mencari buku berdasarkan judul, pengarang, atau penerbit
DELIMITER $$

CREATE FUNCTION fn_cari_buku(p_keyword VARCHAR(255))
RETURNS TEXT
READS SQL DATA
BEGIN
    DECLARE v_hasil TEXT DEFAULT '';
    DECLARE v_temp TEXT;
    DECLARE done INT DEFAULT FALSE;
    
    -- Cursor untuk hasil pencarian
    DECLARE cur_buku CURSOR FOR
        SELECT CONCAT('ID: ', b.id, ', Judul: ', b.judul, ', Pengarang: ', 
                     CONCAT(pg.nama_depan, ' ', pg.nama_belakang), 
                     ', Penerbit: ', pn.nama, ', Stok: ', b.stok) as info_buku
        FROM Buku b
        LEFT JOIN Buku_Pengarang bp ON b.id = bp.id_buku
        LEFT JOIN Pengarang pg ON bp.id_pengarang = pg.id
        LEFT JOIN Penerbit pn ON b.id_penerbit = pn.id
        WHERE b.judul LIKE CONCAT('%', p_keyword, '%')
           OR CONCAT(pg.nama_depan, ' ', pg.nama_belakang) LIKE CONCAT('%', p_keyword, '%')
           OR pn.nama LIKE CONCAT('%', p_keyword, '%')
        GROUP BY b.id, b.judul, pn.nama
        ORDER BY b.judul;
    
    DECLARE CONTINUE HANDLER FOR NOT FOUND SET done = TRUE;
    
    OPEN cur_buku;
    
    read_loop: LOOP
        FETCH cur_buku INTO v_temp;
        IF done THEN
            LEAVE read_loop;
        END IF;
        
        IF v_hasil = '' THEN
            SET v_hasil = v_temp;
        ELSE
            SET v_hasil = CONCAT(v_hasil, '; ', v_temp);
        END IF;
    END LOOP;
    
    CLOSE cur_buku;
    
    -- Jika tidak ada hasil
    IF v_hasil = '' THEN
        SET v_hasil = 'Tidak ada buku yang ditemukan';
    END IF;
    
    RETURN v_hasil;
END$$

DELIMITER ;

-- Fungsi untuk menghitung sisa hari sebelum deadline
DELIMITER $$

CREATE FUNCTION fn_hitung_sisa_hari_deadline(p_peminjaman_id INT)
RETURNS INT
READS SQL DATA
BEGIN
    DECLARE v_tenggat_pengembalian DATE;
    DECLARE v_sisa_hari INT;

    -- Ambil tanggal tenggat pengembalian
    SELECT DATE(tenggat_pengembalian) INTO v_tenggat_pengembalian
    FROM Peminjaman
    WHERE id = p_peminjaman_id;

    -- Jika peminjaman tidak ditemukan
    IF v_tenggat_pengembalian IS NULL THEN
        RETURN -999; -- Kode error untuk peminjaman tidak ditemukan
    END IF;

    -- Hitung sisa hari (positif = masih ada waktu, negatif = sudah lewat deadline)
    SET v_sisa_hari = DATEDIFF(v_tenggat_pengembalian, CURDATE());

    RETURN v_sisa_hari;
END$$

DELIMITER ;

-- !INSTRUCTION
-- Contoh penggunaan:
-- SELECT fn_hitung_sisa_hari_deadline(1) AS sisa_hari;

-- Procedure untuk memasukkan data peminjaman ke peminjaman detail secara langsung
DELIMITER $$

CREATE PROCEDURE sp_tambah_peminjaman_dengan_detail(
    IN p_user_id INT,
    IN p_buku_ids TEXT, -- Format: "1,2,3"
    IN p_tenggat_hari INT,
    OUT p_peminjaman_id INT,
    OUT p_status_message VARCHAR(500)
)
proc_main: BEGIN
    DECLARE v_buku_id INT;
    DECLARE v_stok INT;
    DECLARE v_pos INT DEFAULT 1;
    DECLARE v_delimiter_pos INT;
    DECLARE v_current_buku_id VARCHAR(10);
    DECLARE v_buku_list TEXT;
    DECLARE v_error_count INT DEFAULT 0;
    DECLARE v_success_count INT DEFAULT 0;
    
    DECLARE EXIT HANDLER FOR SQLEXCEPTION
    BEGIN
        ROLLBACK;
        SET p_status_message = 'Error: Terjadi kesalahan dalam proses peminjaman';
        SET p_peminjaman_id = 0;
    END;
    
    START TRANSACTION;
    
    -- Cek apakah anggota di-blacklist
    IF fn_cek_blacklist_anggota(p_user_id) = TRUE THEN
        SET p_status_message = 'Error: Anggota di-blacklist karena denda berlebihan';
        SET p_peminjaman_id = 0;
        ROLLBACK;
        LEAVE proc_main;
    END IF;
    
    -- Insert data peminjaman utama
    INSERT INTO Peminjaman (tanggal_pinjam, tenggat_pengembalian, status, user_id)
    VALUES (NOW(), DATE_ADD(NOW(), INTERVAL p_tenggat_hari DAY), 'dipinjam', p_user_id);
    
    SET p_peminjaman_id = LAST_INSERT_ID();
    SET v_buku_list = CONCAT(p_buku_ids, ','); 
    
    -- Loop untuk memproses setiap buku_id
    buku_loop: WHILE v_pos <= CHAR_LENGTH(v_buku_list) DO
        SET v_delimiter_pos = LOCATE(',', v_buku_list, v_pos);
        
        IF v_delimiter_pos = 0 THEN
            LEAVE buku_loop;
        END IF;
        
        SET v_current_buku_id = SUBSTRING(v_buku_list, v_pos, v_delimiter_pos - v_pos);
        SET v_buku_id = CAST(v_current_buku_id AS UNSIGNED);
        
        -- Cek stok buku
        SET v_stok = fn_cek_stok_buku(v_buku_id);
        
        IF v_stok > 0 THEN
            -- Insert ke peminjaman_detail
            INSERT INTO Peminjaman_Detail (peminjaman_id, buku_id)
            VALUES (p_peminjaman_id, v_buku_id);
            
            -- Kurangi stok buku
            UPDATE Buku 
            SET stok = stok - 1,
                tersedia = CASE WHEN stok - 1 = 0 THEN FALSE ELSE TRUE END
            WHERE id = v_buku_id;
            
            SET v_success_count = v_success_count + 1;
        ELSE
            SET v_error_count = v_error_count + 1;
        END IF;
        
        SET v_pos = v_delimiter_pos + 1;
    END WHILE;
    
    -- Buat status message
    IF v_success_count > 0 AND v_error_count = 0 THEN
        SET p_status_message = CONCAT('Success: ', v_success_count, ' buku berhasil dipinjam');
        COMMIT;
    ELSEIF v_success_count > 0 AND v_error_count > 0 THEN
        SET p_status_message = CONCAT('Partial Success: ', v_success_count, ' buku berhasil, ', v_error_count, ' buku gagal (stok habis)');
        COMMIT;
    ELSE
        SET p_status_message = 'Error: Semua buku gagal dipinjam (stok habis atau tidak ditemukan)';
        ROLLBACK;
        SET p_peminjaman_id = 0;
    END IF;
    
END$$

DELIMITER ;

-- !INSTRUCTION
-- CALL sp_tambah_peminjaman_dengan_detail(1, '1,2,3', 7, @peminjaman_id, @status);
-- SELECT @peminjaman_id, @status;

-- Procedure untuk memperbarui tanggal pengembalian di tabel peminjaman
DELIMITER $$

CREATE PROCEDURE sp_update_tanggal_pengembalian(
    IN p_peminjaman_id INT,
    IN p_admin_id INT,
    OUT p_total_denda INT,
    OUT p_status_message VARCHAR(255)
)
sp_main: BEGIN
    DECLARE v_peminjaman_exists INT DEFAULT 0;
    DECLARE v_sudah_dikembalikan INT DEFAULT 0;
    DECLARE v_calculated_denda INT DEFAULT 0;
    
    DECLARE EXIT HANDLER FOR SQLEXCEPTION
    BEGIN
        ROLLBACK;
        SET p_status_message = 'Error: Terjadi kesalahan dalam proses pengembalian';
        SET p_total_denda = 0;
    END;
    
    START TRANSACTION;
    
    -- Cek apakah peminjaman exists dan belum dikembalikan
    SELECT COUNT(*) INTO v_peminjaman_exists
    FROM Peminjaman 
    WHERE id = p_peminjaman_id AND status = 'dipinjam';
    
    IF v_peminjaman_exists = 0 THEN
        SET p_status_message = 'Error: Peminjaman tidak ditemukan atau sudah dikembalikan';
        SET p_total_denda = 0;
        ROLLBACK;
        LEAVE sp_main;
    END IF;
    
    -- Cek apakah sudah ada record pengembalian
    SELECT COUNT(*) INTO v_sudah_dikembalikan
    FROM Pengembalian 
    WHERE peminjaman_id = p_peminjaman_id;
    
    IF v_sudah_dikembalikan > 0 THEN
        SET p_status_message = 'Error: Buku sudah pernah dikembalikan';
        SET p_total_denda = 0;
        ROLLBACK;
        LEAVE sp_main;
    END IF;
    
    -- Insert record pengembalian dengan tanggal sekarang
    INSERT INTO Pengembalian (tanggal_dikembalikan, denda, peminjaman_id, admin_id)
    VALUES (NOW(), 0, p_peminjaman_id, p_admin_id); -- Denda sementara 0, akan dihitung setelah insert
    
    -- Hitung denda menggunakan fungsi yang sudah ada
    SET v_calculated_denda = fn_hitung_denda(p_peminjaman_id);
    
    -- Update denda yang sudah dihitung
    UPDATE Pengembalian 
    SET denda = v_calculated_denda
    WHERE peminjaman_id = p_peminjaman_id;
    
    -- Update status peminjaman menjadi 'selesai'
    UPDATE Peminjaman 
    SET status = 'selesai'
    WHERE id = p_peminjaman_id;
    
    -- Kembalikan stok buku yang dipinjam
    UPDATE Buku b
    JOIN Peminjaman_Detail pd ON b.id = pd.buku_id
    SET b.stok = b.stok + 1,
        b.tersedia = TRUE
    WHERE pd.peminjaman_id = p_peminjaman_id;
    
    SET p_total_denda = v_calculated_denda;
    
    IF v_calculated_denda > 0 THEN
        SET p_status_message = CONCAT('Success: Buku dikembalikan dengan denda Rp ', FORMAT(v_calculated_denda, 0));
    ELSE
        SET p_status_message = 'Success: Buku dikembalikan tanpa denda';
    END IF;
    
    COMMIT;
    
    sp_end: BEGIN END;
    
END$$

DELIMITER ;

-- !INSTRUCTION
-- CALL sp_update_tanggal_pengembalian(1, 1, @total_denda, @status);
-- SELECT @total_denda, @status;

-- Tabel untuk log peminjaman
CREATE TABLE Log_Peminjaman (
    id INT AUTO_INCREMENT PRIMARY KEY,
    peminjaman_id INT NOT NULL,
    user_id INT NOT NULL,
    aksi ENUM('pinjam', 'kembali') NOT NULL,
    tanggal_aksi DATETIME NOT NULL,
    jumlah_buku INT NOT NULL,
    keterangan TEXT,
    INDEX idx_peminjaman_id (peminjaman_id),
    INDEX idx_user_id (user_id),
    INDEX idx_tanggal_aksi (tanggal_aksi)
);

-- Trigger untuk update stok buku ketika dipinjam
DELIMITER $$

CREATE TRIGGER tr_update_stok_pinjam
AFTER INSERT ON Peminjaman_Detail
FOR EACH ROW
BEGIN
    -- Update stok buku (kurangi 1)
    UPDATE Buku 
    SET stok = stok - 1,
        tersedia = CASE 
            WHEN stok - 1 <= 0 THEN FALSE 
            ELSE TRUE 
        END
    WHERE id = NEW.buku_id;
    
    -- Log untuk debugging (optional)
    INSERT INTO Log_Peminjaman (
        peminjaman_id, 
        user_id, 
        aksi, 
        tanggal_aksi, 
        jumlah_buku, 
        keterangan
    )
    SELECT 
        NEW.peminjaman_id,
        p.user_id,
        'pinjam',
        NOW(),
        1,
        CONCAT('Buku ID ', NEW.buku_id, ' dipinjam - stok berkurang')
    FROM Peminjaman p 
    WHERE p.id = NEW.peminjaman_id;
END$$

DELIMITER ;

-- Trigger untuk update stok buku ketika dikembalikan
DELIMITER $$

CREATE TRIGGER tr_update_stok_kembali
AFTER INSERT ON Pengembalian
FOR EACH ROW
BEGIN
    -- Update stok semua buku yang dipinjam (tambah 1 untuk setiap buku)
    UPDATE Buku b
    INNER JOIN Peminjaman_Detail pd ON b.id = pd.buku_id
    SET b.stok = b.stok + 1,
        b.tersedia = TRUE
    WHERE pd.peminjaman_id = NEW.peminjaman_id;
    
    -- Hitung jumlah buku yang dikembalikan
    SET @jumlah_buku = (
        SELECT COUNT(*) 
        FROM Peminjaman_Detail 
        WHERE peminjaman_id = NEW.peminjaman_id
    );
    
    -- Log pengembalian
    INSERT INTO Log_Peminjaman (
        peminjaman_id, 
        user_id, 
        aksi, 
        tanggal_aksi, 
        jumlah_buku, 
        keterangan
    )
    SELECT 
        NEW.peminjaman_id,
        p.user_id,
        'kembali',
        NOW(),
        @jumlah_buku,
        CONCAT('Pengembalian dengan denda Rp ', FORMAT(NEW.denda, 0))
    FROM Peminjaman p 
    WHERE p.id = NEW.peminjaman_id;
END$$

DELIMITER ;

-- Trigger untuk membuat log peminjaman (ketika peminjaman baru dibuat)
DELIMITER $$

CREATE TRIGGER tr_log_peminjaman_baru
AFTER INSERT ON Peminjaman
FOR EACH ROW
BEGIN
    -- Log peminjaman baru
    INSERT INTO Log_Peminjaman (
        peminjaman_id, 
        user_id, 
        aksi, 
        tanggal_aksi, 
        jumlah_buku, 
        keterangan
    )
    VALUES (
        NEW.id,
        NEW.user_id,
        'pinjam',
        NEW.tanggal_pinjam,
        0, -- Will be updated by detail trigger
        CONCAT('Peminjaman baru dibuat - tenggat: ', DATE_FORMAT(NEW.tenggat_pengembalian, '%Y-%m-%d'))
    );
END$$

DELIMITER ;

-- Trigger untuk update log ketika status peminjaman berubah
DELIMITER $$

CREATE TRIGGER tr_log_status_peminjaman
AFTER UPDATE ON Peminjaman
FOR EACH ROW
BEGIN
    -- Log ketika status berubah ke 'selesai'
    IF OLD.status = 'dipinjam' AND NEW.status = 'selesai' THEN
        INSERT INTO Log_Peminjaman (
            peminjaman_id, 
            user_id, 
            aksi, 
            tanggal_aksi, 
            jumlah_buku, 
            keterangan
        )
        SELECT 
            NEW.id,
            NEW.user_id,
            'kembali',
            NOW(),
            COUNT(pd.id),
            'Status peminjaman diubah menjadi selesai'
        FROM Peminjaman_Detail pd 
        WHERE pd.peminjaman_id = NEW.id;
    END IF;
END$$

DELIMITER ;

-- Trigger untuk mencegah stok negatif
DELIMITER $$

CREATE TRIGGER tr_cek_stok_sebelum_pinjam
BEFORE INSERT ON Peminjaman_Detail
FOR EACH ROW
BEGIN
    DECLARE v_stok_tersedia INT;
    
    -- Cek stok buku
    SELECT stok INTO v_stok_tersedia
    FROM Buku 
    WHERE id = NEW.buku_id;
    
    -- Jika stok habis, batalkan insert
    IF v_stok_tersedia <= 0 THEN
        SIGNAL SQLSTATE '45000' 
        SET MESSAGE_TEXT = 'Error: Stok buku habis, tidak dapat dipinjam';
    END IF;
END$$

DELIMITER ;

-- !INSTRUCTION
-- Contoh query untuk melihat log
-- SELECT * FROM Log_Peminjaman ORDER BY tanggal_aksi DESC LIMIT 10;

-- Query untuk melihat aktivitas peminjaman per user
-- SELECT 
--     user_id,
--     aksi,
--     COUNT(*) as jumlah_transaksi,
--     SUM(jumlah_buku) as total_buku
-- FROM Log_Peminjaman 
-- GROUP BY user_id, aksi
-- ORDER BY user_id;

-- View daftar peminjaman anggota
CREATE VIEW vw_daftar_peminjaman_anggota AS
SELECT 
    p.id AS peminjaman_id,
    p.tanggal_pinjam,
    p.tenggat_pengembalian,
    p.status,
    a.id AS anggota_id,
    a.nama AS nama_anggota,
    a.no_induk,
    a.academic_role,
    COUNT(pd.id) AS jumlah_buku,
    GROUP_CONCAT(
        CONCAT(b.judul, ' (ID: ', b.id, ')')
        ORDER BY b.judul SEPARATOR '; '
    ) AS daftar_buku,
    CASE 
        WHEN p.status = 'dipinjam' AND p.tenggat_pengembalian < NOW() THEN 'Terlambat'
        WHEN p.status = 'dipinjam' THEN 'Aktif'
        ELSE 'Selesai'
    END AS status_peminjaman,
    DATEDIFF(NOW(), p.tenggat_pengembalian) AS hari_terlambat
FROM Peminjaman p
JOIN Anggota a ON p.user_id = a.id
JOIN Peminjaman_Detail pd ON p.id = pd.peminjaman_id
JOIN Buku b ON pd.buku_id = b.id
GROUP BY p.id, p.tanggal_pinjam, p.tenggat_pengembalian, p.status, 
         a.id, a.nama, a.no_induk, a.academic_role
ORDER BY p.tanggal_pinjam DESC;

-- View daftar peminjaman perpustakaan (ringkasan untuk admin)
CREATE VIEW vw_daftar_peminjaman_perpustakaan AS
SELECT 
    p.id AS peminjaman_id,
    a.nama AS nama_peminjam,
    a.no_induk,
    a.academic_role,
    p.tanggal_pinjam,
    p.tenggat_pengembalian,
    p.status,
    COUNT(pd.id) AS total_buku_dipinjam,
    CASE 
        WHEN p.status = 'dipinjam' AND p.tenggat_pengembalian < NOW() THEN 'Terlambat'
        WHEN p.status = 'dipinjam' THEN 'Dipinjam'
        ELSE 'Dikembalikan'
    END AS status_detail,
    CASE 
        WHEN p.status = 'dipinjam' AND p.tenggat_pengembalian < NOW() 
        THEN DATEDIFF(NOW(), p.tenggat_pengembalian)
        ELSE 0
    END AS hari_keterlambatan,
    CASE 
        WHEN p.status = 'dipinjam' AND p.tenggat_pengembalian < NOW() 
        THEN DATEDIFF(NOW(), p.tenggat_pengembalian) * 10000
        ELSE 0
    END AS estimasi_denda
FROM Peminjaman p
JOIN Anggota a ON p.user_id = a.id
JOIN Peminjaman_Detail pd ON p.id = pd.peminjaman_id
GROUP BY p.id, a.nama, a.no_induk, a.academic_role, p.tanggal_pinjam, 
         p.tenggat_pengembalian, p.status
ORDER BY 
    CASE WHEN p.status = 'dipinjam' THEN 0 ELSE 1 END,
    p.tenggat_pengembalian ASC;

-- View daftar pengembalian
CREATE VIEW vw_daftar_pengembalian AS
SELECT 
    pen.id AS pengembalian_id,
    p.id AS peminjaman_id,
    a.nama AS nama_peminjam,
    a.no_induk,
    a.academic_role,
    p.tanggal_pinjam,
    p.tenggat_pengembalian,
    pen.tanggal_dikembalikan,
    pen.denda,
    adm.nama AS nama_admin,
    COUNT(pd.id) AS jumlah_buku_dikembalikan,
    GROUP_CONCAT(
        CONCAT(b.judul, ' (ID: ', b.id, ')')
        ORDER BY b.judul SEPARATOR '; '
    ) AS daftar_buku_dikembalikan,
    DATEDIFF(pen.tanggal_dikembalikan, p.tenggat_pengembalian) AS hari_terlambat,
    CASE 
        WHEN pen.tanggal_dikembalikan <= p.tenggat_pengembalian THEN 'Tepat Waktu'
        WHEN DATEDIFF(pen.tanggal_dikembalikan, p.tenggat_pengembalian) <= 7 THEN 'Terlambat (1-7 hari)'
        WHEN DATEDIFF(pen.tanggal_dikembalikan, p.tenggat_pengembalian) <= 30 THEN 'Terlambat (1-4 minggu)'
        ELSE 'Sangat Terlambat (>1 bulan)'
    END AS kategori_keterlambatan
FROM Pengembalian pen
JOIN Peminjaman p ON pen.peminjaman_id = p.id
JOIN Anggota a ON p.user_id = a.id
LEFT JOIN Admin adm ON pen.admin_id = adm.id
JOIN Peminjaman_Detail pd ON p.id = pd.peminjaman_id
JOIN Buku b ON pd.buku_id = b.id
GROUP BY pen.id, p.id, a.nama, a.no_induk, a.academic_role, 
         p.tanggal_pinjam, p.tenggat_pengembalian, pen.tanggal_dikembalikan, 
         pen.denda, adm.nama
ORDER BY pen.tanggal_dikembalikan DESC;

-- View laporan buku yang sering dipinjam
CREATE VIEW vw_laporan_buku_sering_dipinjam AS
SELECT 
    b.id AS buku_id,
    b.judul,
    GROUP_CONCAT(
        CONCAT(pg.nama_depan, ' ', pg.nama_belakang)
        ORDER BY pg.nama_depan SEPARATOR ', '
    ) AS pengarang,
    pn.nama AS penerbit,
    b.tahun_terbit,
    b.kategori,
    b.stok AS stok_tersedia,
    COUNT(pd.id) AS total_dipinjam,
    COUNT(DISTINCT p.user_id) AS jumlah_peminjam_unik,
    MAX(p.tanggal_pinjam) AS terakhir_dipinjam,
    AVG(CASE 
        WHEN pen.tanggal_dikembalikan IS NOT NULL 
        THEN DATEDIFF(pen.tanggal_dikembalikan, p.tanggal_pinjam)
        ELSE NULL 
    END) AS rata_rata_hari_pinjam,
    COUNT(CASE WHEN p.status = 'dipinjam' THEN 1 END) AS sedang_dipinjam,
    ROUND(
        (COUNT(pd.id) * 100.0) / 
        (SELECT COUNT(*) FROM Peminjaman_Detail), 2
    ) AS persentase_dari_total_peminjaman,
    CASE 
        WHEN COUNT(pd.id) >= 20 THEN 'Sangat Populer'
        WHEN COUNT(pd.id) >= 10 THEN 'Populer'
        WHEN COUNT(pd.id) >= 5 THEN 'Cukup Populer'
        ELSE 'Jarang Dipinjam'
    END AS kategori_popularitas
FROM Buku b
LEFT JOIN Peminjaman_Detail pd ON b.id = pd.buku_id
LEFT JOIN Peminjaman p ON pd.peminjaman_id = p.id
LEFT JOIN Pengembalian pen ON p.id = pen.peminjaman_id
LEFT JOIN Buku_Pengarang bp ON b.id = bp.id_buku
LEFT JOIN Pengarang pg ON bp.id_pengarang = pg.id
LEFT JOIN Penerbit pn ON b.id_penerbit = pn.id
GROUP BY b.id, b.judul, pn.nama, b.tahun_terbit, b.kategori, b.stok
ORDER BY total_dipinjam DESC, b.judul ASC;

-- View tambahan: Ringkasan statistik perpustakaan
CREATE VIEW vw_statistik_perpustakaan AS
SELECT 
    'Total Buku' AS metrik,
    COUNT(*) AS nilai,
    'unit' AS satuan
FROM Buku
UNION ALL
SELECT 
    'Total Anggota',
    COUNT(*),
    'orang'
FROM Anggota
UNION ALL
SELECT 
    'Peminjaman Aktif',
    COUNT(*),
    'transaksi'
FROM Peminjaman 
WHERE status = 'dipinjam'
UNION ALL
SELECT 
    'Buku Sedang Dipinjam',
    COUNT(*),
    'unit'
FROM Peminjaman_Detail pd
JOIN Peminjaman p ON pd.peminjaman_id = p.id
WHERE p.status = 'dipinjam'
UNION ALL
SELECT 
    'Total Denda Belum Dibayar',
    COALESCE(SUM(denda), 0),
    'rupiah'
FROM Pengembalian pen
JOIN Peminjaman p ON pen.peminjaman_id = p.id
WHERE pen.denda > 0;

-- !INSTRUCTION
-- Contoh query untuk menggunakan views:

-- Melihat peminjaman anggota tertentu
-- SELECT * FROM vw_daftar_peminjaman_anggota WHERE anggota_id = 1;

-- Melihat peminjaman yang terlambat
-- SELECT * FROM vw_daftar_peminjaman_perpustakaan WHERE status_detail = 'Terlambat';

-- Melihat pengembalian dengan denda
-- SELECT * FROM vw_daftar_pengembalian WHERE denda > 0 ORDER BY denda DESC;

-- Melihat top 10 buku terpopuler
-- SELECT * FROM vw_laporan_buku_sering_dipinjam LIMIT 10;

-- Melihat statistik perpustakaan
-- SELECT * FROM vw_statistik_perpustakaan;

-- End of file.

