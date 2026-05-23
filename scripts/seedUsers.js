/**
 * Seed script to create users in Firebase Auth and Firestore using the Admin SDK.
 * Usage:
 * 1. Create a service account JSON in Firebase Console and set GOOGLE_APPLICATION_CREDENTIALS env var.
 * 2. Run: node scripts/seedUsers.js
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

admin.initializeApp()
const auth = admin.auth()
const db = admin.firestore()

const seed = async ()=>{
  const users = [
    {email:'admin@example.com', password:'password123', name:'Admin', role:'Administrador'},
    {email:'manager@example.com', password:'password123', name:'Gerente', role:'Gerente'},
    {email:'executive@example.com', password:'password123', name:'Executivo', role:'Executivo'},
    {email:'seller@example.com', password:'password123', name:'Vendedor', role:'Vendedor'}
  ]

  for(const u of users){
    try{
      const user = await auth.createUser({email:u.email, password:u.password, displayName:u.name})
      console.log('Created auth user', user.uid)
      await db.collection('users').doc(user.uid).set({name:u.name, email:u.email, role:u.role})
      console.log('Created profile for', u.email)
    }catch(err){
      console.error('Error creating', u.email, err.message)
    }
  }
  process.exit(0)
}

seed()
