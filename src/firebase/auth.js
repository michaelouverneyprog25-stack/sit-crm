import {
  getAuth,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  sendPasswordResetEmail,
} from 'firebase/auth'
import { app } from './app'

const auth = getAuth(app)

export async function login(email, password) {
  return signInWithEmailAndPassword(auth, email, password)
}

export async function signup(email, password) {
  return createUserWithEmailAndPassword(auth, email, password)
}

export async function logout() {
  return signOut(auth)
}

export async function resetPassword(email) {
  return sendPasswordResetEmail(auth, email)
}

export { auth }
