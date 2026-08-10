// ============================================================
// i18n.js — Sistema de idiomas GovTech Platform
// Idiomas: es (Español), en (English), pt (Português Brasil)
// Uso: i18n.t('key') → texto en idioma actual
//      i18n.setLang('en') → cambiar idioma
// ============================================================

const TRANSLATIONS = {

  // ── ESPAÑOL ─────────────────────────────────────────────────
  es: {
    // General
    lang_name: 'Español',
    lang_flag: '🇦🇷',
    loading: 'Cargando...',
    save: 'Guardar',
    cancel: 'Cancelar',
    delete: 'Eliminar',
    edit: 'Editar',
    add: 'Agregar',
    search: 'Buscar',
    filter: 'Filtrar',
    export: 'Exportar',
    print: 'Imprimir',
    back: 'Volver',
    close: 'Cerrar',
    confirm: 'Confirmar',
    yes: 'Sí',
    no: 'No',
    of: 'de',
    total: 'Total',
    status: 'Estado',
    date: 'Fecha',
    name: 'Nombre',
    email: 'Correo',
    phone: 'Teléfono',
    actions: 'Acciones',
    details: 'Ver detalle',
    required: 'Campo requerido',
    optional: 'Opcional',
    welcome: 'Bienvenido',
    logout: 'Cerrar Sesión',
    settings: 'Configuración',
    help: 'Ayuda',
    version: 'Versión',

    // Login
    login_title: 'Bienvenido al Sistema Municipal',
    login_subtitle: 'Ingresá con tu correo y contraseña institucional',
    login_email: 'Correo electrónico',
    login_password: 'Contraseña',
    login_btn: 'Ingresar al sistema',
    login_show_pass: 'Mostrar contraseña',
    login_demo_title: 'Usuarios de prueba — clic para ingresar',
    login_forgot: '¿Olvidaste tu contraseña?',
    login_error: 'Correo o contraseña incorrectos. Verificá tus datos.',
    login_loading: 'Ingresando...',
    login_hero_tagline: 'Sistema de Gestión Municipal de Clase Mundial',
    login_hero_sub: 'Control total de gastos, personal y servicios al vecino — desde cualquier dispositivo.',
    login_feature_1: 'Con Inteligencia Artificial',
    login_feature_2: 'Alertas por WhatsApp',
    login_feature_3: 'Para varios municipios',
    login_security: 'Acceso seguro · Todos los ingresos quedan registrados',

    // Roles
    role_super_admin: 'Administrador General',
    role_tenant_admin: 'Intendente / Director',
    role_tenant_user: 'Funcionario Municipal',
    role_demo: 'Acceso de Demostración',
    role_super_admin_desc: 'Acceso completo a todos los municipios del sistema',
    role_tenant_admin_desc: 'Panel ejecutivo completo de tu municipio',
    role_hacienda_desc: 'Solo finanzas, presupuesto y compras',
    role_it_desc: 'Administración técnica y contratos',
    role_demo_desc: 'Vista de demostración sin datos reales',
    role_badge_super: '⚡ ADMIN GENERAL',
    role_badge_admin: '🏛️ INTENDENTE',
    role_badge_user: '👤 FUNCIONARIO',
    role_badge_demo: '🌐 DEMO',
    click_to_login: 'Clic para ingresar →',

    // Dashboard
    dashboard_title: 'Panel Principal',
    dashboard_welcome_morning: 'Buenos días',
    dashboard_welcome_afternoon: 'Buenas tardes',
    dashboard_welcome_evening: 'Buenas noches',
    dashboard_last_login: 'Último ingreso',
    dashboard_quick_actions: 'Accesos rápidos',
    dashboard_alerts_title: 'Situaciones que requieren atención',
    dashboard_alerts_critical: 'Urgente',
    dashboard_alerts_warning: 'Atención',
    dashboard_alerts_info: 'Información',
    dashboard_kpi_budget: 'Presupuesto Total del Año',
    dashboard_kpi_spent: 'Gasto del Mes',
    dashboard_kpi_employees: 'Empleados Municipales',
    dashboard_kpi_complaints: 'Reclamos de Vecinos',
    dashboard_kpi_savings: 'Ahorro Detectado',
    dashboard_status_online: 'Sistema funcionando',
    dashboard_status_db: 'Base de datos conectada',
    dashboard_status_updated: 'Actualizado hace',
    dashboard_status_minutes: 'minutos',

    // Navigation sections
    nav_section_main: 'PRINCIPAL',
    nav_section_control: 'CONTROL FINANCIERO',
    nav_section_management: 'GESTIÓN',
    nav_section_operations: 'OPERACIONES',
    nav_section_comms: 'COMUNICACIONES',
    nav_section_system: 'SISTEMA',
    nav_dashboard: 'Panel Principal',
    nav_control: 'Control de Gastos',
    nav_ia: 'Asistente Inteligente',
    nav_analytics: 'Reportes y Gráficos',
    nav_budget: 'Presupuesto',
    nav_map: 'Mapa Financiero',
    nav_rrhh: 'Personal Municipal',
    nav_bids: 'Licitaciones y Compras',
    nav_suppliers: 'Proveedores',
    nav_citizens: 'Reclamos Vecinales',
    nav_workshops: 'Talleres Municipales',
    nav_services: 'Servicios Municipales',
    nav_whatsapp: 'Alertas por WhatsApp',
    nav_landing: 'Página de Presentación',
    nav_import: 'Importar Información',
    nav_upload: 'Cargar Archivos',
    nav_export: 'Generar Informes',
    nav_presentation: 'Presentación Ejecutiva',
    nav_manual: 'Manual de Uso',

    // Admin panel (sin jerga técnica)
    admin_title: 'Panel de Control General',
    admin_overview: 'Resumen General',
    admin_municipalities: 'Municipios en el sistema',
    admin_users: 'Usuarios registrados',
    admin_income: 'Ingresos del sistema',
    admin_new_municipality: '+ Agregar Municipio',
    admin_kpi_active: 'Municipios Activos',
    admin_kpi_trial: 'Municipios en Prueba',
    admin_kpi_monthly_income: 'Ingreso Mensual',
    admin_kpi_annual_projection: 'Proyección Anual',
    admin_kpi_total_users: 'Usuarios Totales',
    admin_status_active: 'Activo',
    admin_status_trial: 'En prueba',
    admin_status_suspended: 'Suspendido',
    admin_status_cancelled: 'Cancelado',
    admin_plan_starter: 'Plan Básico',
    admin_plan_professional: 'Plan Profesional',
    admin_plan_enterprise: 'Plan Institucional',
    admin_plan_demo: 'Plan Demo',
    admin_new_muni_title: 'Agregar nuevo municipio',
    admin_muni_name: 'Nombre del municipio',
    admin_muni_slug: 'Identificador único (sin espacios)',
    admin_muni_province: 'Provincia / Estado',
    admin_admin_email: 'Correo del administrador',
    admin_admin_name: 'Nombre del administrador',
    admin_admin_password: 'Contraseña inicial',

    // IA
    ia_title: 'Asistente Inteligente Municipal',
    ia_placeholder: 'Hacé tu pregunta en español...',
    ia_send: 'Enviar',
    ia_voice: 'Hablar',
    ia_upload: 'Subir archivo',
    ia_clear: 'Limpiar conversación',
    ia_export: 'Guardar conversación',
    ia_greeting: '¡Hola! Soy el Asistente Municipal. Podés preguntarme sobre gastos, empleados, reclamos o cualquier dato del municipio.',
    ia_examples: '¿Cuánto gastamos este mes? · ¿Cuántos empleados hay? · ¿Qué contratos vencen pronto?',

    // WhatsApp
    wa_title: 'Alertas por WhatsApp',
    wa_status_active: 'Bot activo y funcionando',
    wa_status_demo: 'Modo demostración',
    wa_commands_title: 'Comandos disponibles',
    wa_recipients: 'Quién recibe las alertas',
    wa_setup: 'Cómo activarlo',
    wa_send_alert: 'Enviar alerta ahora',
    wa_weekly: 'Enviar informe semanal',

    // Errors & messages
    error_not_found: 'Página no encontrada',
    error_not_found_sub: 'La página que buscás no existe o fue movida.',
    error_go_home: 'Volver al Panel Principal',
    success_saved: 'Guardado correctamente',
    success_deleted: 'Eliminado correctamente',
    error_generic: 'Ocurrió un error. Intentá de nuevo.',
  },

  // ── ENGLISH ──────────────────────────────────────────────────
  en: {
    lang_name: 'English',
    lang_flag: '🇺🇸',
    loading: 'Loading...',
    save: 'Save',
    cancel: 'Cancel',
    delete: 'Delete',
    edit: 'Edit',
    add: 'Add',
    search: 'Search',
    filter: 'Filter',
    export: 'Export',
    print: 'Print',
    back: 'Back',
    close: 'Close',
    confirm: 'Confirm',
    yes: 'Yes',
    no: 'No',
    of: 'of',
    total: 'Total',
    status: 'Status',
    date: 'Date',
    name: 'Name',
    email: 'Email',
    phone: 'Phone',
    actions: 'Actions',
    details: 'View details',
    required: 'Required field',
    optional: 'Optional',
    welcome: 'Welcome',
    logout: 'Sign Out',
    settings: 'Settings',
    help: 'Help',
    version: 'Version',

    login_title: 'Welcome to the Municipal System',
    login_subtitle: 'Sign in with your official email and password',
    login_email: 'Email address',
    login_password: 'Password',
    login_btn: 'Sign in',
    login_show_pass: 'Show password',
    login_demo_title: 'Demo users — click to sign in',
    login_forgot: 'Forgot your password?',
    login_error: 'Incorrect email or password. Please check your credentials.',
    login_loading: 'Signing in...',
    login_hero_tagline: 'World-Class Municipal Management System',
    login_hero_sub: 'Full control of spending, staff and citizen services — from any device.',
    login_feature_1: 'AI-Powered Insights',
    login_feature_2: 'WhatsApp Alerts',
    login_feature_3: 'Multi-Municipality',
    login_security: 'Secure access · All logins are recorded',

    role_super_admin: 'Platform Administrator',
    role_tenant_admin: 'Mayor / Director',
    role_tenant_user: 'Municipal Officer',
    role_demo: 'Demo Access',
    role_super_admin_desc: 'Full access to all municipalities in the system',
    role_tenant_admin_desc: 'Complete executive panel for your municipality',
    role_hacienda_desc: 'Finance, budget and procurement only',
    role_it_desc: 'Technical administration and contracts',
    role_demo_desc: 'Demo view without real data',
    role_badge_super: '⚡ PLATFORM ADMIN',
    role_badge_admin: '🏛️ MAYOR',
    role_badge_user: '👤 OFFICER',
    role_badge_demo: '🌐 DEMO',
    click_to_login: 'Click to sign in →',

    dashboard_title: 'Main Dashboard',
    dashboard_welcome_morning: 'Good morning',
    dashboard_welcome_afternoon: 'Good afternoon',
    dashboard_welcome_evening: 'Good evening',
    dashboard_last_login: 'Last sign in',
    dashboard_quick_actions: 'Quick access',
    dashboard_alerts_title: 'Situations requiring attention',
    dashboard_alerts_critical: 'Urgent',
    dashboard_alerts_warning: 'Warning',
    dashboard_alerts_info: 'Information',
    dashboard_kpi_budget: 'Annual Budget',
    dashboard_kpi_spent: 'Monthly Spending',
    dashboard_kpi_employees: 'Municipal Staff',
    dashboard_kpi_complaints: 'Citizen Requests',
    dashboard_kpi_savings: 'Savings Found',
    dashboard_status_online: 'System running',
    dashboard_status_db: 'Database connected',
    dashboard_status_updated: 'Updated',
    dashboard_status_minutes: 'minutes ago',

    nav_section_main: 'MAIN',
    nav_section_control: 'FINANCIAL CONTROL',
    nav_section_management: 'MANAGEMENT',
    nav_section_operations: 'OPERATIONS',
    nav_section_comms: 'COMMUNICATIONS',
    nav_section_system: 'SYSTEM',
    nav_dashboard: 'Dashboard',
    nav_control: 'Spending Control',
    nav_ia: 'AI Assistant',
    nav_analytics: 'Reports & Charts',
    nav_budget: 'Budget',
    nav_map: 'Financial Map',
    nav_rrhh: 'Municipal Staff',
    nav_bids: 'Bids & Procurement',
    nav_suppliers: 'Suppliers',
    nav_citizens: 'Citizen Requests',
    nav_workshops: 'Municipal Workshops',
    nav_services: 'Municipal Services',
    nav_whatsapp: 'WhatsApp Alerts',
    nav_landing: 'Presentation Page',
    nav_import: 'Import Data',
    nav_upload: 'Upload Files',
    nav_export: 'Generate Reports',
    nav_presentation: 'Executive Presentation',
    nav_manual: 'User Guide',

    admin_title: 'Platform Control Center',
    admin_overview: 'General Overview',
    admin_municipalities: 'Municipalities in the system',
    admin_users: 'Registered users',
    admin_income: 'System income',
    admin_new_municipality: '+ Add Municipality',
    admin_kpi_active: 'Active Municipalities',
    admin_kpi_trial: 'Trial Municipalities',
    admin_kpi_monthly_income: 'Monthly Income',
    admin_kpi_annual_projection: 'Annual Projection',
    admin_kpi_total_users: 'Total Users',
    admin_status_active: 'Active',
    admin_status_trial: 'Trial',
    admin_status_suspended: 'Suspended',
    admin_status_cancelled: 'Cancelled',
    admin_plan_starter: 'Basic Plan',
    admin_plan_professional: 'Professional Plan',
    admin_plan_enterprise: 'Institutional Plan',
    admin_plan_demo: 'Demo Plan',
    admin_new_muni_title: 'Add new municipality',
    admin_muni_name: 'Municipality name',
    admin_muni_slug: 'Unique identifier (no spaces)',
    admin_muni_province: 'State / Province',
    admin_admin_email: 'Administrator email',
    admin_admin_name: 'Administrator name',
    admin_admin_password: 'Initial password',

    ia_title: 'Municipal AI Assistant',
    ia_placeholder: 'Ask your question in English...',
    ia_send: 'Send',
    ia_voice: 'Speak',
    ia_upload: 'Upload file',
    ia_clear: 'Clear conversation',
    ia_export: 'Save conversation',
    ia_greeting: 'Hello! I am the Municipal Assistant. You can ask me about spending, staff, citizen requests or any data from your municipality.',
    ia_examples: 'How much did we spend this month? · How many staff do we have? · Which contracts are expiring soon?',

    wa_title: 'WhatsApp Alerts',
    wa_status_active: 'Bot active and running',
    wa_status_demo: 'Demo mode',
    wa_commands_title: 'Available commands',
    wa_recipients: 'Who receives alerts',
    wa_setup: 'How to activate',
    wa_send_alert: 'Send alert now',
    wa_weekly: 'Send weekly report',

    error_not_found: 'Page not found',
    error_not_found_sub: 'The page you are looking for does not exist or has been moved.',
    error_go_home: 'Go to Dashboard',
    success_saved: 'Saved successfully',
    success_deleted: 'Deleted successfully',
    error_generic: 'An error occurred. Please try again.',
  },

  // ── PORTUGUÊS BRASIL ─────────────────────────────────────────
  pt: {
    lang_name: 'Português',
    lang_flag: '🇧🇷',
    loading: 'Carregando...',
    save: 'Salvar',
    cancel: 'Cancelar',
    delete: 'Excluir',
    edit: 'Editar',
    add: 'Adicionar',
    search: 'Buscar',
    filter: 'Filtrar',
    export: 'Exportar',
    print: 'Imprimir',
    back: 'Voltar',
    close: 'Fechar',
    confirm: 'Confirmar',
    yes: 'Sim',
    no: 'Nio',
    of: 'de',
    total: 'Total',
    status: 'Status',
    date: 'Data',
    name: 'Nome',
    email: 'E-mail',
    phone: 'Telefone',
    actions: 'Ações',
    details: 'Ver detalhes',
    required: 'Campo obrigatório',
    optional: 'Opcional',
    welcome: 'Bem-vindo',
    logout: 'Sair do sistema',
    settings: 'Configurações',
    help: 'Ajuda',
    version: 'Versio',

    login_title: 'Bem-vindo ao Sistema Municipal',
    login_subtitle: 'Entre com seu e-mail e senha institucional',
    login_email: 'Endereço de e-mail',
    login_password: 'Senha',
    login_btn: 'Entrar no sistema',
    login_show_pass: 'Mostrar senha',
    login_demo_title: 'Usuários de demonstraçio — clique para entrar',
    login_forgot: 'Esqueceu sua senha?',
    login_error: 'E-mail ou senha incorretos. Verifique seus dados.',
    login_loading: 'Entrando...',
    login_hero_tagline: 'Sistema de Gestio Municipal de Classe Mundial',
    login_hero_sub: 'Controle total de gastos, pessoal e serviços ao cidadio — de qualquer dispositivo.',
    login_feature_1: 'Com Inteligência Artificial',
    login_feature_2: 'Alertas pelo WhatsApp',
    login_feature_3: 'Para vários municípios',
    login_security: 'Acesso seguro · Todos os acessos sio registrados',

    role_super_admin: 'Administrador Geral',
    role_tenant_admin: 'Prefeito / Diretor',
    role_tenant_user: 'Funcionário Municipal',
    role_demo: 'Acesso de Demonstraçio',
    role_super_admin_desc: 'Acesso completo a todos os municípios do sistema',
    role_tenant_admin_desc: 'Painel executivo completo do seu município',
    role_hacienda_desc: 'Somente finanças, orçamento e compras',
    role_it_desc: 'Administraçio técnica e contratos',
    role_demo_desc: 'Visualizaçio de demonstraçio sem dados reais',
    role_badge_super: '⚡ ADMIN GERAL',
    role_badge_admin: '🏛️ PREFEITO',
    role_badge_user: '👤 FUNCIONÁRIO',
    role_badge_demo: '🌐 DEMO',
    click_to_login: 'Clique para entrar →',

    dashboard_title: 'Painel Principal',
    dashboard_welcome_morning: 'Bom dia',
    dashboard_welcome_afternoon: 'Boa tarde',
    dashboard_welcome_evening: 'Boa noite',
    dashboard_last_login: 'Último acesso',
    dashboard_quick_actions: 'Acesso rápido',
    dashboard_alerts_title: 'Situações que precisam de atençio',
    dashboard_alerts_critical: 'Urgente',
    dashboard_alerts_warning: 'Atençio',
    dashboard_alerts_info: 'Informaçio',
    dashboard_kpi_budget: 'Orçamento Total do Ano',
    dashboard_kpi_spent: 'Gasto do Mês',
    dashboard_kpi_employees: 'Funcionários Municipais',
    dashboard_kpi_complaints: 'Pedidos de Cidadios',
    dashboard_kpi_savings: 'Economia Identificada',
    dashboard_status_online: 'Sistema funcionando',
    dashboard_status_db: 'Banco de dados conectado',
    dashboard_status_updated: 'Atualizado há',
    dashboard_status_minutes: 'minutos',

    nav_section_main: 'PRINCIPAL',
    nav_section_control: 'CONTROLE FINANCEIRO',
    nav_section_management: 'GESTiO',
    nav_section_operations: 'OPERAÇÕES',
    nav_section_comms: 'COMUNICAÇÕES',
    nav_section_system: 'SISTEMA',
    nav_dashboard: 'Painel Principal',
    nav_control: 'Controle de Gastos',
    nav_ia: 'Assistente Inteligente',
    nav_analytics: 'Relatórios e Gráficos',
    nav_budget: 'Orçamento',
    nav_map: 'Mapa Financeiro',
    nav_rrhh: 'Pessoal Municipal',
    nav_bids: 'Licitações e Compras',
    nav_suppliers: 'Fornecedores',
    nav_citizens: 'Pedidos de Cidadios',
    nav_workshops: 'Oficinas Municipais',
    nav_services: 'Serviços Municipais',
    nav_whatsapp: 'Alertas pelo WhatsApp',
    nav_landing: 'Página de Apresentaçio',
    nav_import: 'Importar Informações',
    nav_upload: 'Carregar Arquivos',
    nav_export: 'Gerar Relatórios',
    nav_presentation: 'Apresentaçio Executiva',
    nav_manual: 'Manual de Uso',

    admin_title: 'Centro de Controle da Plataforma',
    admin_overview: 'Resumo Geral',
    admin_municipalities: 'Municípios no sistema',
    admin_users: 'Usuários cadastrados',
    admin_income: 'Receita do sistema',
    admin_new_municipality: '+ Adicionar Município',
    admin_kpi_active: 'Municípios Ativos',
    admin_kpi_trial: 'Municípios em Teste',
    admin_kpi_monthly_income: 'Receita Mensal',
    admin_kpi_annual_projection: 'Projeçio Anual',
    admin_kpi_total_users: 'Total de Usuários',
    admin_status_active: 'Ativo',
    admin_status_trial: 'Em teste',
    admin_status_suspended: 'Suspenso',
    admin_status_cancelled: 'Cancelado',
    admin_plan_starter: 'Plano Básico',
    admin_plan_professional: 'Plano Profissional',
    admin_plan_enterprise: 'Plano Institucional',
    admin_plan_demo: 'Plano Demo',
    admin_new_muni_title: 'Adicionar novo município',
    admin_muni_name: 'Nome do município',
    admin_muni_slug: 'Identificador único (sem espaços)',
    admin_muni_province: 'Estado / Província',
    admin_admin_email: 'E-mail do administrador',
    admin_admin_name: 'Nome do administrador',
    admin_admin_password: 'Senha inicial',

    ia_title: 'Assistente Inteligente Municipal',
    ia_placeholder: 'Faça sua pergunta em português...',
    ia_send: 'Enviar',
    ia_voice: 'Falar',
    ia_upload: 'Enviar arquivo',
    ia_clear: 'Limpar conversa',
    ia_export: 'Salvar conversa',
    ia_greeting: 'Olá! Sou o Assistente Municipal. Você pode me perguntar sobre gastos, funcionários, pedidos ou qualquer dado do município.',
    ia_examples: 'Quanto gastamos este mês? · Quantos funcionários temos? · Quais contratos estio vencendo em breve?',

    wa_title: 'Alertas pelo WhatsApp',
    wa_status_active: 'Bot ativo e funcionando',
    wa_status_demo: 'Modo demonstraçio',
    wa_commands_title: 'Comandos disponíveis',
    wa_recipients: 'Quem recebe os alertas',
    wa_setup: 'Como ativar',
    wa_send_alert: 'Enviar alerta agora',
    wa_weekly: 'Enviar relatório semanal',

    error_not_found: 'Página nio encontrada',
    error_not_found_sub: 'A página que você procura nio existe ou foi movida.',
    error_go_home: 'Voltar ao Painel Principal',
    success_saved: 'Salvo com sucesso',
    success_deleted: 'Excluído com sucesso',
    error_generic: 'Ocorreu um erro. Tente novamente.',
  },
};

