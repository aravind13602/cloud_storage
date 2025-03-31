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

// Enable CORS
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*")
  res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept")
  next()
})

app.post("/upload", upload.single("file"), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: "No file uploaded" })
  }

  console.log("📥 File saved:", req.file.originalname)
  res.json({ message: "File uploaded successfully", filename: req.file.originalname })
})

// Add endpoint to get files by prefix
app.get("/files", (req, res) => {
  const prefix = req.query.prefix

  if (!prefix) {
    return res.status(400).json({ error: "Prefix parameter is required" })
  }

  try {
    const files = fs
      .readdirSync(uploadFolder)
      .filter((file) => file.startsWith(prefix))
      .map((file) => {
        const stats = fs.statSync(path.join(uploadFolder, file))
        return {
          name: file,
          size: stats.size,
          createdAt: stats.birthtime,
        }
      })

    res.json({ files })
  } catch (error) {
    console.error("Error reading files:", error)
    res.status(500).json({ error: "Failed to read files" })
  }
})

app.listen(PORT, () => console.log(`🚀 Server running on http://localhost:${PORT}`))

