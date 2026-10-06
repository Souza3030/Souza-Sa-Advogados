import { initializeApp } from 'firebase-admin/app'
import { getFirestore, FieldValue } from 'firebase-admin/firestore'
import { onDocumentWrittenWithAuthContext } from 'firebase-functions/v2/firestore'

initializeApp()

const audited = new Set(['companies', 'clients', 'processes', 'contracts', 'documents', 'deadlines', 'appointments', 'requests'])
const entityNames = {
  companies: 'COMPANY', clients: 'CLIENT', processes: 'PROCESS', contracts: 'CONTRACT',
  documents: 'DOCUMENT', deadlines: 'DEADLINE', appointments: 'APPOINTMENT', requests: 'REQUEST',
}

export const recordAudit = onDocumentWrittenWithAuthContext(
  { document: '{collectionId}/{entityId}', region: 'southamerica-east1', retry: true },
  async (event) => {
    const { collectionId, entityId } = event.params
    if (!audited.has(collectionId) || !event.data) return
    const before = event.data.before.data()
    const after = event.data.after.data()
    const value = after || before
    if (!value?.lawFirmId) return

    const verb = !before ? 'CREATED' : !after ? 'DELETED' : 'UPDATED'
    await getFirestore().collection('auditLogs').doc(event.id).set({
      userId: event.authId || 'system',
      lawFirmId: value.lawFirmId,
      action: `${entityNames[collectionId]}_${verb}`,
      entity: entityNames[collectionId],
      entityId,
      createdAt: FieldValue.serverTimestamp(),
    })
  },
)
