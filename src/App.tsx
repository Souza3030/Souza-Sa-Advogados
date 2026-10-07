import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { onAuthStateChanged, sendPasswordResetEmail, signInWithEmailAndPassword, signOut, type User } from 'firebase/auth'
import { addDoc, collection, doc, getDoc, onSnapshot, query, serverTimestamp, updateDoc, where } from 'firebase/firestore'
import { deleteObject, getDownloadURL, ref, uploadBytes } from 'firebase/storage'
import { ArrowRight, BriefcaseBusiness, CalendarDays, Check, ChevronDown, CircleHelp, Clock3, FileText, FolderOpen, LayoutDashboard, LogOut, Menu, Plus, Search, ShieldCheck, Users, X } from 'lucide-react'
import { auth, configured, db, storage } from './firebase'
import { appointmentLabel, dateLabel, displayName, thisWeek, visibleItems } from './helpers'
import { collections, labels, type CollectionName, type Profile, type RecordData } from './types'

type Page = 'dashboard' | CollectionName | 'audit'
type DataMap = Record<CollectionName, RecordData[]>
const emptyData: DataMap = { companies: [], clients: [], processes: [], contracts: [], documents: [], deadlines: [], appointments: [], requests: [] }

const menu: { page: Page; icon: typeof LayoutDashboard }[] = [
  { page: 'dashboard', icon: LayoutDashboard }, { page: 'companies', icon: BriefcaseBusiness },
  { page: 'clients', icon: Users }, { page: 'processes', icon: FolderOpen },
  { page: 'contracts', icon: FileText }, { page: 'documents', icon: FileText },
  { page: 'deadlines', icon: Clock3 }, { page: 'appointments', icon: CalendarDays },
  { page: 'requests', icon: CircleHelp }, { page: 'audit', icon: ShieldCheck },
]

const pageName = (page: Page) => page === 'dashboard' ? 'Visão geral' : page === 'audit' ? 'Auditoria' : labels[page]
const singular: Record<CollectionName, string> = {
  companies: 'empresa', clients: 'cliente', processes: 'processo', contracts: 'contrato',
  documents: 'documento', deadlines: 'prazo', appointments: 'compromisso', requests: 'solicitação',
}
const activeStatus = (item: RecordData) => !['CONCLUÍDO', 'ENCERRADO', 'CANCELADO'].includes(item.status || '')

