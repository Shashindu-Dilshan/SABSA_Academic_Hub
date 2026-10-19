
import { PublicClientApplication } from '@azure/msal-browser'

const clientId = import.meta.env.VITE_MSAL_CLIENT_ID
const tenantId = import.meta.env.VITE_MSAL_TENANT_ID
const redirectUri = import.meta.env.VITE_MSAL_REDIRECT_URI

export const msalConfig = {
  auth: {
    clientId,
    authority: `https://login.microsoftonline.com/${tenantId}`,
    redirectUri,
  },
  cache: {
    cacheLocation: 'localStorage',
  },
}

export const msalInstance = new PublicClientApplication(msalConfig)

export const msalReady = (async () => {
  await msalInstance.initialize()

  // Process any redirect response before starting a new interaction.
  const redirectResult = await msalInstance.handleRedirectPromise()

  if (redirectResult?.account) {
    msalInstance.setActiveAccount(redirectResult.account)
  } else {
    const accounts = msalInstance.getAllAccounts()

    if (accounts.length > 0 && !msalInstance.getActiveAccount()) {
      msalInstance.setActiveAccount(accounts[0])
    }
  }

  return msalInstance
})()
