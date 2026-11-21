# PromptZip

[English](README.md) · [Bahasa Indonesia](README.id.md)

PromptZip membantu mempersingkat prompt dan melihat selisih token sebelum prompt dikirim. Aplikasi langsung membuka halaman **Compressor**. Kompresi dan pemeriksaan cepat berjalan di browser Anda.

## Fitur

- **Compressor:** bandingkan teks asli dan hasil kompresi, lihat perubahannya, lalu salin hasilnya.
- **Algorithms:** bandingkan enam metode kompresi untuk prompt yang sedang dibuka.
- **Prompt Review:** periksa pilihan kata dan batasan prompt; tersedia tinjauan opsional dengan model Qwen lokal melalui Ollama.
- **CLI & Formats:** ubah format prompt dan salin perintah untuk alat yang sudah terpasang. Fitur ini tidak memasang atau mengunduh CLI.
- **File:** olah spreadsheet, PDF, dan gambar yang didukung langsung di browser.

Penghematan token merupakan perkiraan berdasarkan tokenizer GPT yang dipilih. Periksa hasil kompresi sebelum digunakan; jumlah token yang lebih kecil tidak menjamin makna tetap sama atau jumlah token sama pada semua model.

## Jalankan secara lokal

Gunakan Node.js versi baru yang kompatibel dengan Vite 8 dan npm.

```sh
npm install
npm run dev
```

Buka <http://localhost:3000/>. Untuk memeriksa atau membuat build:

```sh
npm run check
npm run build
```

Hasil build berupa situs statis di folder `dist/`.

## Model lokal opsional

Pemeriksaan cepat dapat digunakan tanpa model. Untuk tinjauan Qwen, pasang [Ollama](https://ollama.com/download), jalankan `ollama pull qwen3.5:4b`, lalu gunakan tombol tinjauan di Prompt Review. Halaman HTTPS yang dihosting mungkin tidak dapat terhubung ke Ollama di perangkat Anda karena pembatasan origin atau jaringan lokal browser; Anda dapat memakai build lokal.

## Data

Kompresi dan pengolahan file berjalan di browser. Prompt, riwayat yang disimpan, tema, dan pilihan tokenizer memakai penyimpanan lokal browser. Beberapa draf dan teks instruksi yang diunggah memakai penyimpanan sesi; isi file yang diunggah diproses di memori. Tinjauan Qwen opsional mengirim teks yang dipilih ke Ollama di `localhost` saat Anda menjalankannya. Antarmuka juga memuat Google Fonts. Menghapus data browser akan menghapus draf dan prompt yang tersimpan secara lokal.

## Kontribusi dan laporan masalah

Baca [CONTRIBUTING.md](CONTRIBUTING.md) untuk panduan pengembangan dan pull request. Laporkan kerentanan secara privat sesuai [SECURITY.md](SECURITY.md).

## Lisensi

Hak cipta © 2026 joshadi15. Proyek ini memakai [GNU Affero General Public License v3.0 only](LICENSE) (`AGPL-3.0-only`). Anda boleh menggunakan, mengubah, dan membagikan aplikasi ini sesuai lisensi tersebut. Jika membagikan versi yang diubah, sertakan akses ke kode sumber terkait dengan lisensi yang sama. Jika menjalankan versi yang diubah untuk pengguna melalui jaringan, tawarkan kode sumber terkait kepada pengguna tersebut. Ketentuan lengkap ada dalam berkas lisensi.