function App() {
  const [user, setUser] = useState<User | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [authReady, setAuthReady] = useState(false)
  const [firmName, setFirmName] = useState('Souza & Sá Advocacia')
  const [lawyers, setLawyers] = useState<Profile[]>([])
  const [data, setData] = useState<DataMap>(emptyData)
  const [audits, setAudits] = useState<Record<string, unknown>[]>([])
  const [page, setPage] = useState<Page>('dashboard')
  const [filter, setFilter] = useState('all')
  const [search, setSearch] = useState('')
  const [editing, setEditing] = useState<RecordData | null | 'new'>(null)
  const [error, setError] = useState('')
  const [mobileMenu, setMobileMenu] = useState(false)

  useEffect(() => onAuthStateChanged(auth, async next => {
    setUser(next)
    setProfile(null)
    setAuthReady(true)
    if (!next) return
    try {
      const snap = await getDoc(doc(db, 'users', next.uid))
      if (!snap.exists()) { setError('Esta conta ainda não foi vinculada ao escritório. Solicite ao administrador o cadastro do perfil.'); return }
      const value = { id: snap.id, ...snap.data() } as Profile
      if (!value.active) { setError('Esta conta está inativa.'); return }
      setProfile(value)
      setError('')
    } catch { setError('Não foi possível carregar seu perfil. Verifique a conexão e as permissões.')}
  }), [])

  useEffect(() => {
    if (!profile) return
    let live = true
    getDoc(doc(db, 'lawFirms', profile.lawFirmId)).then(snap => {
      if (live && snap.exists()) setFirmName(String(snap.data().name || 'Escritório'))
    }).catch(() => {})
    if (profile.role !== 'ADVOGADO') return () => { live = false }

    const unsubUsers = onSnapshot(query(collection(db, 'users'), where('lawFirmId', '==', profile.lawFirmId)), snap => {
      setLawyers(snap.docs.map(s => ({ id: s.id, ...s.data() } as Profile)).filter(p => p.role === 'ADVOGADO' && p.active))
    }, () => setError('Não foi possível carregar a equipe.'))
    const unsubs = collections.map(name => onSnapshot(
      query(collection(db, name), where('lawFirmId', '==', profile.lawFirmId)),
      snap => setData(previous => ({ ...previous, [name]: snap.docs.map(s => ({ id: s.id, ...s.data() } as RecordData)) })),
      () => setError(`Não foi possível carregar ${labels[name].toLowerCase()}.`),
    ))
    const unsubAudit = onSnapshot(query(collection(db, 'auditLogs'), where('lawFirmId', '==', profile.lawFirmId)), snap => {
      setAudits(snap.docs.map(s => ({ id: s.id, ...s.data() })))
    }, () => {})
    return () => { live = false; unsubUsers(); unsubs.forEach(fn => fn()); unsubAudit() }
  }, [profile])

  const lawyerName = (id?: string | null) => lawyers.find(p => p.id === id)?.name || (id ? 'Advogado' : 'Não atribuído')
  const companyName = (id?: string) => data.companies.find(item => item.id === id)?.name || 'Sem empresa'
  const own = (items: RecordData[]) => items.filter(item => item.responsibleLawyerId === profile?.id)
  const counts = useMemo(() => ({
    mine: {
      clients: own(data.clients).length,
      processes: own(data.processes).filter(activeStatus).length,
      deadlines: own(data.deadlines).filter(item => thisWeek(item.dueDate)).length,
      appointments: data.appointments.filter(item => (item.responsibleLawyerId === profile?.id || item.participants?.includes(profile?.id || '')) && thisWeek(item.startDate)).length,
      requests: own(data.requests).filter(activeStatus).length,
    },
    firm: {
      clients: data.clients.length,
      processes: data.processes.filter(activeStatus).length,
      deadlines: data.deadlines.filter(item => thisWeek(item.dueDate)).length,
      contracts: data.contracts.filter(activeStatus).length,
      requests: data.requests.filter(activeStatus).length,
    },
  }), [data, profile])

  if (!configured) return <div className="setup"><div className="brand-mark">S<span>&</span>S</div><h1>Configuração necessária</h1><p>Preencha as variáveis VITE_FIREBASE_* em <code>.env.local</code> conforme <code>.env.example</code> para conectar o aplicativo ao Firebase.</p></div>
  if (!authReady) return <div className="setup"><p>Carregando…</p></div>
  if (!user) return <Login />
  if (!profile) return <div className="setup"><div className="brand-mark">S<span>&</span>S</div><h1>Acesso pendente</h1><p>{error || 'Carregando seu perfil…'}</p><button className="button secondary" onClick={() => signOut(auth)}>Sair</button></div>
  if (profile.role === 'CLIENTE') return <ClientPortal profile={profile} onSignOut={() => signOut(auth)} />

  const items = page !== 'dashboard' && page !== 'audit' ? visibleItems(data[page], filter, profile.id, page === 'appointments').filter(item =>
    `${displayName(item, page)} ${item.description || ''} ${item.number || ''}`.toLocaleLowerCase('pt-BR').includes(search.toLocaleLowerCase('pt-BR')),
  ) : []
  const filterOptions = [{ value: 'all', label: page === 'appointments' ? 'Agenda do escritório' : 'Todos' }, { value: 'mine', label: page === 'appointments' ? 'Minha agenda' : `Meus ${page === 'processes' ? 'processos' : page === 'deadlines' ? 'prazos' : 'itens'}` }, ...lawyers.map(lawyer => ({ value: `lawyer:${lawyer.id}`, label: page === 'appointments' ? `Agenda de ${lawyer.name.split(' ')[0]}` : `${page === 'clients' ? 'Clientes' : page === 'processes' ? 'Processos' : 'Itens'} de ${lawyer.name.split(' ')[0]}` }))]

  return <div className="shell">
    <aside className={`sidebar ${mobileMenu ? 'open' : ''}`}>
      <div className="sidebar-top"><div className="brand-mark small">S<span>&</span>S</div><div><strong>Souza & Sá</strong><small>GESTÃO JURÍDICA</small></div><button className="icon-button mobile-close" onClick={() => setMobileMenu(false)} aria-label="Fechar menu"><X size={20}/></button></div>
      <div className="sidebar-caption">ESCRITÓRIO</div>
      <nav aria-label="Menu principal">{menu.map(({ page: item, icon: Icon }) => <button key={item} className={`nav-item ${page === item ? 'active' : ''}`} onClick={() => { setPage(item); setFilter('all'); setSearch(''); setMobileMenu(false) }}><Icon size={18}/><span>{pageName(item)}</span>{page === item && <span className="active-dot"/>}</button>)}</nav>
      <div className="sidebar-bottom"><div className="firm-mini"><div className="firm-icon"><BriefcaseBusiness size={18}/></div><div><small>ESCRITÓRIO</small><strong>{firmName}</strong></div></div><button className="user-row" onClick={() => signOut(auth)} title="Sair da conta"><span className="avatar">{profile.name.split(' ').map(s => s[0]).slice(0, 2).join('')}</span><span><strong>{profile.name}</strong><small>Advogado sócio</small></span><LogOut size={17}/></button></div>
    </aside>
    <main className="main"><header className="topbar"><button className="icon-button mobile-open" onClick={() => setMobileMenu(true)} aria-label="Abrir menu"><Menu size={22}/></button><div className="breadcrumb">Escritório <span>/</span> <strong>{pageName(page)}</strong></div><div className="topbar-right"><span className="status-dot"/> <span>Sistema ativo</span><span className="top-avatar">{profile.name[0]}</span></div></header>
      <div className="content">{error && <div className="alert" role="alert">{error}<button onClick={() => setError('')} aria-label="Fechar"><X size={16}/></button></div>}
        {page === 'dashboard' ? <>
          <div className="page-heading"><div><div className="eyebrow">PAINEL DO ESCRITÓRIO</div><h1>Olá, {profile.name.split(' ')[0]} <span className="wave">✦</span></h1><p>Acompanhe suas responsabilidades e o trabalho de toda a equipe.</p></div><button className="button primary" onClick={() => { setPage('appointments'); setEditing('new') }}><Plus size={17}/> Novo compromisso</button></div>
          <div className="section-head"><div><div className="section-icon"><LayoutDashboard size={19}/></div><h2>Meu painel</h2></div><span>Suas atividades</span></div>
          <div className="stats-grid">{([
            ['Meus clientes', counts.mine.clients, 'clients', Users], ['Processos ativos', counts.mine.processes, 'processes', FolderOpen],
            ['Prazos esta semana', counts.mine.deadlines, 'deadlines', Clock3], ['Audiências esta semana', counts.mine.appointments, 'appointments', CalendarDays],
            ['Solicitações abertas', counts.mine.requests, 'requests', CircleHelp],
          ] as const).map(([title, count, target, Icon]) => <button className="stat-card" key={title} onClick={() => { setPage(target); setFilter('mine') }}><span className="stat-icon"><Icon size={20}/></span><strong>{count}</strong><span>{title}</span><ArrowRight className="stat-arrow" size={17}/></button>)}</div>
          <div className="section-head office-section"><div><div className="section-icon amber"><BriefcaseBusiness size={19}/></div><h2>Escritório</h2></div><span>Visão compartilhada</span></div>
          <div className="stats-grid office-grid">{[
            ['Clientes', counts.firm.clients, 'clients'], ['Processos ativos', counts.firm.processes, 'processes'],
            ['Prazos esta semana', counts.firm.deadlines, 'deadlines'], ['Contratos ativos', counts.firm.contracts, 'contracts'],
            ['Solicitações abertas', counts.firm.requests, 'requests'],
          ].map(([title, count, target]) => <button className="office-card" key={String(title)} onClick={() => { setPage(target as Page); setFilter('all') }}><span>{title}</span><strong>{count}</strong><ArrowRight size={16}/></button>)}</div>
          <div className="two-col"><div className="panel"><div className="panel-heading"><h3>Próximos prazos</h3><button onClick={() => setPage('deadlines')}>Ver todos <ArrowRight size={15}/></button></div>{data.deadlines.filter(item => item.dueDate && new Date(item.dueDate) >= new Date(new Date().toISOString().slice(0, 10))).sort((a, b) => (a.dueDate || '').localeCompare(b.dueDate || '')).slice(0, 4).map(item => <div className="mini-row" key={item.id}><span className="date-badge">{dateLabel(item.dueDate)}</span><span><strong>{displayName(item, 'deadlines')}</strong><small>{companyName(item.companyId)} · {lawyerName(item.responsibleLawyerId)}</small></span></div>)}{!data.deadlines.length && <Empty small text="Nenhum prazo cadastrado"/>}</div><div className="panel"><div className="panel-heading"><h3>Solicitações recentes</h3><button onClick={() => setPage('requests')}>Ver todas <ArrowRight size={15}/></button></div>{data.requests.slice(0, 4).map(item => <div className="mini-row" key={item.id}><span className="mini-icon"><CircleHelp size={18}/></span><span><strong>{displayName(item, 'requests')}</strong><small>{companyName(item.companyId)} · {lawyerName(item.responsibleLawyerId)}</small></span><span className="pill">{item.status || 'ABERTA'}</span></div>)}{!data.requests.length && <Empty small text="Nenhuma solicitação recebida"/>}</div></div>
        </> : page === 'audit' ? <><div className="page-heading"><div><div className="eyebrow">RASTREABILIDADE</div><h1>Auditoria</h1><p>Histórico de ações realizadas pelos usuários do escritório.</p></div></div><div className="panel audit-panel">{[...audits].sort((a, b) => Number((b.createdAt as { seconds?: number })?.seconds || 0) - Number((a.createdAt as { seconds?: number })?.seconds || 0)).map(audit => <div className="mini-row" key={String(audit.id)}><span className="mini-icon"><ShieldCheck size={18}/></span><span><strong>{lawyerName(String(audit.userId))} · {String(audit.action || '')}</strong><small>{String(audit.entity || '')} · {String(audit.entityId || '')}</small></span></div>)}{!audits.length && <Empty text="Ainda não há ações registradas"/>}</div></> : <>
          <div className="page-heading"><div><div className="eyebrow">GESTÃO DO ESCRITÓRIO</div><h1>{pageName(page)}</h1><p>Informações compartilhadas entre os advogados do escritório.</p></div><button className="button primary" onClick={() => setEditing('new')}><Plus size={17}/> Novo {singular[page]}</button></div>
          <div className="list-panel"><div className="list-toolbar"><div className="search-box"><Search size={18}/><input aria-label={`Buscar ${pageName(page)}`} placeholder={`Buscar em ${pageName(page).toLowerCase()}...`} value={search} onChange={e => setSearch(e.target.value)}/></div><div className="select-wrap"><select aria-label="Filtrar responsável" value={filter} onChange={e => setFilter(e.target.value)}>{filterOptions.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</select><ChevronDown size={16}/></div></div><div className="list-count">{items.length} {items.length === 1 ? 'registro' : 'registros'}</div>{items.length ? <div className="table-wrap"><table><thead><tr><th>{page === 'processes' ? 'PROCESSO' : page === 'documents' ? 'DOCUMENTO' : 'NOME / TÍTULO'}</th><th>EMPRESA</th><th>RESPONSÁVEL</th><th>{page === 'appointments' ? 'DATA' : page === 'deadlines' ? 'VENCIMENTO' : 'STATUS'}</th><th/></tr></thead><tbody>{items.map(item => <tr key={item.id}><td><strong>{displayName(item, page)}</strong>{item.description && <small>{item.description}</small>}</td><td>{page === 'companies' ? '—' : companyName(item.companyId)}</td><td><span className="person-cell"><span className="person-dot">{lawyerName(item.responsibleLawyerId)[0]}</span>{lawyerName(item.responsibleLawyerId)}</span></td><td>{page === 'appointments' ? appointmentLabel(item.startDate) : page === 'deadlines' ? dateLabel(item.dueDate) : <span className="pill">{item.status || 'ATIVO'}</span>}</td><td><button className="row-action" onClick={() => setEditing(item)}>Abrir <ArrowRight size={15}/></button></td></tr>)}</tbody></table></div> : <Empty text={search || filter !== 'all' ? 'Nenhum resultado para este filtro' : `Nenhum ${singular[page]} cadastrado`} action={() => setEditing('new')}/>}</div>
        </>}
      </div>
    </main>
    {editing && page !== 'dashboard' && page !== 'audit' && <Editor collectionName={page} item={editing === 'new' ? null : editing} profile={profile} lawyers={lawyers} companies={data.companies} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); setError('') }} onError={setError}/>}
  </div>
}

