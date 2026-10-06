export type Role = 'ADVOGADO' | 'CLIENTE'
export type Profile = {
  id: string
  name: string
  email: string
  role: Role
  lawFirmId: string
  partner: boolean
  active: boolean
  clientCompanyId?: string
}

export type RecordData = {
  id: string
  lawFirmId: string
  name?: string
  title?: string
  email?: string
  phone?: string
  companyId?: string
  clientUserId?: string
  responsibleLawyerId?: string | null
  secondaryLawyerIds?: string[]
  collaboratorLawyerIds?: string[]
  participants?: string[]
  requestedBy?: string
  status?: string
  number?: string
  startDate?: string
  endDate?: string
  dueDate?: string
  description?: string
  storagePath?: string
  fileName?: string
  createdAt?: unknown
}

export const collections = ['companies', 'clients', 'processes', 'contracts', 'documents', 'deadlines', 'appointments', 'requests'] as const
export type CollectionName = typeof collections[number]

export const labels: Record<CollectionName, string> = {
  companies: 'Empresas', clients: 'Clientes', processes: 'Processos', contracts: 'Contratos',
  documents: 'Documentos', deadlines: 'Prazos', appointments: 'Agenda', requests: 'Solicitações',
}
