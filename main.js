const { app, dialog, BrowserWindow, ipcMain, Tray, Menu } = require("electron")
const fs = require("fs").promises
const fsSync = require("fs")
const path = require("path")
const axios = require("axios")
const FormData = require("form-data")
const chokidar = require("chokidar")
const AutoLaunch = require("auto-launch")
const os = require("os")

class ElectronCloudSync {
  constructor() {
    this.selectedFolder = null
    this.mainWindow = null
    this.tray = null
    this.watcher = null
    this.autoLauncher = new AutoLaunch({
      name: "CloudSync",
      path: app.getPath("exe"),
    })
    this.userData = null
    this.jobs = []
    this.resourceNumbers = {} // To track resource numbers for each job
  }

  async init() {
    await this.createAppDirectories()
    this.setupAppLifecycle()
  }

  async createAppDirectories() {
    const appDataPath = path.join(app.getPath("userData"), "data")
    const uploadedFilesPath = path.join(appDataPath, "uploaded")

    try {
      await fs.mkdir(appDataPath, { recursive: true })
      await fs.mkdir(uploadedFilesPath, { recursive: true })
    } catch (error) {
      console.error("❌ Error creating app directories:", error)
    }
  }

  setupAppLifecycle() {
    app.whenReady().then(async () => {
      app.setName("CloudSync")
      this.createMainWindow()
      await this.loadAutoStartPreference()
      await this.loadUserData()
      await this.loadJobs()
      this.setupIpcHandlers()
    })

    app.on("window-all-closed", () => {
      if (process.platform !== "darwin") app.quit()
    })

    // Add proper quit handling
    app.on("before-quit", () => {
      app.isQuitting = true
    })
  }

  createMainWindow() {
    this.mainWindow = new BrowserWindow({
      width: 800,
      height: 700,
      webPreferences: {
        nodeIntegration: true,
        contextIsolation: false,
      },
      show: false, // Start hidden
    })

    this.mainWindow.loadFile("index.html")

    // Create tray icon
    this.createTray()

    // Handle window close event to minimize to tray instead of quitting
    this.mainWindow.on("close", (event) => {
      if (!app.isQuitting) {
        event.preventDefault()
        this.mainWindow.hide()
        return false
      }
      return true
    })

    // Show window when ready
    this.mainWindow.once("ready-to-show", () => {
      this.mainWindow.show()
    })
  }

  createTray() {
    // Use a default icon path - you may want to replace this with your custom icon
    const iconPath = path.join(__dirname, "icon.png")

    // Create the tray icon
    this.tray = new Tray(iconPath)
    this.tray.setToolTip("CloudSync")

    // Create context menu
    const contextMenu = Menu.buildFromTemplate([
      {
        label: "Show App",
        click: () => {
          this.mainWindow.show()
        },
      },
      {
        label: "Hide App",
        click: () => {
          this.mainWindow.hide()
        },
      },
      { type: "separator" },
      {
        label: "Quit",
        click: () => {
          app.isQuitting = true
          app.quit()
        },
      },
    ])

    this.tray.setContextMenu(contextMenu)

    // Toggle window visibility on tray icon click
    this.tray.on("click", () => {
      if (this.mainWindow.isVisible()) {
        this.mainWindow.hide()
      } else {
        this.mainWindow.show()
      }
    })
  }

  async loadAutoStartPreference() {
    const preferencePath = this.getPreferencePath("autostart-preference.json")

    try {
      // Ensure preference file exists
      if (!fsSync.existsSync(preferencePath)) {
        await fs.writeFile(preferencePath, JSON.stringify({ enabled: true }))
      }

      const data = await fs.readFile(preferencePath, "utf8")
      const { enabled } = JSON.parse(data)

      try {
        if (enabled) {
          await this.autoLauncher.enable()
          console.log("✅ Auto-start enabled")
        } else {
          await this.autoLauncher.disable()
          console.log("✅ Auto-start disabled")
        }
      } catch (launchError) {
        console.error("❌ Auto-start configuration error:", launchError)
      }
    } catch (error) {
      console.error("❌ Error loading auto-start preference:", error)
    }
  }

  async loadUserData() {
    const userDataPath = this.getPreferencePath("user-data.json")

    try {
      if (fsSync.existsSync(userDataPath)) {
        const data = await fs.readFile(userDataPath, "utf8")
        this.userData = JSON.parse(data)

        // Set up company folder watching if user is registered
        if (this.userData) {
          const companyFolderPath = this.getCompanyFolderPath()

          // Create company folder if it doesn't exist
          if (!fsSync.existsSync(companyFolderPath)) {
            await fs.mkdir(companyFolderPath, { recursive: true })
          }

          this.selectedFolder = companyFolderPath
          await this.setupFolderWatch(companyFolderPath)
        }
      }
    } catch (error) {
      console.error("❌ Error loading user data:", error)
    }
  }

