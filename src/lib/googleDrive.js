
const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID
const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.file'

let googleScriptPromise
let tokenClient

async function deleteGoogleDriveFile(fileId, accessToken) {
  const response = await fetch(
    `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}`,
    {
      method: 'DELETE',
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    }
  )

  if (!response.ok) {
    const error = await response.json().catch(() => ({}))
    throw new Error(error.error?.message || 'Google Drive rejected the cleanup.')
  }
}

function loadGoogleIdentityServices() {
  if (window.google?.accounts?.oauth2) {
    return Promise.resolve()
  }

  if (!googleScriptPromise) {
    googleScriptPromise = new Promise((resolve, reject) => {
      const script = document.createElement('script')
      script.src = 'https://accounts.google.com/gsi/client'
      script.async = true
      script.defer = true
      script.onload = resolve
      script.onerror = () => {
        googleScriptPromise = null
        reject(new Error('Could not load Google sign-in services.'))
      }
      document.head.appendChild(script)
    })
  }

  return googleScriptPromise
}

export async function uploadToGoogleDrive(file) {
  if (!GOOGLE_CLIENT_ID) {
    throw new Error('Google Client ID is missing from .env.')
  }

  if (!file) {
    throw new Error('Please select a file to upload.')
  }

  await loadGoogleIdentityServices()

  const accessToken = await new Promise((resolve, reject) => {
    try {
      if (!tokenClient) {
        tokenClient = window.google.accounts.oauth2.initTokenClient({
          client_id: GOOGLE_CLIENT_ID,
          scope: DRIVE_SCOPE,
          callback: (response) => {
            if (response.error) {
              reject(new Error(response.error_description || response.error))
              return
            }
            resolve(response.access_token)
          },
          error_callback: (error) => {
            reject(new Error(error.message || 'Google sign-in was cancelled.'))
          },
        })
      } else {
        tokenClient.callback = (response) => {
          if (response.error) {
            reject(new Error(response.error_description || response.error))
            return
          }
          resolve(response.access_token)
        }
      }

      tokenClient.requestAccessToken({
  prompt: '',
})
    } catch (error) {
      reject(error)
    }
  })

  const metadata = {
    name: file.name,
    mimeType: file.type || 'application/octet-stream',
  }

  const boundary = `sabsa_${crypto.randomUUID()}`
  const body = new Blob([
    `--${boundary}\r\n`,
    'Content-Type: application/json; charset=UTF-8\r\n\r\n',
    JSON.stringify(metadata),
    `\r\n--${boundary}\r\n`,
    `Content-Type: ${metadata.mimeType}\r\n\r\n`,
    file,
    `\r\n--${boundary}--`,
  ])

  const uploadResponse = await fetch(
    'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,mimeType,size,webViewLink',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': `multipart/related; boundary=${boundary}`,
      },
      body,
    }
  )

  const uploadedFile = await uploadResponse.json().catch(() => ({}))

  if (!uploadResponse.ok) {
    throw new Error(
      uploadedFile.error?.message || 'Google Drive upload failed.'
    )
  }

  const permissionResponse = await fetch(
    `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(uploadedFile.id)}/permissions`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        type: 'anyone',
        role: 'reader',
      }),
    }
  )

  if (!permissionResponse.ok) {
    const permissionError = await permissionResponse.json().catch(() => ({}))
    const message =
      permissionError.error?.message || 'Google Drive rejected the permission.'

    try {
      await deleteGoogleDriveFile(uploadedFile.id, accessToken)
    } catch (cleanupError) {
      throw new Error(
        `File uploaded, but public viewer access could not be enabled: ${message} The file remains in your Drive because automatic cleanup failed: ${cleanupError.message}`
      )
    }

    throw new Error(
      `Google Drive could not enable public viewer access: ${message} The uploaded file was removed.`
    )
  }

  return {
    id: uploadedFile.id,
    name: uploadedFile.name,
    mimeType: uploadedFile.mimeType,
    size: Number(uploadedFile.size || file.size),
    url:
      uploadedFile.webViewLink ||
      `https://drive.google.com/file/d/${uploadedFile.id}/view`,
    remove: () => deleteGoogleDriveFile(uploadedFile.id, accessToken),
  }
}
