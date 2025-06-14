-- DML for Library Database

-- Table: Admin (4 data)
INSERT INTO Admin (nama, username, email, password) VALUES 
('Super Admin', 'admin', 'admin@library.com', '$2a$10$XDsO22ueJEQnvVbuA/gNO.AZ9.hJGIRbZWQE23V7d57GGagpMRRpm');

-- Table: Pengarang (8 data)
INSERT INTO Pengarang (nama_depan, nama_belakang, kewarganegaraan) VALUES
('Andrea', 'Hirata', 'Indonesia'),
('Pramoedya', 'Ananta Toer', 'Indonesia'),
('J.K.', 'Rowling', 'Britania Raya'),
('Haruki', 'Murakami', 'Jepang'),
('Tere', 'Liye', 'Indonesia'),
('Eka', 'Kurniawan', 'Indonesia'),
('Dee', 'Lestari', 'Indonesia'),
('Yasunari', 'Kawabata', 'Jepang');

-- Table: Penerbit (4 data)
INSERT INTO Penerbit (nama, alamat_jalan, kota) VALUES
('Gramedia Pustaka Utama', 'Jl. Palmerah Barat No. 29-37', 'Jakarta'),
('Bentang Pustaka', 'Jl. Pesanggrahan No. 8', 'Yogyakarta'),
('Mizan Pustaka', 'Jl. Cinambo No. 135', 'Bandung'),
('Penerbit KPG (Kepustakaan Populer Gramedia)', 'Jl. Palmerah Selatan No. 26', 'Jakarta');

-- Table: Anggota (15 data)
INSERT INTO Anggota (nama, username, email, password, academic_role, no_induk) VALUES
('Rina Amelia', 'rina_a', 'rina.amelia@student.its.ac.id', 'password_4', 'mahasiswa', '5011231001'),
('Joko Susilo', 'joko_s', 'joko.susilo@student.its.ac.id', 'password_5', 'mahasiswa', '5001231002'),
('Dr. Hartono', 'hartono_phd', 'hartono@dosen.its.ac.id', 'password_6', 'dosen', '1011532010'),
('Siti Nurhaliza', 'siti_n', 'siti.nurhaliza@student.its.ac.id', 'password_7', 'mahasiswa', '5023231003'),
('Bambang Pamungkas', 'bambang_p', 'bambang.p@staff.its.ac.id', 'password_8', 'tendik', '2001420113'),
('Dewi Persik', 'dewi_p', 'dewi.persik@student.its.ac.id', 'password_9', 'mahasiswa', '5025231004'),
('Prof. Dr. Ir. Sutrisno', 'sutrisno_prof', 'sutrisno@dosen.its.ac.id', 'password_10', 'dosen', '1011532011'),
('Eka Kurniawan', 'eka_k', 'eka.kurniawan@student.its.ac.id', 'password_11', 'mahasiswa', '5048231005'),
('Lia Kartika', 'lia_k', 'lia.kartika@student.its.ac.id', 'password_12', 'mahasiswa', '5005231006'),
('Ahmad Dhani', 'ahmad_d', 'ahmad.dhani@staff.its.ac.id', 'password_13', 'tendik', '2001420114'),
('Putri Ayunda', 'putri_a', 'putri.ayunda@student.its.ac.id', 'password_15', 'mahasiswa', '5017231007'),
('Rahmat Hidayat', 'rahmat_h', 'rahmat.hidayat@student.its.ac.id', 'password_16', 'mahasiswa', '5024231008'),
('Dr. Indah Permata', 'indah_permata', 'indah.p@dosen.its.ac.id', 'password_17', 'dosen', '1011532012'),
('Yoga Pratama', 'yoga_p', 'yoga.pratama@staff.its.ac.id', 'password_18', 'tendik', '2001420115'),
('Kirana Larasati', 'kirana_l', 'kirana.larasati@student.its.ac.id', 'password_19', 'mahasiswa', '5022231009');

