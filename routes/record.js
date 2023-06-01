const express = require('express');
const admin = require('firebase-admin');
const nodemailer = require('nodemailer');
const router = express.Router();

// Inisialisasi aplikasi Firebase Admin SDK
const serviceAccount = require('../serviceaccountkey.json'); // Sesuaikan path dengan lokasi file Anda
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: 'https://mobile-notification-90a3a-default-rtdb.asia-southeast1.firebasedatabase.app'
});

router.get('/sendEmail', async (req, res) => {
    try {
    // Mengambil data terbaru dari Firebase Realtime Database
    const snapshot = await admin.database().ref('/drafts').once('value');
    const drafts = snapshot.val();

    // Mengambil draft email terbaru
    const draftIds = Object.keys(drafts);
    const latestDraftId = draftIds[draftIds.length - 1];
    const latestDraft = drafts[latestDraftId];

    // Mengambil subjek, teks email, dan alamat email penerima dari draft
    const subject = latestDraft.subject;
    const text = latestDraft.message;
    const recipientEmail = latestDraft.email;

    // Kirim email menggunakan Nodemailer
    const transporter = nodemailer.createTransport({
      host: "smtp.gmail.com",
      port: 465,
      secure: true,
      auth: {
        user: "wowrackmobileapp@gmail.com", // Ganti dengan alamat email pengirim
        pass: "owkwxvcdvvjqeren", // Ganti dengan kata sandi email pengirim
      },
    });

    const mailOptions = {
      from: "wowrackmobileapp@gmail.com", // Ganti dengan alamat email pengirim
      to: recipientEmail,
      subject: subject,
      text: text,
    };

    await transporter.sendMail(mailOptions);
    res.send('Email berhasil dikirim!');
  } catch (error) {
    console.error('Terjadi kesalahan:', error);
    res.status(500).send('Terjadi kesalahan saat mengirim email.');
  }
    
});

module.exports = router