  async loadJobs() {
    const jobsPath = this.getPreferencePath("jobs.json")

    try {
      if (fsSync.existsSync(jobsPath)) {
        const data = await fs.readFile(jobsPath, "utf8")
        this.jobs = JSON.parse(data)

        // Initialize resource numbers tracking
        this.jobs.forEach((job) => {
          const jobKey = this.userData.companyId + job.jobId
          this.resourceNumbers[jobKey] = { fileNo: 0 }
        })
      } else {
        // Create empty jobs file
        await fs.writeFile(jobsPath, JSON.stringify([]))
        this.jobs = []
      }
    } catch (error) {
      console.error("❌ Error loading jobs:", error)
      this.jobs = []
    }
  }

  getCompanyFolderPath() {
    if (!this.userData) return null
    return path.join(os.homedir(), "Desktop", this.userData.companyId)
  }

  getJobFolderPath(jobFolderName) {
    const companyFolderPath = this.getCompanyFolderPath()
    if (!companyFolderPath) return null
    return path.join(companyFolderPath, jobFolderName)
  }

  setupIpcHandlers() {
    // Registration handlers
    ipcMain.handle("check-registration", async () => {
      return !!this.userData
    })

    ipcMain.handle("register-user", async (event, userData) => {
      try {
        // Save user data
        await fs.writeFile(this.getPreferencePath("user-data.json"), JSON.stringify(userData))

        this.userData = userData

        // Create company folder on desktop
        const companyFolderPath = this.getCompanyFolderPath()
        await fs.mkdir(companyFolderPath, { recursive: true })

        // Set up folder watching
        this.selectedFolder = companyFolderPath
        await this.setupFolderWatch(companyFolderPath)

        return true
      } catch (error) {
        console.error("❌ Error registering user:", error)
        throw new Error("Failed to register user")
      }
    })

    ipcMain.handle("get-user-data", async () => {
      return this.userData
    })

    ipcMain.handle("get-company-folder-path", async () => {
      return this.getCompanyFolderPath()
    })

    // Job management handlers
    ipcMain.handle("get-jobs", async () => {
      return this.jobs
    })

    ipcMain.handle("create-job", async (event, jobData) => {
      try {
        // Check if job ID already exists
        const existingJob = this.jobs.find((job) => job.jobId === jobData.jobId)
        if (existingJob) {
          throw new Error(`Job ID ${jobData.jobId} already exists`)
        }

        // Get next job number
        const jobNo = (this.jobs.length + 1).toString().padStart(3, "0")

        // Create folder name (CompanyID + JobID + JobNo)
        const folderName = `${this.userData.companyId}${jobData.jobId}${jobNo}`

        // Create job folder
        const jobFolderPath = this.getJobFolderPath(folderName)
        await fs.mkdir(jobFolderPath, { recursive: true })

        // Add job to jobs list
        const newJob = {
          ...jobData,
          jobNo,
          folderName,
          createdAt: new Date().toISOString(),
        }

        this.jobs.push(newJob)

        // Save jobs to file
        await fs.writeFile(this.getPreferencePath("jobs.json"), JSON.stringify(this.jobs))

        // Initialize resource number tracking for this job
        const jobKey = this.userData.companyId + jobData.jobId
        this.resourceNumbers[jobKey] = { fileNo: 0 }

        // Update folder watching to include the new folder
        await this.setupFolderWatch(this.getCompanyFolderPath())

        return newJob
      } catch (error) {
        console.error("❌ Error creating job:", error)
        throw new Error(`Failed to create job: ${error.message}`)
      }
    })

    ipcMain.handle("delete-job", async (event, jobId) => {
      try {
        // Find job
        const jobIndex = this.jobs.findIndex((job) => job.jobId === jobId)
        if (jobIndex === -1) {
          throw new Error(`Job ID ${jobId} not found`)
        }

        const job = this.jobs[jobIndex]

        // Remove job from jobs list
        this.jobs.splice(jobIndex, 1)

        // Save jobs to file
        await fs.writeFile(this.getPreferencePath("jobs.json"), JSON.stringify(this.jobs))

        // Note: We don't delete the folder to prevent accidental data loss

        return true
      } catch (error) {
        console.error("❌ Error deleting job:", error)
        throw new Error(`Failed to delete job: ${error.message}`)
      }
    })

    // Auto-start toggle handler
    ipcMain.handle("toggle-autostart", async (event, enable) => {
      const preferencePath = this.getPreferencePath("autostart-preference.json")

      try {
        if (enable) {
          await this.autoLauncher.enable()
          await fs.writeFile(preferencePath, JSON.stringify({ enabled: true }))
          console.log("✅ Auto-start enabled")
          return true
        } else {
          await this.autoLauncher.disable()
          await fs.writeFile(preferencePath, JSON.stringify({ enabled: false }))
          console.log("✅ Auto-start disabled")
          return false
        }
      } catch (err) {
        console.error("❌ Error toggling auto-start:", err)
        return false
      }
    })

    // Check auto-start status handler
    ipcMain.handle("check-autostart", async () => {
      const preferencePath = this.getPreferencePath("autostart-preference.json")

      try {
        const data = await fs.readFile(preferencePath, "utf8")
        return JSON.parse(data).enabled
      } catch (err) {
        console.error("❌ Error checking auto-start:", err)
        return false
      }
    })
  }

