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

// CORS Middleware - MUST be before other middleware
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
  
  // Handle preflight requests
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  next();
});

// Body parser with increased limits
app.use(express.json({ limit: '100mb' }));
app.use(express.urlencoded({ limit: '100mb', extended: true }));

// File upload middleware with proper configuration
app.use(fileUpload({
  limits: { fileSize: 100 * 1024 * 1024 }, // 100MB max
  abortOnLimit: true,
  responseOnLimit: 'File size exceeds maximum limit of 100MB',
  uploadTimeout: 60000, // 60 seconds timeout
  useTempFiles: true,
  tempFileDir: '/tmp/',
  debug: true // Enable debug mode
}));

app.use(express.static("public"));

// Serve main page
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// Health check endpoint
app.get("/health", (req, res) => {
  res.json({ status: "OK", message: "Server is running" });
});

// Upload endpoint with better error handling
app.post("/upload", (req, res) => {
  console.log("Upload request received");
  console.log("Files:", req.files);
  console.log("Body:", req.body);

  if (!req.files || Object.keys(req.files).length === 0) {
    console.error("No files in request");
    return res.status(400).json({ 
      success: false,
      error: "No files were uploaded" 
    });
  }

  const uploadedFile = req.files.uploadFile;
  
  if (!uploadedFile) {
    return res.status(400).json({ 
      success: false,
      error: "No file with name 'uploadFile' found" 
    });
  }

  const uploadPath = path.join(uploadsDir, uploadedFile.name);

  uploadedFile.mv(uploadPath, (err) => {
    if (err) {
      console.error("Upload error:", err);
      return res.status(500).json({ 
        success: false,
        error: "Failed to upload file: " + err.message 
      });
    }
    
    console.log("File uploaded successfully:", uploadedFile.name);
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

// Error handling middleware
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
