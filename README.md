# Souza & Sá Advocacia

Aplicação web para um escritório com contas individuais e dados compartilhados por `lawFirmId`. A interface inclui painel individual e do escritório, empresas, clientes, processos, contratos, documentos, prazos, agenda, solicitações, auditoria e um portal simples para clientes.

## Requisitos

- Node.js 22 ou superior e npm
- Projeto Firebase com Authentication (e-mail e senha), Firestore, Storage e Functions habilitados
- Um administrador com Application Default Credentials para o provisionamento inicial

## Desenvolvimento

1. Copie `.env.example` para `.env.local` e preencha a configuração **pública** do aplicativo Firebase. Não armazene credenciais administrativas nesse arquivo.
2. Execute `npm ci` e `npm --prefix functions ci`.
3. Execute `npm run dev` para abrir a aplicação local. Para usar emuladores, inicie `XDG_CONFIG_HOME=/tmp/souza-sa-config FIREBASE_EMULATORS_PATH=/tmp/souza-sa-emulators npx firebase emulators:start --only auth,firestore,storage,functions` e defina `VITE_USE_EMULATORS=true` em `.env.local`.
4. Execute `npm run build` para validar TypeScript e gerar a aplicação, `npm test` para os filtros e `npm run test:rules` para as permissões do Firestore. O emulador baixa um artefato verificado de `storage.googleapis.com` na primeira execução.

O aplicativo mostra uma tela de configuração enquanto as variáveis `VITE_FIREBASE_*` não forem preenchidas. Nenhum dado real é criado nessa etapa.

## Publicação no GitHub Pages

O repositório inclui `.github/workflows/pages.yml`. Ele publica a interface estática ao receber alterações na branch `main`, depois de executar testes e validar a configuração pública do Firebase. Em **Settings → Pages**, selecione **GitHub Actions** como origem. Em **Settings → Secrets and variables → Actions → Variables**, cadastre `VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_AUTH_DOMAIN`, `VITE_FIREBASE_STORAGE_BUCKET` e `VITE_FIREBASE_APP_ID` da configuração do **aplicativo Web** no Firebase Console. O ID do projeto já é `souzaesa-e167b`. Essas variáveis são públicas no bundle do navegador; nunca use a chave privada de uma conta de serviço.

Em Firebase Authentication, habilite o provedor **E-mail/senha** e acrescente o domínio do GitHub Pages à lista de domínios autorizados. A publicação da interface não publica as regras do Firestore, regras do Storage, índices nem a Function de auditoria; faça essa publicação no projeto Firebase antes de usar dados reais. O workflow só publica o site quando a configuração estiver completa e os testes passarem.

## Contas iniciais

Com os e-mails de Azriel de Souza Soares e Francisco de Sá e credenciais administrativas disponíveis por Application Default Credentials, execute:

```sh
npm run bootstrap -- --project-id=SEU_PROJETO --azriel-email=AZRIEL@EXEMPLO.COM --francisco-email=FRANCISCO@EXEMPLO.COM
```

O script aproveita contas existentes ou cria duas contas separadas no Firebase Authentication sem senha inicial. Também cria `lawFirms/souza-sa` e associa ambos os perfis ao mesmo escritório. A execução repetida preserva os perfis já existentes. Cada sócio deve informar seu e-mail na tela de login e usar **Definir ou recuperar minha senha** para receber a mensagem de definição de senha do Firebase. Não inclua senhas, tokens ou arquivos de conta de serviço no repositório.

Para o portal de um cliente, crie sua conta em Authentication, um perfil `users/{uid}` com `role: "CLIENTE"`, `active: true`, `lawFirmId: "souza-sa"` e `clientCompanyId` igual ao ID de sua empresa. Defina `clientUserId` na empresa com esse UID. O cliente pode ver a empresa vinculada, os nomes da equipe jurídica e suas próprias solicitações. Crie perfis de usuários apenas por um processo administrativo confiável; as regras impedem que o navegador altere perfis e permissões.

## Segurança e auditoria

Publique `firestore.rules`, `storage.rules` e a Function `recordAudit` com Firebase CLI após configurar o projeto. As regras exigem `lawFirmId` igual ao do usuário para acesso de advogados; o papel `ADVOGADO` sozinho não concede acesso. Sócios podem visualizar todos os registros de seu escritório. Os campos de responsável e participantes identificam o trabalho individual, sem retirar o acesso do outro sócio.

A Function grava ações em `auditLogs` quando os documentos principais são criados, alterados ou excluídos. O registro usa o UID do contexto de autenticação quando disponível e `system` para gravações administrativas. Os clientes não podem escrever diretamente em `auditLogs`. A auditoria passa a funcionar após a publicação da Function e depende da entrega dos eventos do Firestore.

Os documentos são armazenados no Firebase Storage em `firmDocuments/{lawFirmId}/{uploaderId}/{fileId}`. As regras permitem leitura por advogados ativos do mesmo escritório e upload pelo próprio usuário até 20 MB. O Firestore guarda os metadados.

## Estrutura de dados

As coleções `companies`, `clients`, `processes`, `contracts`, `documents`, `deadlines`, `appointments`, `requests` e `auditLogs` possuem `lawFirmId`. Empresas, clientes, processos, contratos, prazos e solicitações possuem `responsibleLawyerId`; empresas têm `secondaryLawyerIds`, processos têm `collaboratorLawyerIds` e compromissos/solicitações têm `participants`. Solicitações do portal nascem sem responsável. O painel filtra por responsável e permite transferir a responsabilidade em cada registro.

O índice composto usado pelo portal (`requests` por `requestedBy` e `lawFirmId`) está declarado em `firestore.indexes.json` e deve ser publicado junto com as regras.
