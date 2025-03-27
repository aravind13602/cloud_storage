const express = require("express")
const multer = require("multer")
const fs = require("fs")
const path = require("path")

const app = express()
const PORT = 3000
const uploadFolder = path.join(__dirname, "uploads")

// Ensure the upload folder exists
if (!fs.existsSync(uploadFolder)) fs.mkdirSync(uploadFolder)

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadFolder)
  },
  filename: (req, file, cb) => {
    cb(null, file.originalname)
  },
})

const upload = multer({ storage: storage })

app.post("/upload", upload.single("file"), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: "No file uploaded" })
  }

  console.log("📥 File saved:", req.file.originalname)
  res.json({ message: "File uploaded successfully", filename: req.file.originalname })
})

app.listen(PORT, () => console.log(`🚀 Server running on http://localhost:${PORT}`))

