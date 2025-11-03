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
app.use(express.json({ limit: '100mb' }));
app.use(express.urlencoded({ limit: '100mb', extended: true }));

// File upload middleware
app.use(fileUpload({
  limits: { fileSize: 100 * 1024 * 1024 }, // 100MB
  abortOnLimit: true,
  responseOnLimit: 'File size exceeds maximum limit of 100MB',
  uploadTimeout: 60000,
  useTempFiles: true,
  tempFileDir: '/tmp/',
  debug: true
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
  console.log("Files:", req.files);
  if (!req.files || !req.files.uploadFile) {
    return res.status(400).json({ 
      success: false,
      error: "No file with name 'uploadFile' found" 
    });
  }

  const uploadedFile = req.files.uploadFile;
  const encryptedBuffer = encryptBuffer(uploadedFile.data);
  const scrambledName = generateRandomFilename(uploadedFile.name);
  const savePath = path.join(uploadsDir, scrambledName);

  try {
    fs.writeFileSync(savePath, encryptedBuffer);
    console.log("File encrypted and saved:", scrambledName);
    res.json({ 
      success: true, 
      message: "Encrypted file saved successfully!", 
      filename: scrambledName 
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

// Download endpoint
app.get("/download/:filename", (req, res) => {
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
