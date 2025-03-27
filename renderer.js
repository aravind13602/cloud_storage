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

// Load jobs list
async function loadJobs() {
  const jobs = await ipcRenderer.invoke("get-jobs")

  if (jobs && jobs.length > 0) {
    jobsList.innerHTML = ""

    jobs.forEach((job) => {
      const jobElement = document.createElement("div")
      jobElement.className = "flex justify-between items-center bg-gray-50 p-3 rounded-md"
      jobElement.innerHTML = `
                <div>
                    <div class="font-medium">${job.jobName}</div>
                    <div class="text-sm text-gray-500">ID: ${job.jobId} | Folder: ${job.folderName}</div>
                </div>
                <button class="delete-job-btn text-red-600 hover:text-red-800" data-job-id="${job.jobId}">
                    <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                </button>
            `
      jobsList.appendChild(jobElement)

      // Add delete event listener
      jobElement.querySelector(".delete-job-btn").addEventListener("click", async () => {
        if (confirm(`Are you sure you want to delete job ${job.jobName}?`)) {
          try {
            await ipcRenderer.invoke("delete-job", job.jobId)
            loadJobs()
            addActivityLog(`Deleted job: ${job.jobName} (${job.jobId})`)
          } catch (error) {
            alert(`Failed to delete job: ${error.message || "Unknown error"}`)
          }
        }
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

