/*
 * Workspace presets. Setiap brand (AlphaLeaders, PIWA, iPlus, dll) = 1 preset.
 * Semua label, stage funnel, jenis sesi, akun & program bisa diedit di aplikasi.
 * Akun demo: password "demo".
 */
(function () {
  const labelsCoach = {
    lead: 'Lead', leads: 'Leads', client: 'Client', clients: 'Clients',
    mentor: 'Coach', mentors: 'Coaches', session: 'Session', sessions: 'Sessions',
    program: 'Program', programs: 'Programs', owner: 'BD / Sales'
  };
  const lostReasons = ['Budget belum siap', 'Timing belum pas', 'Pilih kompetitor', 'Tidak responsif', 'Tidak qualified'];
  const funnelALUR = [
    { id: 'new', name: 'Lead Masuk', color: '#64748b', prob: 5, sla: 2, type: 'open' },
    { id: 'cov', name: 'COV Call (15m)', color: '#0284c7', prob: 15, sla: 3, type: 'open' },
    { id: 'abm', name: 'ABM Mapping (2–3j)', color: '#d97706', prob: 40, sla: 7, type: 'open' },
    { id: 'abe', name: 'ABE Closing (2j)', color: '#7c3aed', prob: 70, sla: 7, type: 'open' },
    { id: 'won', name: 'Deal Won', color: '#16a34a', prob: 100, sla: 0, type: 'won' },
    { id: 'lost', name: 'Lost', color: '#dc2626', prob: 0, sla: 0, type: 'lost' }
  ];
  const sessionsALUR = [
    { id: 'st-cov', name: 'COV Call', duration: 15, color: '#0284c7', stageId: 'cov' },
    { id: 'st-abm', name: 'ABM Assessment & Mapping', duration: 150, color: '#d97706', stageId: 'abm' },
    { id: 'st-abe', name: 'ABE Proposal & Closing', duration: 120, color: '#7c3aed', stageId: 'abe' },
    { id: 'st-coach', name: 'Coaching Session', duration: 120, color: '#16a34a', stageId: '' },
    { id: 'st-review', name: 'Review / Induction', duration: 60, color: '#0f766e', stageId: '' }
  ];

  window.PRESETS = {
    alphaleaders: {
      name: 'AlphaLeaders Coaching',
      config: {
        brandName: 'AlphaLeaders', tagline: 'Coaching CRM · Lead to Deal', accent: '#1a4fa0', currency: 'IDR', demoLogin: true,
        labels: Object.assign({}, labelsCoach),
        stages: funnelALUR, sessionTypes: sessionsALUR,
        sources: ['Meta Ads', 'Google Ads', 'Referral', 'Organic / Social', 'Event / Seminar', 'BD Relation', 'Walk-in'],
        lostReasons: lostReasons,
        waTemplate: 'Halo {name}, mengingatkan {type} bersama {mentor} pada {date} jam {time} WIB. Sampai bertemu! — {brand}'
      },
      accounts: [
        { id: 'u-owner', name: 'Owner AlphaLeaders', email: 'owner@alphaleaders.id', role: 'superadmin' },
        { id: 'u-lisa', name: 'Lisa', email: 'lisa@alphaleaders.id', role: 'admin' },
        { id: 'm-hendra', name: 'Coach Hendra', email: 'hendra@alphaleaders.id', role: 'senior' },
        { id: 'm-sylvia', name: 'Coach Sylvia', email: 'sylvia@alphaleaders.id', role: 'mentor' },
        { id: 'm-alvin', name: 'Coach Alvin', email: 'alvin@alphaleaders.id', role: 'mentor' },
        { id: 'a-tika', name: 'Tika', email: 'tika@alphaleaders.id', role: 'assistant', mentorId: 'm-sylvia' },
        { id: 'a-yoga', name: 'Yoga', email: 'yoga@alphaleaders.id', role: 'assistant', mentorId: 'm-alvin' },
        { id: 'b-rina', name: 'Rina', email: 'rina@alphaleaders.id', role: 'bd' },
        { id: 'b-fajar', name: 'Fajar', email: 'fajar@alphaleaders.id', role: 'bd' },
        { id: 'b-maya', name: 'Maya', email: 'maya@alphaleaders.id', role: 'bd' }
      ],
      programs: [
        { id: 'p-private', name: '1-Year Private Coaching', format: 'Private', price: 120000000, sessions: 24, months: 12 },
        { id: 'p-group', name: '1-Year Group Mastermind', format: 'Group', price: 36000000, sessions: 24, months: 12 },
        { id: 'p-abm', name: 'Business Mapping (ABM only)', format: 'Private', price: 7500000, sessions: 1, months: 1 }
      ]
    },

    piwa: {
      name: 'PIWA',
      config: {
        brandName: 'PIWA', tagline: 'Mentoring CRM · Prospect to Enrollment', accent: '#0d9488', currency: 'IDR', demoLogin: true,
        labels: {
          lead: 'Prospect', leads: 'Prospects', client: 'Member', clients: 'Members',
          mentor: 'Mentor', mentors: 'Mentors', session: 'Class', sessions: 'Classes',
          program: 'Program', programs: 'Programs', owner: 'Sales'
        },
        stages: [
          { id: 'new', name: 'Prospect Baru', color: '#64748b', prob: 5, sla: 2, type: 'open' },
          { id: 'preview', name: 'Preview / Webinar', color: '#0284c7', prob: 20, sla: 5, type: 'open' },
          { id: 'consult', name: 'Konsultasi 1-on-1', color: '#d97706', prob: 45, sla: 5, type: 'open' },
          { id: 'offer', name: 'Penawaran', color: '#7c3aed', prob: 70, sla: 5, type: 'open' },
          { id: 'won', name: 'Enrolled', color: '#16a34a', prob: 100, sla: 0, type: 'won' },
          { id: 'lost', name: 'Lost', color: '#dc2626', prob: 0, sla: 0, type: 'lost' }
        ],
        sessionTypes: [
          { id: 'st-web', name: 'Free Webinar / Preview', duration: 90, color: '#0284c7', stageId: 'preview' },
          { id: 'st-consult', name: 'Konsultasi 1-on-1', duration: 30, color: '#d97706', stageId: 'consult' },
          { id: 'st-offer', name: 'Presentasi Penawaran', duration: 45, color: '#7c3aed', stageId: 'offer' },
          { id: 'st-class', name: 'Class', duration: 120, color: '#16a34a', stageId: '' },
          { id: 'st-workshop', name: 'Workshop', duration: 240, color: '#0f766e', stageId: '' }
        ],
        sources: ['Instagram', 'TikTok', 'Meta Ads', 'Referral Member', 'Webinar', 'Event', 'WhatsApp Inbound'],
        lostReasons: lostReasons,
        waTemplate: 'Halo {name}! Reminder {type} bersama {mentor} — {date} jam {time} WIB. See you! — {brand}'
      },
      accounts: [
        { id: 'u-owner', name: 'Owner PIWA', email: 'owner@piwa.id', role: 'superadmin' },
        { id: 'u-nia', name: 'Nia', email: 'nia@piwa.id', role: 'admin' },
        { id: 'm-andra', name: 'Mentor Andra', email: 'andra@piwa.id', role: 'senior' },
        { id: 'm-bella', name: 'Mentor Bella', email: 'bella@piwa.id', role: 'mentor' },
        { id: 'a-raka', name: 'Raka', email: 'raka@piwa.id', role: 'assistant', mentorId: 'm-bella' },
        { id: 'b-dimas', name: 'Dimas', email: 'dimas@piwa.id', role: 'bd' },
        { id: 'b-sari', name: 'Sari', email: 'sari@piwa.id', role: 'bd' }
      ],
      programs: [
        { id: 'p-mentor', name: 'Mentorship 6 Bulan', format: 'Group', price: 15000000, sessions: 12, months: 6 },
        { id: 'p-private', name: 'Private Mentoring 1 Tahun', format: 'Private', price: 60000000, sessions: 24, months: 12 },
        { id: 'p-workshop', name: 'Weekend Workshop', format: 'Group', price: 2500000, sessions: 1, months: 1 }
      ]
    },

    iplus: {
      name: 'iPlus Leader Coaching',
      config: {
        brandName: 'iPlus Leader', tagline: 'Coaching Administration · ALUR', accent: '#1a4fa0', currency: 'IDR', demoLogin: true,
        labels: Object.assign({}, labelsCoach, { mentor: 'Mentor', mentors: 'Mentors', owner: 'Admin / Sales' }),
        stages: funnelALUR,
        sessionTypes: sessionsALUR.concat([
          { id: 'st-class', name: 'Mentoring / Class', duration: 120, color: '#2563b8', stageId: '' },
          { id: 'st-orient', name: 'Assessment / Orientation', duration: 60, color: '#f0a500', stageId: '' }
        ]),
        sources: ['Instagram', 'Referral', 'LinkedIn', 'Event', 'Website'],
        lostReasons: lostReasons,
        waTemplate: 'Halo {name}, reminder {type} bersama {mentor} pada {date} jam {time} WIB. — {brand}'
      },
      accounts: [
        { id: 'u-owner', name: 'Owner iPlus', email: 'owner@iplus.id', role: 'superadmin' },
        { id: 'u-dewi', name: 'Dewi Anggraini', email: 'dewi@iplus.id', role: 'admin' },
        { id: 'm-budi', name: 'Budi Santoso', email: 'budi@iplus.id', role: 'mentor' },
        { id: 'm-sari', name: 'Sari Wijaya', email: 'sari@iplus.id', role: 'mentor' },
        { id: 'a-rina', name: 'Rina Halim', email: 'rina@iplus.id', role: 'assistant', mentorId: 'm-budi' },
        { id: 'a-toni', name: 'Toni Gunawan', email: 'toni@iplus.id', role: 'assistant', mentorId: 'm-sari' }
      ],
      programs: [
        { id: 'p-private', name: 'Leader Private Coaching', format: 'Private', price: 90000000, sessions: 24, months: 12 },
        { id: 'p-group', name: 'Leader Group Class', format: 'Group', price: 25000000, sessions: 12, months: 6 }
      ]
    },

    blank: {
      name: 'Workspace Baru',
      config: {
        brandName: 'My Academy', tagline: 'Lead to Deal CRM', accent: '#4f46e5', currency: 'IDR', demoLogin: false,
        labels: {
          lead: 'Lead', leads: 'Leads', client: 'Client', clients: 'Clients',
          mentor: 'Mentor', mentors: 'Mentors', session: 'Session', sessions: 'Sessions',
          program: 'Program', programs: 'Programs', owner: 'Sales'
        },
        stages: [
          { id: 'new', name: 'Lead Baru', color: '#64748b', prob: 5, sla: 2, type: 'open' },
          { id: 'qualify', name: 'Discovery Call', color: '#0284c7', prob: 20, sla: 3, type: 'open' },
          { id: 'proposal', name: 'Proposal', color: '#d97706', prob: 50, sla: 7, type: 'open' },
          { id: 'won', name: 'Deal Won', color: '#16a34a', prob: 100, sla: 0, type: 'won' },
          { id: 'lost', name: 'Lost', color: '#dc2626', prob: 0, sla: 0, type: 'lost' }
        ],
        sessionTypes: [
          { id: 'st-call', name: 'Discovery Call', duration: 30, color: '#0284c7', stageId: 'qualify' },
          { id: 'st-prop', name: 'Proposal Meeting', duration: 60, color: '#d97706', stageId: 'proposal' },
          { id: 'st-session', name: 'Session', duration: 60, color: '#16a34a', stageId: '' }
        ],
        sources: ['Ads', 'Referral', 'Organic', 'Event'],
        lostReasons: ['Budget', 'Timing', 'Kompetitor', 'Tidak responsif'],
        waTemplate: 'Halo {name}, reminder {type} bersama {mentor} pada {date} jam {time}. — {brand}'
      },
      accounts: [
        { id: 'u-owner', name: 'Owner', email: 'owner@example.com', role: 'superadmin' }
      ],
      programs: [
        { id: 'p-1', name: 'Program Utama', format: 'Private', price: 10000000, sessions: 12, months: 6 }
      ]
    }
  };

  // Hak akses (RBAC). Label peran mentor/client/owner mengikuti terminologi workspace.
  window.ROLE_KEYS = ['superadmin', 'admin', 'senior', 'mentor', 'assistant', 'bd', 'client'];
  window.PERMISSIONS = [
    // [kemampuan, peran yang boleh]
    ['Kelola akun, peran & settings', ['superadmin', 'admin']],
    ['Lihat semua pipeline & laporan', ['superadmin', 'admin', 'senior']],
    ['Kelola lead (semua)', ['superadmin', 'admin', 'senior', 'assistant']],
    ['Kelola lead milik sendiri', ['bd']],
    ['Kelola sesi (semua)', ['superadmin', 'admin', 'senior']],
    ['Kelola sesi tim sendiri', ['mentor', 'assistant']],
    ['Kelola client & program', ['superadmin', 'admin', 'senior', 'mentor', 'assistant']],
    ['Hapus data', ['superadmin', 'admin']],
    ['Portal client (program & sesi sendiri)', ['client']]
  ];
})();
