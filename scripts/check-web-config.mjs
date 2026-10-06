const required = [
  'VITE_FIREBASE_API_KEY',
  'VITE_FIREBASE_AUTH_DOMAIN',
  'VITE_FIREBASE_PROJECT_ID',
  'VITE_FIREBASE_STORAGE_BUCKET',
  'VITE_FIREBASE_APP_ID',
]

const missing = required.filter(name => !process.env[name]?.trim())
if (missing.length) {
  console.error(`Configuração pública Firebase incompleta: ${missing.join(', ')}`)
  process.exit(1)
}
if (process.env.VITE_FIREBASE_PROJECT_ID !== 'souzaesa-e167b') {
  console.error('O ID do projeto Firebase não corresponde a souzaesa-e167b.')
  process.exit(1)
}
console.log('Configuração pública Firebase presente.')
