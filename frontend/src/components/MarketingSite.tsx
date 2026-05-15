/**
 * frontend/src/components/MarketingSite.tsx
 *
 * Rendered when the user visits floplug.xyz (no env subdomain, no slug).
 * This is a standalone marketing page — no Firebase auth, no Firestore.
 *
 * Place this file at: frontend/src/components/MarketingSite.tsx
 */

import React, { useState } from 'react';

const MarketingSite: React.FC = () => {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <div style={s.root}>

      {/* ── Nav ── */}
      <nav style={s.nav}>
        <div style={s.navInner}>
          <div style={s.navBrand}>
            <div style={s.logoMark}>F</div>
            <span style={s.logoText}>FloPlug</span>
            <span style={s.logoExt}>.xyz</span>
          </div>
          <div style={s.navLinks}>
            {['Product', 'Pricing', 'Docs', 'Blog'].map(label => (
              <a key={label} href="#" style={s.navLink}>{label}</a>
            ))}
          </div>
          <div style={s.navCtas}>
            <a href="https://prod.floplug.xyz" style={s.btnOutline}>Admin portal</a>
            <a href="mailto:hello@floplug.xyz" style={s.btnPrimary}>Get in touch</a>
          </div>
        </div>
      </nav>

      {/* ── Hero ── */}
      <section style={s.hero}>
        {/* Dot grid background */}
        <div style={s.heroGrid} />

        <div style={s.heroContent}>
          <div style={s.heroBadge}>Enterprise iPaaS</div>

          <h1 style={s.heroTitle}>
            Connect your enterprise<br />
            <span style={s.heroAccent}>without the complexity</span>
          </h1>

          <p style={s.heroPara}>
            FloPlug is a multi-tenant integration platform that lets enterprise teams
            build, manage, and promote integration flos across SAP, Workday, Salesforce,
            and Oracle — without writing a line of infrastructure code.
          </p>

          <div style={s.heroActions}>
            <a href="mailto:hello@floplug.xyz" style={s.btnPrimaryLg}>Request a demo</a>
            <a href="https://docs.floplug.xyz" style={s.btnOutlineLg}>Read the docs</a>
          </div>

          <div style={s.heroStats}>
            {[
              { value: '4', label: 'Environments' },
              { value: '∞', label: 'Hubs' },
              { value: '6+', label: 'Connectors' },
              { value: '100%', label: 'Tenant isolated' },
            ].map(({ value, label }) => (
              <div key={label} style={s.stat}>
                <div style={s.statValue}>{value}</div>
                <div style={s.statLabel}>{label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Features ── */}
      <section style={s.section}>
        <div style={s.sectionInner}>
          <div style={s.sectionLabel}>How it works</div>
          <h2 style={s.sectionTitle}>One platform, every environment</h2>
          <p style={s.sectionPara}>
            FloPlug provisions isolated hubs for each customer, with DEV → Stage → Sandbox → Prod
            promotion built in. Your product team manages the platform; your customers manage their flos.
          </p>

          <div style={s.featureGrid}>
            {[
              {
                icon: '⚡', title: 'Instant hub provisioning',
                desc: 'One click to spin up a new customer hub with DEV and PROD tenants, default workspaces, and a branded portal URL.',
              },
              {
                icon: '🎨', title: 'Tenant branding',
                desc: 'Each customer hub has its own logo, accent colour, and display title applied automatically from Firestore branding data.',
              },
              {
                icon: '🔀', title: 'Visual flow designer',
                desc: 'Drag-and-drop connector nodes — Workday, SAP, Salesforce, Oracle — and connect them with field mappers and conditional filters.',
              },
              {
                icon: '🔒', title: 'Hub-scoped security',
                desc: 'Users can only see data within their own hub. Tenant Sentinel detects slug changes and forces re-authentication instantly.',
              },
              {
                icon: '📈', title: 'Tier-based billing',
                desc: 'Define subscription tiers with included quotas for users, flos, workspaces, and tenants — plus overage pricing rules.',
              },
              {
                icon: '🔗', title: 'Connector registry',
                desc: 'Register pre-built connectors once. Every tenant in every environment can use them — credentials stay server-side, always.',
              },
            ].map(({ icon, title, desc }) => (
              <div key={title} style={s.featureCard}>
                <div style={s.featureIcon}>{icon}</div>
                <div style={s.featureTitle}>{title}</div>
                <div style={s.featureDesc}>{desc}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Environment map ── */}
      <section style={{ ...s.section, background: '#0d0f18' }}>
        <div style={s.sectionInner}>
          <div style={s.sectionLabel}>Environments</div>
          <h2 style={s.sectionTitle}>Four environments, one codebase</h2>

          <div style={s.envGrid}>
            {[
              { env: 'DEV',   url: 'dev.floplug.xyz',   color: '#185FA5', desc: 'Internal development & feature testing' },
              { env: 'STAGE', url: 'stage.floplug.xyz', color: '#0F6E56', desc: 'Pre-release validation with customer data' },
              { env: 'SB',    url: 'sb.floplug.xyz',    color: '#854F0B', desc: 'Sandbox — prod copy for customer debugging' },
              { env: 'PROD',  url: 'prod.floplug.xyz',  color: '#A32D2D', desc: 'Live customer workloads' },
            ].map(({ env, url, color, desc }) => (
              <div key={env} style={{ ...s.envCard, borderTopColor: color }}>
                <div style={{ ...s.envBadge, background: `${color}22`, color }}>
                  {env}
                </div>
                <div style={s.envUrl}>{url}</div>
                <div style={s.envDesc}>{desc}</div>
                <div style={s.envPaths}>
                  <div style={s.envPath}>/{'{slug}'}  → Customer workspace</div>
                  <div style={s.envPath}>(no slug) → Admin portal</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── CTA ── */}
      <section style={s.cta}>
        <div style={s.ctaInner}>
          <h2 style={s.ctaTitle}>Ready to connect your enterprise?</h2>
          <p style={s.ctaPara}>
            Talk to us about provisioning your first hub. We'll have you running in under an hour.
          </p>
          <a href="mailto:hello@floplug.xyz" style={s.btnPrimaryLg}>
            hello@floplug.xyz
          </a>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer style={s.footer}>
        <div style={s.footerInner}>
          <div style={s.footerBrand}>
            <div style={s.logoMark}>F</div>
            <span style={s.logoText}>FloPlug</span>
            <span style={s.logoExt}>.xyz</span>
          </div>
          <div style={s.footerNote}>© 2026 FloPlug.xyz — Enterprise Integration Platform</div>
          <div style={s.footerLinks}>
            <a href="https://docs.floplug.xyz" style={s.footerLink}>Docs</a>
            <a href="mailto:hello@floplug.xyz" style={s.footerLink}>Contact</a>
            <a href="https://prod.floplug.xyz" style={s.footerLink}>Admin</a>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default MarketingSite;

// ── Styles ────────────────────────────────────────────────────────────────────
const s: Record<string, React.CSSProperties> = {
  root:         { minHeight: '100vh', background: '#0a0c12', color: '#e8e8f0', fontFamily: "'Inter',-apple-system,sans-serif" },

  // Nav
  nav:          { position: 'sticky', top: 0, zIndex: 100, background: 'rgba(10,12,18,0.9)', backdropFilter: 'blur(12px)', borderBottom: '0.5px solid rgba(255,255,255,0.07)' },
  navInner:     { maxWidth: 1100, margin: '0 auto', padding: '0 24px', height: 60, display: 'flex', alignItems: 'center', gap: 32 },
  navBrand:     { display: 'flex', alignItems: 'center', gap: 6, textDecoration: 'none' },
  logoMark:     { width: 28, height: 28, borderRadius: 7, background: '#4f8ef7', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 800, color: '#fff', flexShrink: 0 },
  logoText:     { fontSize: 15, fontWeight: 700, color: '#f0f0f4' },
  logoExt:      { fontSize: 15, fontWeight: 700, color: '#4f8ef7' },
  navLinks:     { display: 'flex', gap: 24, marginLeft: 24 },
  navLink:      { fontSize: 13, color: '#9090a0', textDecoration: 'none', transition: 'color .15s' },
  navCtas:      { marginLeft: 'auto', display: 'flex', gap: 10, alignItems: 'center' },
  btnOutline:   { padding: '6px 14px', borderRadius: 7, border: '0.5px solid rgba(255,255,255,.15)', background: 'transparent', color: '#c0c0cc', fontSize: 12, fontWeight: 500, textDecoration: 'none', cursor: 'pointer' },
  btnPrimary:   { padding: '6px 16px', borderRadius: 7, border: 'none', background: '#4f8ef7', color: '#fff', fontSize: 12, fontWeight: 600, textDecoration: 'none', cursor: 'pointer' },

  // Hero
  hero:         { position: 'relative', padding: '100px 24px 80px', textAlign: 'center', overflow: 'hidden' },
  heroGrid:     { position: 'absolute', inset: 0, backgroundImage: 'radial-gradient(circle, rgba(79,142,247,0.06) 1px, transparent 1px)', backgroundSize: '32px 32px', pointerEvents: 'none' },
  heroContent:  { maxWidth: 780, margin: '0 auto', position: 'relative', zIndex: 1 },
  heroBadge:    { display: 'inline-block', padding: '4px 12px', borderRadius: 20, background: 'rgba(79,142,247,0.12)', color: '#4f8ef7', border: '0.5px solid rgba(79,142,247,0.3)', fontSize: 12, fontWeight: 600, letterSpacing: '0.3px', marginBottom: 24 },
  heroTitle:    { fontSize: 52, fontWeight: 700, lineHeight: 1.15, color: '#f0f0f4', marginBottom: 20, letterSpacing: '-1px' },
  heroAccent:   { color: '#4f8ef7' },
  heroPara:     { fontSize: 17, color: '#7070a0', lineHeight: 1.7, maxWidth: 580, margin: '0 auto 32px' },
  heroActions:  { display: 'flex', gap: 14, justifyContent: 'center', marginBottom: 56 },
  btnPrimaryLg: { padding: '12px 28px', borderRadius: 9, border: 'none', background: '#4f8ef7', color: '#fff', fontSize: 14, fontWeight: 600, textDecoration: 'none', cursor: 'pointer' },
  btnOutlineLg: { padding: '12px 28px', borderRadius: 9, border: '0.5px solid rgba(255,255,255,.2)', background: 'transparent', color: '#c0c0cc', fontSize: 14, fontWeight: 500, textDecoration: 'none', cursor: 'pointer' },
  heroStats:    { display: 'flex', gap: 48, justifyContent: 'center' },
  stat:         { textAlign: 'center' },
  statValue:    { fontSize: 28, fontWeight: 700, color: '#f0f0f4', lineHeight: 1 },
  statLabel:    { fontSize: 12, color: '#5a5a7a', marginTop: 4 },

  // Sections
  section:      { padding: '80px 24px', background: '#0a0c12' },
  sectionInner: { maxWidth: 1100, margin: '0 auto' },
  sectionLabel: { fontSize: 11, fontWeight: 600, color: '#4f8ef7', textTransform: 'uppercase', letterSpacing: '0.8px', marginBottom: 12 },
  sectionTitle: { fontSize: 36, fontWeight: 700, color: '#f0f0f4', marginBottom: 16, letterSpacing: '-0.5px' },
  sectionPara:  { fontSize: 15, color: '#7070a0', lineHeight: 1.7, maxWidth: 620, marginBottom: 48 },

  // Feature grid
  featureGrid:  { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 20 },
  featureCard:  { background: '#10121e', border: '0.5px solid rgba(255,255,255,0.07)', borderRadius: 12, padding: '24px', transition: 'border-color .15s' },
  featureIcon:  { fontSize: 24, marginBottom: 14 },
  featureTitle: { fontSize: 15, fontWeight: 600, color: '#e0e0f0', marginBottom: 8 },
  featureDesc:  { fontSize: 13, color: '#6b6b84', lineHeight: 1.6 },

  // Env grid
  envGrid:      { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 16 },
  envCard:      { background: '#0a0c12', border: '0.5px solid rgba(255,255,255,0.08)', borderTop: '3px solid', borderRadius: 10, padding: '20px' },
  envBadge:     { display: 'inline-block', fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 20, letterSpacing: '0.5px', marginBottom: 10 },
  envUrl:       { fontSize: 13, fontFamily: 'monospace', color: '#9090a0', marginBottom: 8 },
  envDesc:      { fontSize: 13, color: '#6b6b84', lineHeight: 1.5, marginBottom: 12 },
  envPaths:     { display: 'flex', flexDirection: 'column', gap: 4 },
  envPath:      { fontSize: 11, fontFamily: 'monospace', color: '#45455a', padding: '3px 7px', background: 'rgba(255,255,255,0.03)', borderRadius: 4 },

  // CTA
  cta:          { padding: '80px 24px', background: '#0d0f18', textAlign: 'center' },
  ctaInner:     { maxWidth: 580, margin: '0 auto' },
  ctaTitle:     { fontSize: 36, fontWeight: 700, color: '#f0f0f4', marginBottom: 16, letterSpacing: '-0.5px' },
  ctaPara:      { fontSize: 15, color: '#7070a0', lineHeight: 1.7, marginBottom: 28 },

  // Footer
  footer:       { borderTop: '0.5px solid rgba(255,255,255,0.07)', padding: '32px 24px' },
  footerInner:  { maxWidth: 1100, margin: '0 auto', display: 'flex', alignItems: 'center', gap: 24, flexWrap: 'wrap' },
  footerBrand:  { display: 'flex', alignItems: 'center', gap: 6 },
  footerNote:   { fontSize: 12, color: '#3a3a50', flex: 1 },
  footerLinks:  { display: 'flex', gap: 20 },
  footerLink:   { fontSize: 12, color: '#5a5a7a', textDecoration: 'none' },
};
