
import {
  InteractionRequiredAuthError,
} from '@azure/msal-browser'

import { msalInstance, msalReady } from './msal.js'

const graphScopes = ['User.Read', 'Files.ReadWrite']

// Prevent overlapping interactive authentication requests.
let interactionPromise = null

async function runInteraction(action) {
  if (interactionPromise) {
    return interactionPromise
  }

  interactionPromise = action()

  try {
    return await interactionPromise
  } finally {
    interactionPromise = null
  }
}

export async function signInToMicrosoft() {
  await msalReady

  return runInteraction(async () => {
    const result = await msalInstance.loginPopup({
      scopes: graphScopes,
    })

    if (!result.account) {
      throw new Error('Microsoft sign-in completed without an account.')
    }

    msalInstance.setActiveAccount(result.account)

    return result.account
  })
}

export async function getMicrosoftAccessToken() {
  await msalReady

  const account =
    msalInstance.getActiveAccount() ??
    msalInstance.getAllAccounts()[0]

  if (!account) {
    throw new Error('Sign in to Microsoft before accessing OneDrive.')
  }

  msalInstance.setActiveAccount(account)

  try {
    const result = await msalInstance.acquireTokenSilent({
      account,
      scopes: graphScopes,
    })

    return result.accessToken
  } catch (error) {
    if (error instanceof InteractionRequiredAuthError) {
      return runInteraction(async () => {
        const result = await msalInstance.acquireTokenPopup({
          account,
          scopes: graphScopes,
        })

        return result.accessToken
      })
    }

    throw error
  }
}

export async function getMicrosoftProfile() {
  const accessToken = await getMicrosoftAccessToken()

  const response = await fetch(
    'https://graph.microsoft.com/v1.0/me',
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    },
  )

  if (!response.ok) {
    throw new Error(
      `Microsoft Graph profile request failed: ${response.status}`,
    )
  }

  return response.json()
}