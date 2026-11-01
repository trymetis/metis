export const PAGE_STYLE = `
:root { color-scheme: light dark; --fg: #111; --muted: #5f6368; --line: #e3e3e3; --panel: #f6f6f6; --pass: #137333; --fail: #c5221f; }
@media (prefers-color-scheme: dark) { :root { --fg: #e8e8e8; --muted: #a0a0a0; --line: #333; --panel: #1c1c1c; --pass: #81c995; --fail: #f28b82; } }
body { margin: 0; color: var(--fg); background: Canvas; font: 14px/1.5 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; }
main { max-width: 1040px; margin: 0 auto; padding: 32px 24px 48px; }
h1 { margin: 0 0 20px; font-size: 20px; font-weight: 600; }
.summary { display: grid; grid-template-columns: max-content 1fr; gap: 6px 24px; margin: 0; padding: 16px; border: 1px solid var(--line); border-radius: 10px; }
.summary dt { color: var(--muted); }
.summary dd { margin: 0; overflow-wrap: anywhere; }
.pass { color: var(--pass); font-weight: 600; }
.fail { color: var(--fail); font-weight: 600; }
.note { margin: 8px 0 0; color: var(--muted); font-size: 12px; }
.actions { display: flex; flex-wrap: wrap; gap: 8px; margin: 20px 0 12px; }
.action { font: inherit; font-size: 13px; padding: 6px 12px; border: 1px solid var(--line); border-radius: 8px; background: var(--panel); color: var(--fg); text-decoration: none; cursor: pointer; }
.source { margin: 0; padding: 16px; border: 1px solid var(--line); border-radius: 10px; background: var(--panel); font: 12px/1.55 ui-monospace, SFMono-Regular, Menlo, monospace; white-space: pre-wrap; word-break: break-word; }
`;
