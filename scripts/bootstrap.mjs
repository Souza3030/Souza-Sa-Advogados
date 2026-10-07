import { initializeApp, applicationDefault, cert } from 'firebase-admin/app'
import { getAuth } from 'firebase-admin/auth'
import { getFirestore, FieldValue } from 'firebase-admin/firestore'

const args = Object.fromEntries(process.argv.slice(2).map(part => {
  const [key, ...value] = part.replace(/^--/, '').split('=')
  return [key, value.join('=')]
}))
const projectId = args['project-id'] || process.env.GOOGLE_CLOUD_PROJECT
const azrielEmail = args['azriel-email']?.trim().toLowerCase()
const franciscoEmail = args['francisco-email']?.trim().toLowerCase()
if (!projectId || !azrielEmail || !franciscoEmail || azrielEmail === franciscoEmail) {
  console.error('Uso: npm run bootstrap -- --project-id=ID --azriel-email=EMAIL --francisco-email=EMAIL')
  process.exit(1)
}

let credential = applicationDefault()
if (process.env.FIREBASE_ADMIN_SA_JSON) {
  let account
  try { account = JSON.parse(process.env.FIREBASE_ADMIN_SA_JSON) }
  catch { throw new Error('FIREBASE_ADMIN_SA_JSON contém JSON inválido.') }
  if (account.project_id !== projectId) throw new Error('A conta administrativa pertence a outro projeto.')
  credential = cert(account)
}
initializeApp({ credential, projectId })
const auth = getAuth()
const db = getFirestore()
const firmId = 'souza-sa'
const partners = [
  { email: azrielEmail, name: 'Azriel de Souza Soares' },
  { email: franciscoEmail, name: 'Francisco de Sá' },
]

const foundUsers = await Promise.all(partners.map(async partner => {
  try { return await auth.getUserByEmail(partner.email) }
  catch (error) {
    if (error.code !== 'auth/user-not-found') throw error
    return null
  }
}))
const existingProfiles = await Promise.all(foundUsers.map(user => user ? db.collection('users').doc(user.uid).get() : null))
for (const snapshot of existingProfiles) {
  if (snapshot?.exists && snapshot.data().lawFirmId !== firmId) throw new Error(`A conta ${snapshot.id} já pertence a outro escritório.`)
}
const authUsers = await Promise.all(partners.map((partner, index) => foundUsers[index] || auth.createUser({ email: partner.email, displayName: partner.name })))

const batch = db.batch()
const firm = db.collection('lawFirms').doc(firmId)
const firmSnapshot = await firm.get()
if (!firmSnapshot.exists) batch.set(firm, {
  name: 'Azriel de Souza Soares & Francisco de Sá Advocacia',
  cnpj: '', email: '', phone: '', createdAt: FieldValue.serverTimestamp(),
})
partners.forEach((partner, index) => {
  const uid = authUsers[index].uid
  const profile = db.collection('users').doc(uid)
  if (!existingProfiles[index]?.exists) batch.set(profile, {
    name: partner.name, email: partner.email,
    role: 'ADVOGADO', lawFirmId: firmId, partner: true, active: true,
    createdAt: FieldValue.serverTimestamp(),
  })
  batch.set(db.collection('lawyerDirectory').doc(uid), {
    name: partner.name, lawFirmId: firmId, active: true,
  }, { merge: true })
})
await batch.commit()
console.log('Escritório e contas individuais dos dois sócios preparados. Cada sócio pode definir a senha pela recuperação de acesso.')
