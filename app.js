const express = require("express");
const fileUpload = require("express-fileupload");
const path = require("path");
const fs = require("fs");

const app = express();
const PORT = process.env.PORT || 10000;

// Create uploads directory if it doesn't exist
const uploadsDir = path.join(__dirname, "uploads");
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Middleware
app.use(fileUpload({
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB max file size
}));
app.use(express.static("public"));
app.use(express.json());

// Serve main page
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// Upload endpoint
app.post("/upload", (req, res) => {
  if (!req.files || Object.keys(req.files).length === 0) {
    return res.status(400).json({ error: "No files were uploaded" });
  }

  const uploadedFile = req.files.uploadFile;
  const uploadPath = path.join(uploadsDir, uploadedFile.name);

  uploadedFile.mv(uploadPath, (err) => {
    if (err) {
      console.error(err);
      return res.status(500).json({ error: "Failed to upload file" });
    }
    res.json({ 
      success: true, 
      message: "File uploaded successfully!",
      filename: uploadedFile.name 
    });
  });
});

// List all files
app.get("/files", (req, res) => {
  fs.readdir(uploadsDir, (err, files) => {
    if (err) {
      return res.status(500).json({ error: "Unable to scan files" });
    }
    const fileList = files.map(file => ({
      name: file,
      size: fs.statSync(path.join(uploadsDir, file)).size
    }));
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
      console.error(err);
      res.status(500).json({ error: "Failed to download file" });
    }
  });
});

// Delete endpoint (optional)
app.delete("/delete/:filename", (req, res) => {
  const filename = req.params.filename;
  const filePath = path.join(uploadsDir, filename);
  
  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: "File not found" });
  }
  
  fs.unlink(filePath, (err) => {
    if (err) {
      return res.status(500).json({ error: "Failed to delete file" });
    }
    res.json({ success: true, message: "File deleted successfully" });
  });
});

// Start server
app.listen(PORT, "0.0.0.0", () => {
  console.log(`Server running on port ${PORT}`);
});
