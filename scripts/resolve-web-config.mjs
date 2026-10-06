import { appendFileSync } from 'node:fs'

const fields = {
  VITE_FIREBASE_API_KEY: 'apiKey',
  VITE_FIREBASE_AUTH_DOMAIN: 'authDomain',
  VITE_FIREBASE_STORAGE_BUCKET: 'storageBucket',
  VITE_FIREBASE_APP_ID: 'appId',
}
const missing = Object.keys(fields).filter(name => !process.env[name]?.trim())
if (!missing.length) process.exit(0)

const url = 'https://souzaesa-e167b.firebaseapp.com/__/firebase/init.json'
try {
  const response = await fetch(url, { signal: AbortSignal.timeout(10000) })
  if (!response.ok) throw new Error(`HTTP ${response.status}`)
  const config = await response.json()
  if (config.projectId !== 'souzaesa-e167b') throw new Error('ID do projeto diferente do esperado')
  if (!process.env.GITHUB_ENV) throw new Error('GITHUB_ENV indisponível; preencha o .env local manualmente')
  for (const name of missing) {
    const value = config[fields[name]]
    if (typeof value === 'string' && value && !value.includes('\n')) appendFileSync(process.env.GITHUB_ENV, `${name}=${value}\n`)
  }
  console.log('Configuração pública do aplicativo Web obtida do Firebase Hosting.')
} catch (error) {
  console.log(`Configuração pública não disponível no Firebase Hosting (${error.message}). Use as variáveis do repositório.`)
}