  async saveSelectedFolder(folderPath) {
    const preferencePath = this.getPreferencePath("lastSelectedFolder.json")

    try {
      await fs.writeFile(preferencePath, JSON.stringify({ path: folderPath }))
    } catch (error) {
      console.error("❌ Error saving selected folder:", error)
    }
  }

  getPreferencePath(filename) {
    return path.join(app.getPath("userData"), "data", filename)
  }

  async setupFolderWatch(folderPath) {
    if (!folderPath) return

    console.log("🔍 Setting up folder watch:", folderPath)

    // Close previous watcher if exists
    if (this.watcher) {
      this.watcher.close()
    }

    // Create new watcher for the company folder and all job subfolders
    this.watcher = chokidar.watch(folderPath, {
      persistent: true,
      ignoreInitial: false,
      depth: Number.POSITIVE_INFINITY,
      ignored: /(^|[/\\])\../,
    })

    this.watcher
      .on("add", (filePath) => this.handleFileEvent("add", filePath))
      .on("change", (filePath) => this.handleFileEvent("change", filePath))
      .on("error", (error) => {
        console.error("❌ Watcher error:", error)
      })
  }

  handleFileEvent(eventType, filePath) {
    console.log(`📂 File ${eventType}:`, filePath)

    // Only process if user is registered
    if (!this.userData) return

    // Get the directory containing the file
    const dirPath = path.dirname(filePath)
    const fileName = path.basename(filePath)

    // Skip if it's not in a job folder
    if (!this.isInJobFolder(dirPath)) return

    // Get job information based on the folder
    const jobInfo = this.getJobInfoFromPath(dirPath)
    if (!jobInfo) return

    // Check if file needs renaming
    const filePrefix = this.userData.companyId + jobInfo.jobId

    if (!fileName.startsWith(filePrefix)) {
      // File needs renaming
      this.renameAndUploadFile(filePath, jobInfo)
    } else {
      // File already has correct naming, just upload
      this.uploadFile(filePath)
    }
  }

  isInJobFolder(dirPath) {
    // Check if the directory is one of our job folders
    return this.jobs.some((job) => {
      const jobFolderPath = this.getJobFolderPath(job.folderName)
      return dirPath === jobFolderPath
    })
  }

  getJobInfoFromPath(dirPath) {
    // Find which job folder this is
    for (const job of this.jobs) {
      const jobFolderPath = this.getJobFolderPath(job.folderName)
      if (dirPath === jobFolderPath) {
        return job
      }
    }
    return null
  }

  async renameAndUploadFile(filePath, jobInfo) {
    try {
      if (!fsSync.existsSync(filePath)) return

      const fileName = path.basename(filePath)
      const fileExt = path.extname(fileName)
      const dirPath = path.dirname(filePath)

      // Generate new file name
      const jobKey = this.userData.companyId + jobInfo.jobId

      // Initialize resource number if not exists
      if (!this.resourceNumbers[jobKey]) {
        this.resourceNumbers[jobKey] = { fileNo: 0 }
      }

      // Increment file number
      this.resourceNumbers[jobKey].fileNo++

      // Format file number with leading zeros
      const fileNo = this.resourceNumbers[jobKey].fileNo.toString().padStart(3, "0")

      // New file name format: CompanyID + JobID + "C" + ResNo + "_" + original filename
      const newFileName = `${jobKey}C${fileNo}_${fileName}`
      const newFilePath = path.join(dirPath, newFileName)

      // Rename the file
      await fs.rename(filePath, newFilePath)
      console.log(`✅ Renamed: ${fileName} -> ${newFileName}`)

      // Notify renderer
      this.mainWindow.webContents.send("file-renamed", fileName, newFileName)

      // Upload the renamed file
      this.uploadFile(newFilePath)
    } catch (error) {
      console.error("❌ Rename failed:", error.message)
    }
  }

  async uploadFile(filePath) {
    try {
      if (!fsSync.existsSync(filePath)) return

      const fileBuffer = await fs.readFile(filePath)
      const fileName = path.basename(filePath)

      const formData = new FormData()
      formData.append("file", fileBuffer, {
        filename: fileName,
        contentType: "application/octet-stream",
      })

      const response = await axios.post("http://localhost:3000/upload", formData, {
        headers: formData.getHeaders(),
      })

      console.log("✅ Uploaded:", response.data)
      this.mainWindow.webContents.send("file-uploaded", fileName)
    } catch (error) {
      console.error("❌ Upload failed:", error.message)
    }
  }
}

// Application initialization
const electronCloudSync = new ElectronCloudSync()
electronCloudSync.init()

