const { ipcRenderer } = require("electron")

// DOM Elements
const registrationPage = document.getElementById("registrationPage")
const mainAppPage = document.getElementById("mainAppPage")
const registrationForm = document.getElementById("registrationForm")
const jobForm = document.getElementById("jobForm")
const jobModal = document.getElementById("jobModal")
const createJobBtn = document.getElementById("createJobBtn")
const cancelJobBtn = document.getElementById("cancelJobBtn")
const jobsList = document.getElementById("jobsList")
const activityLog = document.getElementById("activityLog")
const autoStartToggle = document.getElementById("autoStartToggle")

// Add file viewer modal controls
const fileViewerModal = document.getElementById("fileViewerModal")
const closeFileViewerBtn = document.getElementById("closeFileViewerBtn")
const filesList = document.getElementById("filesList")
const fileViewerTitle = document.getElementById("fileViewerTitle")

closeFileViewerBtn.addEventListener("click", () => {
  fileViewerModal.classList.add("hidden")
})

// Check if user is registered
document.addEventListener("DOMContentLoaded", async () => {
  const isRegistered = await ipcRenderer.invoke("check-registration")
  if (isRegistered) {
    showMainApp()
    loadUserData()
    loadJobs()
  } else {
    showRegistration()
  }

  // Check initial auto-start status
  checkAutoStartStatus()
})

// Registration form submission
registrationForm.addEventListener("submit", async (e) => {
  e.preventDefault()

  const userData = {
    email: document.getElementById("email").value,
    name: document.getElementById("name").value,
    companyName: document.getElementById("companyName").value,
    companyId: document.getElementById("companyId").value.toUpperCase(),
  }

  try {
    await ipcRenderer.invoke("register-user", userData)
    showMainApp()
    loadUserData()
    addActivityLog(`Registration completed. Created folder for company ${userData.companyId}`)
  } catch (error) {
    alert(`Registration failed: ${error.message || "Unknown error"}`)
  }
})

// Load user data into the main app
async function loadUserData() {
  const userData = await ipcRenderer.invoke("get-user-data")
  if (userData) {
    document.getElementById("displayCompanyName").textContent = userData.companyName
    document.getElementById("displayCompanyId").textContent = userData.companyId

    // Get company folder path
    const folderPath = await ipcRenderer.invoke("get-company-folder-path")
    document.getElementById("folderPath").textContent = folderPath
  }
}

// Modify the loadJobs function to add click event for viewing files
async function loadJobs() {
  const jobs = await ipcRenderer.invoke("get-jobs")

  if (jobs && jobs.length > 0) {
    jobsList.innerHTML = ""

    jobs.forEach((job) => {
      const jobElement = document.createElement("div")
      jobElement.className =
        "flex justify-between items-center bg-gray-50 p-3 rounded-md mb-2 cursor-pointer hover:bg-gray-100"
      jobElement.innerHTML = `
                <div class="flex-grow">
                    <div class="font-medium">${job.jobName}</div>
                    <div class="text-sm text-gray-500">ID: ${job.jobId} | Folder: ${job.folderName}</div>
                </div>
                <div class="flex items-center">
                    <button class="view-files-btn text-blue-600 hover:text-blue-800 mr-3" data-job-id="${job.jobId}" data-job-name="${job.jobName}">
                        <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                        </svg>
                    </button>
                    <button class="delete-job-btn text-red-600 hover:text-red-800" data-job-id="${job.jobId}">
                        <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                    </button>
                </div>
            `
      jobsList.appendChild(jobElement)

      // Add view files event listener
      jobElement.querySelector(".view-files-btn").addEventListener("click", async (e) => {
        e.stopPropagation()
        const jobId = e.currentTarget.getAttribute("data-job-id")
        const jobName = e.currentTarget.getAttribute("data-job-name")
        await showJobFiles(jobId, jobName)
      })

      // Add delete event listener
      jobElement.querySelector(".delete-job-btn").addEventListener("click", async (e) => {
        e.stopPropagation()
        const jobId = e.currentTarget.getAttribute("data-job-id")
        if (confirm(`Are you sure you want to delete job with ID ${jobId}?`)) {
          try {
            await ipcRenderer.invoke("delete-job", jobId)
            loadJobs()
            addActivityLog(`Deleted job with ID: ${jobId}`)
          } catch (error) {
            alert(`Failed to delete job: ${error.message || "Unknown error"}`)
          }
        }
      })

      // Add click event to the whole job element to view files
      jobElement.addEventListener("click", async () => {
        const jobId = jobElement.querySelector(".view-files-btn").getAttribute("data-job-id")
        const jobName = jobElement.querySelector(".view-files-btn").getAttribute("data-job-name")
        await showJobFiles(jobId, jobName)
      })
    })
  } else {
    jobsList.innerHTML = '<div class="text-sm text-gray-500 italic">No jobs created yet.</div>'
  }
}

// Job modal controls
createJobBtn.addEventListener("click", () => {
  jobModal.classList.remove("hidden")
  document.getElementById("jobName").value = ""
  document.getElementById("jobId").value = ""
})

cancelJobBtn.addEventListener("click", () => {
  jobModal.classList.add("hidden")
})

