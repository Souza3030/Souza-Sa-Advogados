import { readFileSync } from 'node:fs'
import { beforeAll, afterAll, beforeEach, describe, expect, it } from 'vitest'
import { initializeTestEnvironment, assertFails, assertSucceeds, type RulesTestEnvironment } from '@firebase/rules-unit-testing'
import { doc, getDoc, setDoc } from 'firebase/firestore'

let env: RulesTestEnvironment

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-souza-sa-rules',
    firestore: { rules: readFileSync('firestore.rules', 'utf8') },
  })
})
afterAll(async () => { await env?.cleanup() })
beforeEach(async () => {
  await env.clearFirestore()
  await env.withSecurityRulesDisabled(async context => {
    const db = context.firestore()
    await Promise.all([
      setDoc(doc(db, 'users/azriel'), { role: 'ADVOGADO', lawFirmId: 'firm-a', active: true }),
      setDoc(doc(db, 'users/francisco'), { role: 'ADVOGADO', lawFirmId: 'firm-a', active: true }),
      setDoc(doc(db, 'users/outsider'), { role: 'ADVOGADO', lawFirmId: 'firm-b', active: true }),
      setDoc(doc(db, 'users/client'), { role: 'CLIENTE', lawFirmId: 'firm-a', active: true, clientCompanyId: 'company-a' }),
      setDoc(doc(db, 'companies/company-a'), { lawFirmId: 'firm-a', name: 'Empresa A', clientUserId: 'client', responsibleLawyerId: 'azriel' }),
      setDoc(doc(db, 'companies/company-b'), { lawFirmId: 'firm-b', name: 'Empresa B', responsibleLawyerId: 'outsider' }),
    ])
  })
})

describe('isolamento entre escritórios', () => {
  it('permite ambos os sócios e bloqueia advogado de outro escritório', async () => {
    const azriel = env.authenticatedContext('azriel').firestore()
    const francisco = env.authenticatedContext('francisco').firestore()
    const outsider = env.authenticatedContext('outsider').firestore()
    await assertSucceeds(getDoc(doc(azriel, 'companies/company-a')))
    await assertSucceeds(getDoc(doc(francisco, 'companies/company-a')))
    await assertFails(getDoc(doc(outsider, 'companies/company-a')))
    await assertFails(getDoc(doc(azriel, 'companies/company-b')))
  })
  it('impede criar dados em outro escritório ou alterar lawFirmId', async () => {
    const db = env.authenticatedContext('azriel').firestore()
    await assertSucceeds(setDoc(doc(db, 'processes/own'), { lawFirmId: 'firm-a', title: 'Processo', responsibleLawyerId: 'azriel' }))
    await assertFails(setDoc(doc(db, 'processes/other'), { lawFirmId: 'firm-b', title: 'Processo' }))
    await assertFails(setDoc(doc(db, 'companies/company-a'), { lawFirmId: 'firm-b', name: 'Movida' }))
  })
  it('impede autoelevação de perfil e gravação direta de auditoria', async () => {
    const db = env.authenticatedContext('client').firestore()
    await assertFails(setDoc(doc(db, 'users/client'), { role: 'ADVOGADO', lawFirmId: 'firm-a', active: true }))
    await assertFails(setDoc(doc(db, 'auditLogs/forged'), { lawFirmId: 'firm-a', action: 'PROCESS_UPDATED' }))
  })
})

describe('portal do cliente', () => {
  it('mostra apenas a empresa vinculada e solicitações próprias', async () => {
    const db = env.authenticatedContext('client').firestore()
    await assertSucceeds(getDoc(doc(db, 'companies/company-a')))
    await assertFails(getDoc(doc(db, 'companies/company-b')))
    await assertSucceeds(setDoc(doc(db, 'requests/own'), { lawFirmId: 'firm-a', companyId: 'company-a', requestedBy: 'client', responsibleLawyerId: null, status: 'ABERTA', title: 'Ajuda' }))
    await assertFails(setDoc(doc(db, 'requests/fake'), { lawFirmId: 'firm-a', companyId: 'company-a', requestedBy: 'azriel', responsibleLawyerId: null, status: 'ABERTA', title: 'Falsa' }))
    await assertFails(setDoc(doc(db, 'requests/assigned'), { lawFirmId: 'firm-a', companyId: 'company-a', requestedBy: 'client', responsibleLawyerId: 'azriel', status: 'ABERTA', title: 'Atribuída' }))
    await assertFails(getDoc(doc(db, 'processes/private')))
  })
})