function Empty({ text, action, small = false }: { text: string; action?: () => void; small?: boolean }) {
  return <div className={`empty ${small ? 'small' : ''}`}><span className="empty-icon"><FolderOpen size={small ? 20 : 28}/></span><strong>{text}</strong>{action && <button onClick={action}>Adicionar primeiro registro <ArrowRight size={15}/></button>}</div>
}

function authFailureMessage(cause: unknown) {
  const code = (cause as { code?: string })?.code
  if (code === 'auth/configuration-not-found' || code === 'auth/operation-not-allowed') return 'O Firebase Authentication ainda não está configurado para login por e-mail e senha neste projeto.'
  if (code === 'auth/invalid-api-key') return 'A configuração pública do Firebase está incorreta. Solicite a verificação do aplicativo Web.'
  if (code === 'auth/network-request-failed') return 'Não foi possível conectar ao Firebase. Verifique a internet e tente novamente.'
  return 'E-mail ou senha inválidos. Verifique seus dados e tente novamente.'
}

function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)
  async function submit(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError('')
    try { await signInWithEmailAndPassword(auth, email, password) }
    catch (cause) { setError(authFailureMessage(cause)) }
    finally { setBusy(false) }
  }
  async function resetPassword() {
    if (!email) { setError('Informe seu e-mail para recuperar o acesso.'); return }
    setError(''); setNotice('')
    try {
      await sendPasswordResetEmail(auth, email)
      setNotice('Se o e-mail estiver cadastrado, você receberá instruções para definir a senha.')
    } catch (cause) { setError(authFailureMessage(cause)) }
  }
  return <div className="login-page"><div className="login-visual"><div className="login-brand"><div className="brand-mark">S<span>&</span>S</div><span>Souza & Sá<small>ADVOCACIA</small></span></div><div className="login-quote"><span>“</span><h1>Excelência jurídica,<br/><em>trabalho em conjunto.</em></h1><p>Um espaço para organizar o que importa e acompanhar cada responsabilidade.</p></div><div className="login-footer">© {new Date().getFullYear()} Souza & Sá Advocacia</div></div><div className="login-form-side"><div className="login-card"><div className="eyebrow">ÁREA RESTRITA</div><h2>Bem-vindo de volta</h2><p>Acesse sua conta para entrar no escritório.</p><form onSubmit={submit}><label>E-mail<input type="email" autoComplete="username" required value={email} onChange={e => setEmail(e.target.value)} placeholder="seu@email.com"/></label><label>Senha<input type="password" autoComplete="current-password" required value={password} onChange={e => setPassword(e.target.value)} placeholder="••••••••"/></label>{error && <div className="form-error" role="alert">{error}</div>}{notice && <div className="form-notice" role="status">{notice}</div>}<button className="button primary login-submit" disabled={busy}>{busy ? 'Entrando…' : 'Entrar no escritório'} <ArrowRight size={18}/></button><button type="button" className="reset-link" onClick={resetPassword}>Definir ou recuperar minha senha</button></form><div className="login-help"><ShieldCheck size={17}/> Acesso protegido e individual</div></div></div></div>
}