// ── i18n ENGINE ──────────────────────────────────────────────
const i18n = {
  // Current language (default: browser language or 'es')
  lang: localStorage.getItem('govtech_lang') || 
        (navigator.language?.startsWith('pt') ? 'pt' : 
         navigator.language?.startsWith('en') ? 'en' : 'es'),

  // Get translation
  t(key, fallback) {
    return TRANSLATIONS[this.lang]?.[key] || TRANSLATIONS['es']?.[key] || fallback || key;
  },

  // Set language and persist
  setLang(lang) {
    if (!TRANSLATIONS[lang]) return;
    this.lang = lang;
    localStorage.setItem('govtech_lang', lang);
    document.documentElement.lang = lang === 'pt' ? 'pt-BR' : lang;
    this.applyToPage();
  },

  // Apply translations to elements with data-i18n attribute
  applyToPage() {
    document.querySelectorAll('[data-i18n]').forEach(el => {
      const key = el.getAttribute('data-i18n');
      const translation = this.t(key);
      if (translation) {
        if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') {
          el.placeholder = translation;
        } else {
          el.textContent = translation;
        }
      }
    });
    document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
      const key = el.getAttribute('data-i18n-placeholder');
      el.placeholder = this.t(key);
    });
    document.querySelectorAll('[data-i18n-title]').forEach(el => {
      const key = el.getAttribute('data-i18n-title');
      el.title = this.t(key);
    });
  },

  // Initialize: apply on load
  init() {
    document.documentElement.lang = this.lang === 'pt' ? 'pt-BR' : this.lang;
    this.applyToPage();
    return this;
  },

  // Get all languages for picker
  getLanguages() {
    return Object.entries(TRANSLATIONS).map(([code, t]) => ({
      code,
      name: t.lang_name,
      flag: t.lang_flag,
    }));
  },

  // Build language picker HTML
  buildPicker(containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;
    const langs = this.getLanguages();
    container.innerHTML = `
      <div class="lang-picker">
        ${langs.map(l => `
          <button 
            class="lang-btn ${l.code === this.lang ? 'active' : ''}" 
            onclick="i18n.setLang('${l.code}'); document.querySelectorAll('.lang-btn').forEach(b=>b.classList.remove('active')); this.classList.add('active');"
            title="${l.name}"
          >
            <span>${l.flag}</span>
            <span>${l.name}</span>
          </button>
        `).join('')}
      </div>
    `;
  },
};

// Auto-init on DOMContentLoaded
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => i18n.init());
} else {
  i18n.init();
}

