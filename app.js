const express = require("express");
const fileUpload = require("express-fileupload");
const path = require("path");
const fs = require("fs");
const crypto = require("crypto"); // <-- NEW

const app = express();
const PORT = process.env.PORT || 10000;

// Uploads directory
const uploadsDir = path.join(__dirname, "uploads");
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Encryption key + params
const ENCRYPTION_KEY = crypto.randomBytes(32); // Should be stored securely!
const IV_LENGTH = 16;

// CORS Middleware
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  next();
});

// Body Parsers
app.use(express.json({ limit: 'infinity' }));
app.use(express.urlencoded({ limit: 'infinity', extended: true }));

// File upload middleware
app.use(fileUpload({
  uploadTimeout: 0, // No timeout
  useTempFiles: true,
  tempFileDir: '/tmp/',
  debug: false
}));

app.use(express.static("public"));

// Serve main page
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// Health check
app.get("/health", (req, res) => {
  res.json({ status: "OK", message: "Server is running" });
});

// ===== STEALTH ENCRYPTED UPLOAD ENDPOINT =====
// Now named /submitData with encrypt and randomize logic
function encryptBuffer(buffer) {
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv("aes-256-cbc", ENCRYPTION_KEY, iv);
  let encrypted = cipher.update(buffer);
  encrypted = Buffer.concat([encrypted, cipher.final()]);
  return Buffer.concat([iv, encrypted]);
}


function generateRandomFilename(originalName) {
  const ext = originalName.split('.').pop();
  return crypto.randomBytes(12).toString('hex') + '.' + ext;
}

app.post("/submitData", (req, res) => {
  console.log("Stealth upload request received");

  if (!req.files || !req.files.uploadFile) {
    return res.status(400).json({
      success: false,
      error: "No file with name 'uploadFile' found"
    });
  }

  const uploadedFile = req.files.uploadFile;
  const { clientChecksum } = req.body;

  // 1. Verify Checksum (if provided)
  // Since useTempFiles is true, uploadedFile.tempFilePath points to the file on disk
  if (clientChecksum) {
    try {
      const fileBuffer = fs.readFileSync(uploadedFile.tempFilePath);
      const serverChecksum = crypto.createHash('sha256').update(fileBuffer).digest('hex');

      if (serverChecksum !== clientChecksum) {
        // Cleanup
        fs.unlinkSync(uploadedFile.tempFilePath);
        return res.status(400).json({
          error: "Checksum verification failed! File may be corrupted."
        });
      }
      console.log("Checksum verified:", serverChecksum);
    } catch (err) {
      console.error("Checksum calculation error:", err);
      return res.status(500).json({ error: "Failed to verify checksum" });
    }
  }

  // 2. Encrypt and Save
  // We read from temp file, encrypt, and write to final destination
  const scrambledName = generateRandomFilename(uploadedFile.name);
  const savePath = path.join(uploadsDir, scrambledName);

  try {
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv("aes-256-cbc", ENCRYPTION_KEY, iv);

    // Read from the temp file created by express-fileupload
    const input = fs.createReadStream(uploadedFile.tempFilePath);
    const output = fs.createWriteStream(savePath);

    // Write IV first
    output.write(iv);

    // Pipe through cipher to output
    input.pipe(cipher).pipe(output);

    output.on('finish', () => {
      // Cleanup temp file
      fs.unlink(uploadedFile.tempFilePath, (err) => {
        if (err) console.error("Error deleting temp file:", err);
      });

      console.log("File encrypted and saved:", scrambledName);
      res.json({
        success: true,
        message: "File uploaded and verified successfully!",
        filename: scrambledName
      });
    });

    output.on('error', (err) => {
      console.error("Encryption write error:", err);
      res.status(500).json({ error: "Failed to save encrypted file" });
    });

  } catch (err) {
    console.error("Upload error:", err);
    res.status(500).json({
      success: false,
      error: "Failed to upload file: " + err.message
    });
  }
});

// List all files
app.get("/files", (req, res) => {
  fs.readdir(uploadsDir, (err, files) => {
    if (err) {
      console.error("Error reading files:", err);
      return res.status(500).json({ error: "Unable to scan files" });
    }
    const fileList = files.map(file => {
      const stats = fs.statSync(path.join(uploadsDir, file));
      return {
        name: file,
        size: stats.size,
        uploadDate: stats.mtime
      };
    });
    res.json(fileList);
  });
});

// Download endpoint (Renamed to /retrieve)
app.get("/retrieve/:filename", (req, res) => {
  const filename = req.params.filename;
  const filePath = path.join(uploadsDir, filename);
  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: "File not found" });
  }
  res.download(filePath, filename, (err) => {
    if (err) {
      console.error("Download error:", err);
      res.status(500).json({ error: "Failed to download file" });
    }
  });
});

// Delete endpoint
app.delete("/delete/:filename", (req, res) => {
  const filename = req.params.filename;
  const filePath = path.join(uploadsDir, filename);
  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: "File not found" });
  }
  fs.unlink(filePath, (err) => {
    if (err) {
      console.error("Delete error:", err);
      return res.status(500).json({ error: "Failed to delete file" });
    }
    res.json({ success: true, message: "File deleted successfully" });
  });
});

// Error handling
app.use((err, req, res, next) => {
  console.error("Server error:", err);
  res.status(500).json({
    success: false,
    error: err.message || "Internal server error"
  });
});

// Start server
app.listen(PORT, "0.0.0.0", () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Upload directory: ${uploadsDir}`);
});