function Editor({ collectionName, item, profile, lawyers, companies, onClose, onSaved, onError }: { collectionName: CollectionName; item: RecordData | null; profile: Profile; lawyers: Profile[]; companies: RecordData[]; onClose: () => void; onSaved: () => void; onError: (value: string) => void }) {
  const [name, setName] = useState(item?.name || item?.title || '')
  const [number, setNumber] = useState(item?.number || '')
  const [description, setDescription] = useState(item?.description || '')
  const [companyId, setCompanyId] = useState(item?.companyId || '')
  const [responsible, setResponsible] = useState(item?.responsibleLawyerId || (collectionName === 'requests' ? '' : profile.id))
  const [others, setOthers] = useState<string[]>(item?.participants || item?.collaboratorLawyerIds || item?.secondaryLawyerIds || [])
  const [status, setStatus] = useState(item?.status || (collectionName === 'requests' ? 'ABERTA' : 'ATIVO'))
  const [date, setDate] = useState(item?.dueDate || item?.startDate?.slice(0, collectionName === 'appointments' ? 16 : 10) || '')
  const [endDate, setEndDate] = useState(item?.endDate?.slice(0, 16) || '')
  const [email, setEmail] = useState(item?.email || '')
  const [phone, setPhone] = useState(item?.phone || '')
  const [clientUserId, setClientUserId] = useState(item?.clientUserId || '')
  const [file, setFile] = useState<File | null>(null)
  const [busy, setBusy] = useState(false)
  const hasCompany = !['companies'].includes(collectionName)
  const hasDate = ['deadlines', 'appointments'].includes(collectionName)
  const hasParticipants = ['companies', 'processes', 'appointments', 'requests'].includes(collectionName)
  async function submit(event: FormEvent) {
    event.preventDefault(); setBusy(true)
    let uploadedPath: string | null = null
    try {
      const base: Record<string, unknown> = {
        lawFirmId: profile.lawFirmId,
        responsibleLawyerId: responsible || null,
        status,
        description: description.trim(),
      }
      if (collectionName === 'processes') { base.number = number.trim(); base.title = name.trim() }
      else base[collectionName === 'companies' || collectionName === 'clients' ? 'name' : 'title'] = name.trim()
      if (hasCompany) base.companyId = companyId
      if (hasDate) base[collectionName === 'deadlines' ? 'dueDate' : 'startDate'] = date
      if (collectionName === 'appointments') base.endDate = endDate || date
      if (collectionName === 'companies' || collectionName === 'clients') { base.email = email.trim(); base.phone = phone.trim() }
      if (collectionName === 'companies') base.clientUserId = clientUserId.trim()
      if (hasParticipants) base[collectionName === 'companies' ? 'secondaryLawyerIds' : collectionName === 'processes' ? 'collaboratorLawyerIds' : 'participants'] = others.filter(id => id !== responsible)
      if (collectionName === 'documents' && file && !item) {
        if (file.size >= 20 * 1024 * 1024) throw new Error('O arquivo deve ter menos de 20 MB.')
        const path = `firmDocuments/${profile.lawFirmId}/${profile.id}/${crypto.randomUUID()}`
        await uploadBytes(ref(storage, path), file)
        uploadedPath = path
        base.storagePath = path; base.fileName = file.name
      }
      if (!item) await addDoc(collection(db, collectionName), { ...base, createdAt: serverTimestamp() })
      else await updateDoc(doc(db, collectionName, item.id), { ...base, updatedAt: serverTimestamp() })
      onSaved()
    } catch (cause) {
      if (uploadedPath) await deleteObject(ref(storage, uploadedPath)).catch(() => {})
      onError(cause instanceof Error ? cause.message : 'Não foi possível salvar o registro.')
    }
    finally { setBusy(false) }
  }
  async function openFile() {
    if (!item?.storagePath) return
    try { window.open(await getDownloadURL(ref(storage, item.storagePath)), '_blank', 'noopener,noreferrer') }
    catch { onError('Não foi possível abrir o documento.') }
  }
  return <div className="modal-backdrop" onMouseDown={onClose}><div className="modal" role="dialog" aria-modal="true" aria-label={`${item ? 'Editar' : 'Novo'} ${singular[collectionName]}`} onMouseDown={e => e.stopPropagation()}><div className="modal-header"><div><div className="eyebrow">{item ? 'EDITAR REGISTRO' : 'NOVO REGISTRO'}</div><h2>{item ? 'Editar' : 'Novo'} {singular[collectionName]}</h2></div><button className="icon-button" onClick={onClose} aria-label="Fechar"><X size={20}/></button></div><form onSubmit={submit} className="modal-form"><div className="form-grid"><label className="full">{collectionName === 'processes' ? 'Título do processo' : collectionName === 'documents' ? 'Título do documento' : 'Nome / título'}<input required value={name} onChange={e => setName(e.target.value)} placeholder="Digite um título"/></label>{collectionName === 'processes' && <label className="full">Número do processo<input value={number} onChange={e => setNumber(e.target.value)} placeholder="0000000-00.0000.0.00.0000"/></label>}{hasCompany && <label className="full">Empresa vinculada<select value={companyId} onChange={e => setCompanyId(e.target.value)}><option value="">Nenhuma empresa</option>{companies.map(company => <option key={company.id} value={company.id}>{company.name}</option>)}</select></label>}<label>Advogado responsável<select value={responsible} onChange={e => setResponsible(e.target.value)}><option value="">Sem responsável</option>{lawyers.map(lawyer => <option key={lawyer.id} value={lawyer.id}>{lawyer.name}</option>)}</select></label><label>Status<select value={status} onChange={e => setStatus(e.target.value)}>{['ATIVO', 'ABERTA', 'EM ANDAMENTO', 'CONCLUÍDO', 'ENCERRADO', 'CANCELADO'].map(value => <option key={value}>{value}</option>)}</select></label>{hasParticipants && <fieldset className="full"><legend>{collectionName === 'companies' ? 'Sócios com acesso' : 'Participantes'}</legend><div className="checkbox-row">{lawyers.filter(l => l.id !== responsible).map(lawyer => <label key={lawyer.id}><input type="checkbox" checked={others.includes(lawyer.id)} onChange={e => setOthers(previous => e.target.checked ? [...previous, lawyer.id] : previous.filter(id => id !== lawyer.id))}/>{lawyer.name}</label>)}</div><small>Todos os advogados do escritório têm acesso; este campo registra a participação.</small></fieldset>}{hasDate && <label>{collectionName === 'deadlines' ? 'Data do prazo' : 'Data de início'}<input type={collectionName === 'appointments' ? 'datetime-local' : 'date'} required value={date} onChange={e => setDate(e.target.value)}/></label>}{collectionName === 'appointments' && <label>Data de término<input type="datetime-local" value={endDate} onChange={e => setEndDate(e.target.value)}/></label>}{['companies', 'clients'].includes(collectionName) && <><label>E-mail<input type="email" value={email} onChange={e => setEmail(e.target.value)}/></label><label>Telefone<input value={phone} onChange={e => setPhone(e.target.value)}/></label></>}{collectionName === 'companies' && <label className="full">UID da conta do cliente (opcional)<input value={clientUserId} onChange={e => setClientUserId(e.target.value)} placeholder="UID no Firebase Authentication"/></label>}{collectionName === 'documents' && !item && <label className="full">Arquivo<input type="file" required={!item} onChange={e => setFile(e.target.files?.[0] || null)}/></label>}<label className="full">Descrição<textarea rows={3} value={description} onChange={e => setDescription(e.target.value)} placeholder="Observações adicionais"/></label></div>{item?.storagePath && <button type="button" className="text-link" onClick={openFile}>Abrir arquivo atual <ArrowRight size={15}/></button>}<div className="modal-footer"><button type="button" className="button secondary" onClick={onClose}>Cancelar</button><button className="button primary" disabled={busy}><Check size={17}/>{busy ? 'Salvando…' : 'Salvar registro'}</button></div></form></div></div>
}

