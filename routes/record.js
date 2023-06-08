const express = require("express");
const mysql = require("mysql");
const admin = require("firebase-admin");
const axios = require("axios");
const csv = require("csvtojson");
const { Storage } = require("@google-cloud/storage");
const fetch = require("isomorphic-fetch");


const router = express.Router();

// Inisialisasi aplikasi Firebase Admin SDK
const serviceAccount = require("../serviceaccountkey.json"); // Sesuaikan path dengan lokasi file Anda
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL:
    "https://mobile-notification-90a3a-default-rtdb.asia-southeast1.firebasedatabase.app",
});

const connection = mysql.createConnection({
  host: "34.101.222.48",
  user: "root",
  database: "capstone_db",
  password: "CapstoneAnjay02",
});

// android menginsert data user ke db sql
router.post("/insertDataUser", async (req, res) => {
  try {
    const app_key = req.body.app_key;
    const secret_key = req.body.secret_key;

    const checkQuery = "SELECT COUNT(*) AS count FROM user WHERE app_key = ?";
    connection.query(checkQuery, [app_key], async (checkErr, checkResult) => {
      if (checkErr) {
        res.status(500).send({ message: checkErr.sqlMessage });
      } else {
        const userCount = checkResult[0].count;
        if (userCount > 0) {
          // Jika app_key sudah ada, lanjutkan ke langkah berikutnya
          try {
            // Mengambil bearer token
            const authResponse = await fetch(
              "https://api.cloudraya.com/v1/api/gateway/user/auth",
              {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                },
                body: JSON.stringify({
                  app_key: app_key,
                  secret_key: secret_key,
                }),
              }
            );
            const authData = await authResponse.json();
            const bearerToken = authData.data.bearer_token;

            // Memastikan authData memiliki properti data sebelum melanjutkan
            if (authData.data) {
              // Mengambil daftar VM dengan menggunakan bearer token
              const vmListResponse = await fetch(
                "https://api.cloudraya.com/v1/api/gateway/user/virtualmachines",
                {
                  headers: {
                    Authorization: `Bearer ${bearerToken}`,
                  },
                }
              );
              const vmListData = await vmListResponse.json();

              // Memastikan vmListData memiliki properti data sebelum melanjutkan
              if (vmListData.data) {
                const vmList = Object.values(vmListData.data);

                // Membandingkan data VM dengan yang ada di tabel vm_list
                const checkVmQuery =
                  "SELECT COUNT(*) AS count FROM vm_list WHERE app_key = ?";
                connection.query(
                  checkVmQuery,
                  [app_key],
                  async (checkVmErr, checkVmResult) => {
                    if (checkVmErr) {
                      res.status(500).send({ message: checkVmErr.sqlMessage });
                    } else {
                      const vmCount = checkVmResult[0].count;

                      if (vmCount === vmList.length) {
                        // Jika jumlah data VM sama, tidak perlu melakukan eksekusi tambahan
                        res
                          .status(200)
                          .send({
                            message: "Data user and VM already inserted",
                          });
                      } else {
                        // Hapus data VM yang sudah ada di tabel vm_list
                        const deleteVmQuery =
                          "DELETE FROM vm_list WHERE app_key = ?";
                        connection.query(
                          deleteVmQuery,
                          [app_key],
                          async (deleteErr, deleteResult) => {
                            if (deleteErr) {
                              res
                                .status(500)
                                .send({ message: deleteErr.sqlMessage });
                            } else {
                              // Menyimpan daftar VM baru ke dalam tabel VM di database
                              const vmQuery =
                                "INSERT INTO vm_list (app_key, local_id) VALUES (?, ?)";
                              for (const vm of vmList) {
                                await connection.query(vmQuery, [
                                  app_key,
                                  vm.local_id,
                                ]);
                              }

                              res
                                .status(200)
                                .send({
                                  message:
                                    "Data user and VM inserted successfully",
                                });
                            }
                          }
                        );
                      }
                    }
                  }
                );
              } else {
                res
                  .status(500)
                  .send({
                    message: "Invalid response: vmList data is missing",
                  });
              }
            } else {
              res
                .status(500)
                .send({
                  message: "Invalid response: authData is missing data",
                });
            }
          } catch (error) {
            res.status(500).send({ message: error.message });
          }
        } else {
          // Jika app_key belum ada, masukkan data user baru ke dalam tabel user
          const query = "INSERT INTO user (app_key, secret_key) VALUES (?, ?)";
          connection.query(
            query,
            [app_key, secret_key],
            async (err, result) => {
              if (err) {
                res.status(500).send({ message: err.sqlMessage });
              } else {
                res
                  .status(200)
                  .send({ message: "Data user inserted successfully" });
              }
            }
          );
        }
      }
    });
  } catch (error) {
    res.status(500).send({ message: error.message });
  }
});





router.get("/convert", async (req, res) => {
  const bucketName = "hasil-bucket-csv"; // Ganti dengan nama bucket Anda
  const csvFilename = "cost_projection_test.csv"; // Ganti dengan nama file CSV Anda

  try {
    // Membaca file CSV dari Google Cloud Storage
    const storage = new Storage();
    const bucket = storage.bucket(bucketName);
    const file = bucket.file(csvFilename);
    const csvData = await file.download();

    // Mengubah data CSV menjadi JSON
    const jsonData = await csv().fromString(csvData.toString());

    // Mengirimkan JSON sebagai respons HTTP
    res.json(jsonData);
  } catch (error) {
    console.error("Terjadi kesalahan:", error);
    res.status(500).send("Terjadi kesalahan dalam memproses data CSV.");
  }
});

router.post("/pushNotification", async (req, res) => {
  const { app_key, vm_id, bearer, request, site_url } = req.body;
  try {
    // Mengambil token FCM dari Realtime Database
    const snapshot = await admin
      .database()
      .ref(`users/${app_key}/fcm_token`)
      .once("value");
    const token = snapshot.val();

    // Mengirim notifikasi ke perangkat setelah VM dimulai
    const title = "Terjadi Aktifitas Pada VM anda";
    const body = `VM anda dengan id: ${vm_id} akan dilakukan ${request}`;

    const payload = {
      to: token,
      data: {
        title: title,
        body: body,
        click_action: "ACTION_CONFIRMATION",
        vm_id: vm_id,
        bearer: bearer,
        request: request,
        site_url: site_url,
      },
    };

    const response = await axios.post(
      "https://fcm.googleapis.com/fcm/send",
      payload,
      {
        headers: {
          "Content-Type": "application/json",
          Authorization:
            "Bearer AAAA8yykx1E:APA91bFe_UxUMdiMKm0BBI7l42hKqEFkzDtqQdGTS9xHWPgIjysaJ5G1VtAyu8smbEyD59TKBN1jHmUhCh8pl6wgBLjYr8Juo-xV53paKIY37aTiA4sY-IDAyIssnruFTWfdrhULcvU3", // Ganti dengan Server Key FCM Anda
        },
      }
    );

    console.log("Notifikasi berhasil dikirim:", response.data);
    res.status(200).send({ message: `hasil payload ${token}` });
  } catch (error) {
    console.log("Terjadi kesalahan:", error);
    res.status(500).send("Terjadi kesalahan");
  }
});

module.exports = router;