-- Table: Buku (40 data)
INSERT INTO Buku (judul, id_pengarang, id_penerbit, tahun_terbit, kategori, stok, tersedia) VALUES
('Laskar Pelangi', 1, 2, 2005, 'Novel', 5, 1),
('Bumi Manusia', 2, 1, 1980, 'Novel Sains', 3, 1),
('Harry Potter and the Sorcerer''s Stone', 3, 1, 1997, 'Fantasi', 7, 1),
('Norwegian Wood', 4, 3, 1987, 'Novel', 4, 1),
('Negeri Para Bedebah', 5, 1, 2012, 'Novel', 6, 1),
('Sang Pemimpi', 1, 2, 2006, 'Novel', 5, 1),
('Anak Semua Bangsa', 2, 1, 1981, 'Novel Sains', 2, 1),
('Harry Potter and the Chamber of Secrets', 3, 1, 1998, 'Fantasi', 6, 1),
('Kafka on the Shore', 4, 3, 2002, 'Novel', 4, 1),
('Hujan', 5, 1, 2016, 'Fiksi Ilmiah', 8, 1),
('Edensor', 1, 2, 2007, 'Novel', 4, 1),
('Jejak Langkah', 2, 1, 1985, 'Novel Sains', 3, 0),
('Harry Potter and the Prisoner of Azkaban', 3, 1, 1999, 'Fantasi', 5, 1),
('1Q84', 4, 3, 2009, 'Novel', 3, 1),
('Pulang', 5, 1, 2015, 'Aksi', 7, 1),
('Maryamah Karpov', 1, 2, 2008, 'Novel', 4, 1),
('Rumah Kaca', 2, 1, 1988, 'Novel Sains', 2, 1),
('Harry Potter and the Goblet of Fire', 3, 1, 2000, 'Fantasi', 4, 1),
('The Wind-Up Bird Chronicle', 4, 3, 1994, 'Novel', 3, 1),
('Pergi', 5, 1, 2018, 'Aksi', 7, 0),
('Sirkus Pohon', 1, 2, 2017, 'Novel', 5, 1),
('Gadis Pantai', 2, 1, 2002, 'Novel', 3, 1),
('Harry Potter and the Order of the Phoenix', 3, 1, 2003, 'Fantasi', 3, 1),
('Sputnik Sweetheart', 4, 3, 1999, 'Novel', 4, 1),
('Bumi', 5, 1, 2014, 'Fantasi', 8, 1),
('Ayahku (Bukan) Pembohong', 1, 1, 2011, 'Novel', 6, 1),
('Arok Dedes', 2, 1, 1999, 'Novel Sains', 2, 1),
('Harry Potter and the Half-Blood Prince', 3, 1, 2005, 'Fantasi', 4, 1),
('After Dark', 4, 3, 2004, 'Novel', 3, 1),
('Bulan', 5, 1, 2015, 'Fantasi', 8, 1),
('Cantik Itu Luka', 6, 1, 2002, 'Novel', 4, 1),
('Supernova: Ksatria, Puteri, dan Bintang Jatuh', 7, 2, 2001, 'Fiksi Ilmiah', 6, 1),
('Snow Country', 8, 4, 1948, 'Novel Klasik', 3, 1),
('Matahari', 5, 1, 2016, 'Fantasi', 8, 1),
('Seperti Dendam, Rindu Harus Dibayar Tuntas', 6, 1, 2014, 'Novel', 3, 0),
('Aroma Karsa', 7, 2, 2018, 'Fantasi', 5, 1),
('Thousand Cranes', 8, 4, 1952, 'Novel Klasik', 3, 1),
('O', 6, 1, 2016, 'Novel', 4, 1),
('Filosofi Kopi', 7, 2, 2006, 'Kumpulan Cerpen', 7, 1),
('The Old Capital', 8, 4, 1962, 'Novel Klasik', 2, 1);