function ClientPortal({ profile, onSignOut }: { profile: Profile; onSignOut: () => void }) {
  const [company, setCompany] = useState<RecordData | null>(null)
  const [lawyers, setLawyers] = useState<Profile[]>([])
  const [requests, setRequests] = useState<RecordData[]>([])
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    if (!profile.clientCompanyId) return
    getDoc(doc(db, 'companies', profile.clientCompanyId)).then(s => {
      if (s.exists()) setCompany({ id: s.id, ...s.data() } as RecordData)
    }).catch(() => setError('Não foi possível carregar sua empresa.'))
    const unsub = onSnapshot(query(collection(db, 'requests'), where('requestedBy', '==', profile.id), where('lawFirmId', '==', profile.lawFirmId)), snap => setRequests(snap.docs.map(s => ({ id: s.id, ...s.data() } as RecordData))), () => setError('Não foi possível carregar suas solicitações.'))
    return unsub
  }, [profile])
  useEffect(() => {
    if (!company) return
    const ids = [company.responsibleLawyerId, ...(company.secondaryLawyerIds || [])].filter(Boolean) as string[]
    Promise.all(ids.map(id => getDoc(doc(db, 'lawyerDirectory', id)))).then(snaps => setLawyers(snaps.filter(s => s.exists()).map(s => ({ id: s.id, ...s.data() } as Profile)))).catch(() => {})
  }, [company])
  async function submit(event: FormEvent) {
    event.preventDefault(); if (!profile.clientCompanyId) return
    setBusy(true); setError('')
    try {
      await addDoc(collection(db, 'requests'), { lawFirmId: profile.lawFirmId, companyId: profile.clientCompanyId, requestedBy: profile.id, responsibleLawyerId: null, title: title.trim(), description: description.trim(), status: 'ABERTA', createdAt: serverTimestamp() })
      setTitle(''); setDescription('')
    } catch { setError('Não foi possível enviar a solicitação.') }
    finally { setBusy(false) }
  }
  const responsible = lawyers.find(l => l.id === company?.responsibleLawyerId)
  return <div className="client-page"><header><div className="login-brand"><div className="brand-mark small">S<span>&</span>S</div><span>Souza & Sá<small>PORTAL DO CLIENTE</small></span></div><button className="button secondary" onClick={onSignOut}><LogOut size={16}/> Sair</button></header><main><div className="eyebrow">PORTAL DO CLIENTE</div><h1>Olá, {profile.name.split(' ')[0]}</h1><p>Acompanhe sua equipe jurídica e envie solicitações ao escritório.</p>{error && <div className="alert">{error}</div>}<div className="client-grid"><section className="panel"><h2>Sua equipe jurídica</h2><p>Empresa: <strong>{company?.name || 'Não vinculada'}</strong></p><div className="lawyer-card"><span className="avatar">{responsible?.name?.[0] || '?'}</span><div><small>ADVOGADO RESPONSÁVEL</small><strong>{responsible?.name || 'A definir'}</strong></div></div><p>Equipe jurídica: {lawyers.length ? lawyers.map(l => l.name).join(' e ') : 'A definir'}</p></section><section className="panel"><h2>Nova solicitação</h2><form onSubmit={submit}><label>Assunto<input required value={title} onChange={e => setTitle(e.target.value)} placeholder="Como podemos ajudar?"/></label><label>Detalhes<textarea rows={4} value={description} onChange={e => setDescription(e.target.value)}/></label><button className="button primary" disabled={busy || !company}>{busy ? 'Enviando…' : 'Enviar solicitação'} <ArrowRight size={17}/></button></form></section></div><section className="panel"><h2>Minhas solicitações</h2>{requests.length ? requests.map(item => <div className="mini-row" key={item.id}><span className="mini-icon"><CircleHelp size={18}/></span><span><strong>{item.title}</strong><small>{item.description}</small></span><span className="pill">{item.status}</span></div>) : <Empty small text="Nenhuma solicitação enviada"/>}</section></main></div>
}

export default App
