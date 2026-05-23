/**
 * Creates or updates the first admin user in Firebase Auth and Firestore.
 *
 * Usage:
 *   GOOGLE_APPLICATION_CREDENTIALS="/path/to/serviceAccountKey.json" FIREBASE_PROJECT_ID="my-project" ADMIN_EMAIL="admin@example.com" ADMIN_PASSWORD="change-me" ADMIN_NAME="Admin" npm run seed-admin
 *   ADMIN_EMAIL="admin@example.com" ADMIN_PASSWORD="change-me" ADMIN_NAME="Admin" npm run seed-admin
 *     The second form works when serviceAccountKey.json exists in the project root.
 *
 * You can also pass flags:
 *   npm run seed-admin -- --project-id my-project --email admin@example.com --password change-me --name "Admin"
 */

const fs = require('fs')
const path = require('path')
const admin = require('firebase-admin')

const dotenvPath = path.resolve(__dirname, '..', '.env')
if (fs.existsSync(dotenvPath)) {
  const envContent = fs.readFileSync(dotenvPath, 'utf8')
  envContent.split(/\r?\n/).forEach((line) => {
    const match = line.match(/^\s*([^#=]+?)\s*=\s*(.*)$/)
    if (match) {
      const key = match[1].trim()
      const value = match[2].trim()
      if (!process.env[key]) process.env[key] = value
    }
  })
}

function getArg(name) {
  const index = process.argv.indexOf(`--${name}`)
  if (index === -1) return undefined
  return process.argv[index + 1]
}

function getRequiredValue(name, envName) {
  const value = getArg(name) || process.env[envName]
  if (!value) {
    throw new Error(`Missing ${envName}. Provide it as an env var or --${name}.`)
  }
  return value
}

function getOptionalValue(name, envName, fallback) {
  return getArg(name) || process.env[envName] || fallback
}

function parseServiceAccount(filePath) {
  try {
    const raw = fs.readFileSync(filePath, 'utf8')
    return JSON.parse(raw)
  } catch (error) {
    throw new Error(`Unable to parse service account JSON at ${filePath}: ${error.message}`)
  }
}

function parseServiceAccountJson(value) {
  try {
    return JSON.parse(value)
  } catch (error) {
    throw new Error(`Unable to parse service account JSON from environment variable: ${error.message}`)
  }
}

function validateServiceAccount(serviceAccount) {
  if (!serviceAccount || serviceAccount.type !== 'service_account') {
    throw new Error('Invalid service account JSON. The file must be a valid Firebase service account credential.')
  }

  const placeholders = [
    'YOUR_PROJECT_ID',
    'YOUR_PRIVATE_KEY',
    'YOUR_PRIVATE_KEY_ID',
    'YOUR_CLIENT_ID',
    'firebase-adminsdk-xxxxx',
  ]

  const jsonString = JSON.stringify(serviceAccount)
  for (const placeholder of placeholders) {
    if (jsonString.includes(placeholder)) {
      throw new Error('The service account JSON contains placeholder values. Replace them with your real Firebase service account key.')
    }
  }
}

function getServiceAccountCredentials() {
  const envJson = process.env.SERVICE_ACCOUNT_JSON
  if (envJson) {
    return parseServiceAccountJson(envJson)
  }

  const envPath = process.env.GOOGLE_APPLICATION_CREDENTIALS
  if (envPath) {
    const resolvedPath = path.resolve(process.cwd(), envPath)
    if (fs.existsSync(resolvedPath)) {
      return parseServiceAccount(resolvedPath)
    }
  }

  const localServiceAccountPath = path.resolve(__dirname, '..', 'serviceAccountKey.json')
  if (fs.existsSync(localServiceAccountPath)) {
    return parseServiceAccount(localServiceAccountPath)
  }

  return null
}

async function ensureAdminUser() {
  const email = getRequiredValue('email', 'ADMIN_EMAIL').trim().toLowerCase()
  const password = getRequiredValue('password', 'ADMIN_PASSWORD')
  const name = getOptionalValue('name', 'ADMIN_NAME', 'Administrador')
  const projectId = getOptionalValue('project-id', 'FIREBASE_PROJECT_ID')
  const role = 'Administrador'

  const serviceAccount = getServiceAccountCredentials()
  if (serviceAccount) {
    validateServiceAccount(serviceAccount)
  }

  const appOptions = {
    credential: serviceAccount
      ? admin.credential.cert(serviceAccount)
      : admin.credential.applicationDefault(),
  }

  if (projectId) {
    appOptions.projectId = projectId
  }

  admin.initializeApp(appOptions)

  const auth = admin.auth()
  const db = admin.firestore()

  let user
  let created = false

  try {
    user = await auth.getUserByEmail(email)
  } catch (error) {
    if (error.code !== 'auth/user-not-found') {
      throw error
    }

    user = await auth.createUser({
      email,
      password,
      displayName: name,
      disabled: false,
    })
    created = true
  }

  if (!created) {
    await auth.updateUser(user.uid, {
      displayName: name,
      password,
      disabled: false,
    })
  }

  await auth.setCustomUserClaims(user.uid, { role })

  await db.collection('users').doc(user.uid).set(
    {
      uid: user.uid,
      name,
      email,
      role,
      disabled: false,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      ...(created ? { createdAt: admin.firestore.FieldValue.serverTimestamp() } : {}),
    },
    { merge: true },
  )

  console.log(`${created ? 'Created' : 'Updated'} admin user:`)
  console.log(`  uid: ${user.uid}`)
  console.log(`  email: ${email}`)
  console.log(`  role: ${role}`)
}

ensureAdminUser()
  .then(() => process.exit(0))
  .catch((error) => {
    const code = error.code || error.errorInfo?.code
    console.error('Failed to seed admin user:', code ? `${code}: ${error.message}` : error.message)
    process.exit(1)
  })