// Job form submission
jobForm.addEventListener("submit", async (e) => {
  e.preventDefault()

  const jobData = {
    jobName: document.getElementById("jobName").value,
    jobId: document.getElementById("jobId").value.toUpperCase(),
  }

  try {
    await ipcRenderer.invoke("create-job", jobData)
    jobModal.classList.add("hidden")
    loadJobs()
    addActivityLog(`Created new job: ${jobData.jobName} (${jobData.jobId})`)
  } catch (error) {
    alert(`Failed to create job: ${error.message || "Unknown error"}`)
  }
})

// Folder path display
ipcRenderer.on("folder-watched", (event, folder) => {
  document.getElementById("folderPath").textContent = folder
})

// Folder selection button
document.getElementById("selectFolder").addEventListener("click", async () => {
  const folder = await ipcRenderer.invoke("select-folder")
  if (folder) {
    document.getElementById("folderPath").textContent = folder
  }
})

// Minimize to tray functionality
document.addEventListener("DOMContentLoaded", () => {
  // Optional: Add a minimize to tray button if you want explicit control
  const minimizeBtn = document.getElementById("minimizeToTray")
  if (minimizeBtn) {
    minimizeBtn.addEventListener("click", () => {
      ipcRenderer.send("minimize-to-tray")
    })
  }
})

// File upload listener
ipcRenderer.on("file-uploaded", (event, filename) => {
  addActivityLog(`File uploaded: ${filename}`)
})

// File renamed listener
ipcRenderer.on("file-renamed", (event, oldName, newName) => {
  addActivityLog(`File renamed: ${oldName} → ${newName}`)
})

// Add activity log entry
function addActivityLog(message) {
  const now = new Date()
  const timeString = now.toLocaleTimeString()

  const logEntry = document.createElement("div")
  logEntry.className = "mb-1"
  logEntry.innerHTML = `<span class="text-gray-500">[${timeString}]</span> ${message}`

  activityLog.insertBefore(logEntry, activityLog.firstChild)

  // Remove "No recent activity" message if it exists
  const noActivityMsg = activityLog.querySelector(".text-gray-500")
  if (noActivityMsg && noActivityMsg.textContent === "No recent activity.") {
    activityLog.removeChild(noActivityMsg)
  }
}

// Auto-start toggle functionality
async function checkAutoStartStatus() {
  try {
    const isEnabled = await ipcRenderer.invoke("check-autostart")
    autoStartToggle.checked = isEnabled
  } catch (error) {
    console.error("Error checking auto-start:", error)
    autoStartToggle.checked = false
  }
}

// Toggle auto-start when switch is clicked
autoStartToggle.addEventListener("change", async () => {
  try {
    const result = await ipcRenderer.invoke("toggle-autostart", autoStartToggle.checked)

    // If toggle fails, revert the checkbox
    if (result !== autoStartToggle.checked) {
      autoStartToggle.checked = result
    }
  } catch (error) {
    console.error("Error toggling auto-start:", error)
    autoStartToggle.checked = !autoStartToggle.checked
  }
})

// Helper functions to show/hide pages
function showRegistration() {
  registrationPage.classList.remove("hidden")
  mainAppPage.classList.add("hidden")
}

function showMainApp() {
  registrationPage.classList.add("hidden")
  mainAppPage.classList.remove("hidden")
}

// Add function to show job files
async function showJobFiles(jobId, jobName) {
  try {
    fileViewerTitle.textContent = `Files for Job: ${jobName} (${jobId})`

    // Show loading state
    filesList.innerHTML = `
            <tr>
                <td colspan="3" class="px-6 py-4 text-sm text-center">
                    <div class="flex justify-center items-center">
                        <svg class="animate-spin -ml-1 mr-3 h-5 w-5 text-blue-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                            <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                            <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                        </svg>
                        Loading files...
                    </div>
                </td>
            </tr>
        `

    // Show the modal
    fileViewerModal.classList.remove("hidden")

    // Fetch files for this job
    const files = await ipcRenderer.invoke("get-job-files", jobId)

    if (files && files.length > 0) {
      filesList.innerHTML = ""

      files.forEach((file) => {
        const fileDate = new Date(file.createdAt).toLocaleString()
        const fileSize = formatFileSize(file.size)

        const fileRow = document.createElement("tr")
        fileRow.innerHTML = `
                    <td class="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                        ${file.name}
                    </td>
                    <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        ${fileSize}
                    </td>
                    <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        ${fileDate}
                    </td>
                `
        filesList.appendChild(fileRow)
      })
    } else {
      filesList.innerHTML = `
                <tr>
                    <td colspan="3" class="px-6 py-4 text-sm text-gray-500 text-center">
                        No files found for this job.
                    </td>
                </tr>
            `
    }
  } catch (error) {
    console.error("Error showing job files:", error)
    filesList.innerHTML = `
            <tr>
                <td colspan="3" class="px-6 py-4 text-sm text-red-500 text-center">
                    Error loading files: ${error.message || "Unknown error"}
                </td>
            </tr>
        `
  }
}

// Helper function to format file size
function formatFileSize(bytes) {
  if (bytes === 0) return "0 Bytes"

  const k = 1024
  const sizes = ["Bytes", "KB", "MB", "GB", "TB"]
  const i = Math.floor(Math.log(bytes) / Math.log(k))

  return Number.parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i]
}

