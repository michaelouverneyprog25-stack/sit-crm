import { getApps, initializeApp } from 'firebase/app'
import { firebaseConfig } from './config'

export const app = getApps().length ? getApps()[0] : initializeApp(firebaseConfig)
