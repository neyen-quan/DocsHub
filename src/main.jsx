import {version as programVersion} from '../package.json';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { createRoot } from 'react-dom/client';
import { MessageCircle, Send, Mail, FolderOpen, Sparkles, ChevronDown, ExternalLink, PanelsTopLeft, Plus, Search, ArrowLeft, File as FileIcon, Folder, Image, FileText, Table2, Film, RefreshCw, HardDrive, ShieldCheck, LayoutGrid, Sun, Moon, Facebook, Linkedin, CalendarDays, FolderPlus, Pencil, Trash2, Columns2, Copy, Scissors, ClipboardPaste, Smartphone, Wallet } from 'lucide-react';
import './style.css';
import DocumentSelectionArea from './DocumentSelectionArea';
import RinaAccounts, {useRinaAccounts} from './RinaAccounts';

function orderDocumentPanels(panels, order) {
  const documents = panels.filter(p => p.section === 'documents').sort((a,b) => { const rank = slot => { const i = order.indexOf(slot); return i < 0 ? order.length : i; }; return rank(a.slot) - rank(b.slot); });
  let next = 0;
  const ordered = panels.map(p => p.section === 'documents' ? documents[next++] : p);
  return [...ordered.filter(p => p.section !== 'metadata'), ...ordered.filter(p => p.section === 'metadata')];
}

function documentFolderName(folder) {
  const trimmed = String(folder || '').replace(/[\\/]+$/, '');
  return trimmed.split(/[\\/]/).at(-1) || folder || 'Elegí una carpeta';
}
function DocumentFolderNode({ node, ancestors, active, expanded, onToggle, onNavigate, revision, root = false }) {
  const [children, setChildren] = useState([]);
  const [loading, setLoading] = useState(false);
  const open = expanded.includes(node.path);
  useEffect(() => {
    if (!open) return;
    let alive = true; setLoading(true);
    window.workhub2.listSubfolders(node.path).then(items => { if (alive) { setChildren(items); setLoading(false); } }).catch(() => { if (alive) { setChildren([]); setLoading(false); } });
    return () => { alive = false; };
  }, [node.path, open, revision]);
  const chain = [...ancestors, node.path];
  return <div role="treeitem" aria-expanded={open} aria-selected={active === node.path}><div className={`document-tree-row ${active === node.path ? 'current' : ''} ${root ? 'tree-root' : ''}`}><button className="document-tree-expand" aria-label={`${open ? 'Contraer' : 'Expandir'} ${node.name}`} onClick={() => onToggle(node.path)}>{open ? '▾' : '▸'}</button><button className="document-tree-name" title={node.path} onClick={() => onNavigate(node.path, chain)}>{root ? <FolderOpen size={15}/> : <Folder size={14}/>}<span>{node.name}</span></button></div>{open && <div role="group" className="document-tree-children">{loading && !children.length && <span className="document-tree-loading">Cargando…</span>}{children.map(child => <DocumentFolderNode key={child.path} node={child} ancestors={chain} active={active} expanded={expanded} onToggle={onToggle} onNavigate={onNavigate} revision={revision}/>)}</div>}</div>;
}

function renamedDocumentPath(value, previous, next, directory) {
  if (typeof value !== 'string') return value;
  if (value.startsWith('zip://')) {
    const end = value.indexOf('!/');
    if (end < 0) return value;
    try {
      const archive = decodeURIComponent(value.slice(6, end));
      const updated = renamedDocumentPath(archive, previous, next, directory);
      return updated === archive ? value : `zip://${encodeURIComponent(updated)}${value.slice(end)}`;
    } catch { return value; }
  }
  const windows = /^[a-z]:/i.test(previous) || previous.startsWith('\\\\');
  const target = windows ? value.toLowerCase() : value;
  const source = windows ? previous.toLowerCase() : previous;
  if (target === source || (directory && target.startsWith(source) && ['/', '\\'].includes(value[previous.length]))) return next + value.slice(previous.length);
  return value;
}

const EMAILS = [];
const AI_APPS = [
  { id: 'gpt-personal', name: 'GPT Personal', short: 'GPT Personal', sub: 'Cuenta personal de ChatGPT', icon: Sparkles },
  { id: 'gpt-alterframe', name: 'GPT Alter Frame', short: 'GPT Alter Frame', sub: 'Cuenta de ChatGPT de Alter Frame', icon: Sparkles },
  { id: 'gemini-personal', name: 'Gemini Personal', short: 'Gemini Personal', sub: 'Cuenta personal de Google', icon: Sparkles }
];
const MESSAGING_APPS = [];
const DEFAULT_MICROINFLUENCERS_URL = 'https://example.com/';
const GMAIL_DEVA_STARTUP_MIGRATION = 'workhub2-gmail-deva-startup-v2';
const TABS = [
  ...AI_APPS.map(app => ({ id: app.id, title: app.short, icon: app.icon })),
  { id: 'documents', title: 'Documentos', icon: FolderOpen },
  { id: 'metadata', title: 'Metadatos', icon: ShieldCheck },
  { id: 'rina-accounts', title: 'Cuentas Rina', icon: Wallet }
];

const TAB_IDS = TABS.map(item => item.id);
const isAiProvider = id => AI_APPS.some(app => app.id === id);
function loadNameOverrides(key) {
  try {
    const value = JSON.parse(localStorage.getItem(key) || '{}');
    return value && typeof value === 'object' && !Array.isArray(value)
      ? Object.fromEntries(Object.entries(value).filter(([id, name]) => typeof id === 'string' && typeof name === 'string'))
      : {};
  } catch { return {}; }
}
const DEFAULT_AI_WORKSPACE = [
  { id: 'chat-default-personal', service: 'gpt-personal', name: 'GPT Personal', url: 'https://chatgpt.com/', customName: false },
  { id: 'chat-default-alterframe', service: 'gpt-alterframe', name: 'GPT Alter Frame', url: 'https://chatgpt.com/', customName: false },
  { id: 'chat-default-gemini-personal', service: 'gemini-personal', name: 'Gemini Personal', url: 'https://gemini.google.com/app?hl=es-419', customName: false }
];
const AI_PROVIDER_TABS_MIGRATION = 'workhub2-ai-provider-tabs-migrated-v1';
const GEMINI_PERSONAL_TAB_MIGRATION = 'workhub2-gemini-personal-tab-v1';
const ALTER_FRAME_TAB_MIGRATION = 'workhub2-gpt-alterframe-tab-v1';
function loadAiWorkspace() {
  try {
    const saved = JSON.parse(localStorage.getItem('workhub2-ai-chat-tabs') || 'null');
    const valid = Array.isArray(saved) ? saved.filter(item => AI_APPS.some(app => app.id === item?.service) && typeof item.id === 'string') : [];
    if (valid.length) {
      const current = valid.map(item => ({ ...item, name: String(item.name || 'Chat IA'), url: String(item.url || ''), customName: Boolean(item.customName) }));
      if (!localStorage.getItem(AI_PROVIDER_TABS_MIGRATION)) {
        for (const providerTab of DEFAULT_AI_WORKSPACE) {
          if (!current.some(item => item.service === providerTab.service)) current.push(providerTab);
        }
        localStorage.setItem(AI_PROVIDER_TABS_MIGRATION, 'done');
      }
      if (!localStorage.getItem(GEMINI_PERSONAL_TAB_MIGRATION)) {
        if (!current.some(item => item.service === 'gemini-personal')) current.push(DEFAULT_AI_WORKSPACE.find(item => item.service === 'gemini-personal'));
        localStorage.setItem(GEMINI_PERSONAL_TAB_MIGRATION, 'done');
      }
      if (!localStorage.getItem(ALTER_FRAME_TAB_MIGRATION)) {
        if (!current.some(item => item.service === 'gpt-alterframe')) current.push(DEFAULT_AI_WORKSPACE.find(item => item.service === 'gpt-alterframe'));
        // Persist the appended tab before marking the migration complete.
        localStorage.setItem('workhub2-ai-chat-tabs', JSON.stringify(current));
        localStorage.setItem(ALTER_FRAME_TAB_MIGRATION, 'done');
      }
      return current;
    }
  } catch {}
  try { localStorage.setItem(AI_PROVIDER_TABS_MIGRATION, 'done'); } catch {}
  return DEFAULT_AI_WORKSPACE;
}
function normalizeAiSplitPanes(value, aiTabs) {
  const source = Array.isArray(value) && value.length === 2 ? value : DEFAULT_SPLIT_PANES;
  return source.map((pane, index) => {
    const section = pane?.section === 'ai' || TAB_IDS.includes(pane?.section) ? pane.section : DEFAULT_SPLIT_PANES[index].section;
    if (section !== 'ai') {
      const choices = SPLIT_SUBOPTIONS[section] || [];
      const sub = choices.some(option => option.id === pane?.sub) ? pane.sub : choices[0]?.id || '';
      return { section, sub };
    }
    const current = aiTabs.find(item => item.id === pane?.sub) || aiTabs.find(item => item.service === pane?.sub) || aiTabs[0];
    return { section: 'ai', sub: current?.id || DEFAULT_AI_WORKSPACE[0].id };
  });
}
function aiViewId(item) { return `ai-chat-${item.id}::${item.service}`; }
const DEFAULT_FOLDER_TABS = [];
function makeDefaultNav() {
  const order = (() => { try { const old = JSON.parse(localStorage.getItem('workhub2-tab-order') || 'null'); return Array.isArray(old) ? [...old.filter((id, i) => TAB_IDS.includes(id) && old.indexOf(id) === i), ...TAB_IDS.filter(id => !old.includes(id))] : TAB_IDS; } catch { return TAB_IDS; } })();
  const folder = { type: 'folder', id: 'folder-social', name: 'Redes y agenda', open: false, children: order.filter(id => DEFAULT_FOLDER_TABS.includes(id)) };
  let inserted = false;
  const items = [];
  for (const id of order) {
    if (DEFAULT_FOLDER_TABS.includes(id)) { if (!inserted) { items.push(folder); inserted = true; } }
    else items.push({ type: 'tab', id });
  }
  return items;
}
function loadNavItems() {
  let saved;
  try { saved = JSON.parse(localStorage.getItem('workhub2-tab-structure') || 'null'); } catch {}
  if (!Array.isArray(saved)) return makeDefaultNav();
  const result = [], seen = new Set();
  const addTab = id => { if (id === 'ai') { AI_APPS.forEach(app => addTab(app.id)); return; } if (TAB_IDS.includes(id) && !seen.has(id)) { result.push({ type: 'tab', id }); seen.add(id); } };
  for (const item of saved) {
    if (item?.type === 'tab') addTab(item.id);
    else if (item?.type === 'folder' && typeof item.id === 'string' && typeof item.name === 'string') {
      const children = [];
      for (const id of Array.isArray(item.children) ? item.children : []) {
        if (id === 'ai') { for (const app of AI_APPS) if (!seen.has(app.id)) { children.push(app.id); seen.add(app.id); } }
        else if (TAB_IDS.includes(id) && !seen.has(id)) { children.push(id); seen.add(id); }
      }
      result.push({ type: 'folder', id: item.id, name: item.name, open: Boolean(item.open), children });
    }
  }
  // Put Gemini alongside the provider tabs in the user's existing Trabajo/IA
  // folder. If no provider folder exists, leave the normal top-level fallback.
  if (!seen.has('gemini-personal')) {
    const providerFolder = result.find(item => item.type === 'folder' && item.children.some(id => ['gpt-personal', 'gpt-alterframe', 'ia-nico'].includes(id)));
    if (providerFolder) { providerFolder.children.push('gemini-personal'); seen.add('gemini-personal'); }
  }
  TAB_IDS.filter(id => !seen.has(id)).forEach(id => result.push({ type: 'tab', id }));
  return result;
}
function removeTab(items, tabId) {
  return items.map(item => item.type === 'folder' ? { ...item, children: item.children.filter(id => id !== tabId) } : item).filter(item => item.type !== 'tab' || item.id !== tabId);
}

const imageFile = item => !item.directory && /\.(png|jpe?g|webp|gif|bmp|avif)$/i.test(item.name) && !item.path.startsWith('zip://');
const videoFile = item => !item.directory && /\.(mp4|mov|m4v|webm|avi|mkv|wmv|mpg|mpeg|mts|m2ts|3gp|ogv)$/i.test(item.name) && !item.path.startsWith('zip://');
const documentThumbnailCache = new Map();
function DocumentThumbnail({ item, onDragStart, onExternalDrag, externalMode }) {
  const ref = useRef(null);
  const [source, setSource] = useState(null);
  useEffect(() => {
    setSource(null);
    if (!imageFile(item) && !videoFile(item)) return;
    let alive = true;
    const key = `${item.path}:${item.size}:${item.modifiedMs}`;
    const load = () => {
      if (!documentThumbnailCache.has(key)) {
        documentThumbnailCache.set(key, Promise.resolve(window.workhub2?.documentThumbnail(item.path)).catch(() => ({src:null})));
        if (documentThumbnailCache.size > 128) documentThumbnailCache.delete(documentThumbnailCache.keys().next().value);
      }
      documentThumbnailCache.get(key).then(result => { if (alive) setSource(result?.src || null); });
    };
    const observer = new IntersectionObserver(entries => { if (entries.some(entry => entry.isIntersecting)) { observer.disconnect(); load(); } }, { rootMargin: '150px' });
    if (ref.current) observer.observe(ref.current);
    return () => { alive = false; observer.disconnect(); };
  }, [item.path, item.size, item.modifiedMs]);
  const Icon = item.directory ? Folder : videoFile(item) ? Film : imageFile(item) ? Image : FileIcon;
  return <span ref={ref} className={`document-thumbnail ${item.directory ? 'folder-thumbnail' : ''}`} draggable={!item.directory && !item.path.startsWith('zip://')} onDragStart={onDragStart} title={item.directory ? item.name : externalMode ? 'Arrastrá hacia otra aplicación o web para adjuntar este archivo.' : 'Arrastrá para mover entre Documentos. Alt + arrastrar permite adjuntar afuera.'}>
    {source ? <img src={source} alt={`Vista previa de ${item.name}`} draggable={false} onError={() => setSource(null)}/> : <Icon size={30}/>}
    {videoFile(item) && source && <span className="video-thumbnail-badge" aria-hidden="true"><Film size={12}/></span>}
    {!item.directory && !item.path.startsWith('zip://') && <button type="button" className="thumbnail-drag-mark" draggable title="Arrastrar hacia otra aplicación o página web" aria-label={`Arrastrar ${item.name} hacia otra aplicación`} onDragStart={onExternalDrag} onClick={event => event.stopPropagation()} onDoubleClick={event => event.stopPropagation()}><ExternalLink size={13}/></button>}
  </span>;
}

function App() {
  const [tab, setTab] = useState(() => {
    try { const saved = JSON.parse(localStorage.getItem('workhub2-global-panels') || 'null'); const panel = Array.isArray(saved) && saved.length ? saved.at(-1) : null; const section = panel?.section; if (section === 'ai') { const chats = JSON.parse(localStorage.getItem('workhub2-ai-chat-tabs') || '[]'); return chats.find(item => item.id === panel.sub)?.service || 'gpt-personal'; } if (TAB_IDS.includes(section) || section === 'documents') return section; } catch {}
    return 'gpt-personal';
  });
  const [aiTabs, setAiTabs] = useState(loadAiWorkspace);
  const [activeAiTabId, setActiveAiTabId] = useState(() => localStorage.getItem('workhub2-ai-active-tab') || DEFAULT_AI_WORKSPACE[0].id);
  const [visibleAiTabIds, setVisibleAiTabIds] = useState(() => {
    try { const saved = JSON.parse(localStorage.getItem('workhub2-ai-visible-tabs') || 'null'); return Array.isArray(saved) ? saved : [DEFAULT_AI_WORKSPACE[0].id]; } catch { return [DEFAULT_AI_WORKSPACE[0].id]; }
  });
  const [aiChatDialog, setAiChatDialog] = useState(null);
  const [aiDialogError, setAiDialogError] = useState('');
  const [draggedAiTabId, setDraggedAiTabId] = useState(null);
  const [aiDropTarget, setAiDropTarget] = useState(null);
  const [aiGridRatios, setAiGridRatios] = useState(() => {
    try { const saved = JSON.parse(localStorage.getItem('workhub2-ai-grid-ratios') || 'null'); return { x: Math.max(25,Math.min(75,Number(saved?.x)||50)), x2: Math.max(43,Math.min(82,Number(saved?.x2)||66.67)), y: Math.max(25,Math.min(75,Number(saved?.y)||50)) }; } catch { return { x:50, x2:66.67, y:50 }; }
  });
  const [globalPanels, setGlobalPanels] = useState(() => {
    try { const saved = JSON.parse(localStorage.getItem('workhub2-global-panels') || 'null'); return Array.isArray(saved) ? saved.filter(panel => panel?.section !== 'messaging').slice(0,3).map((panel,index) => panel.section === 'documents' ? { ...panel, slot: Number.isInteger(panel.slot) ? panel.slot : index } : panel).sort((a,b) => Number(a.section === 'metadata') - Number(b.section === 'metadata')) : []; } catch { return []; }
  });
  const [navItems, setNavItems] = useState(loadNavItems);
  const [tabNames, setTabNames] = useState(() => loadNameOverrides('workhub2-tab-names'));
  const [mailAccountNames, setMailAccountNames] = useState(() => loadNameOverrides('workhub2-mail-account-names'));
  const [draggedItem, setDraggedItem] = useState(null);
  const [tabContext, setTabContext] = useState(null);
  const [folderDialog, setFolderDialog] = useState(null);
  const [panelReplacement, setPanelReplacement] = useState(null);
  const [updating, setUpdating] = useState(false);
  useEffect(() => { window.workhub2?.desktopReady?.().catch(() => {}); }, []);
  async function installDesktopPatch() {
    if (updating) return;
    setUpdating(true);
    try { const result = await window.workhub2.desktopUpdate(); if (!result?.ok) window.alert(result?.error || 'No se pudo actualizar DocsHub.'); setUpdating(false); }
    catch (error) { setUpdating(false); window.alert(error.message || 'No se pudo abrir el actualizador.'); }
  }
  const [theme, setTheme] = useState(() => localStorage.getItem('workhub2-theme') === 'light' ? 'light' : 'dark');
  const [visibleMessageIds, setVisibleMessageIds] = useState(() => {
    try {
      const saved = JSON.parse(localStorage.getItem('workhub2-visible-messaging-apps') || 'null');
      const valid = Array.isArray(saved) ? MESSAGING_APPS.map(app => app.id).filter(id => saved.includes(id)) : [];
      return valid.length ? valid : ['wa-personal'];
    } catch { return ['wa-personal']; }
  });
  const [activeMessageId, setActiveMessageId] = useState(() => {
    const saved = localStorage.getItem('workhub2-active-messaging-app');
    return MESSAGING_APPS.some(app => app.id === saved) ? saved : 'wa-personal';
  });
  const [metadataUrl, setMetadataUrl] = useState(() => localStorage.getItem('workhub2-metadata-url') || 'https://killexif.com/es/');
  const [metadataDraft, setMetadataDraft] = useState(metadataUrl);
  const [metadataDestination, setMetadataDestination] = useState('');
  const [metadataStatus, setMetadataStatus] = useState('');
  useEffect(() => { localStorage.setItem('workhub2-metadata-url', metadataUrl); }, [metadataUrl]);
  useEffect(() => { if (window.workhub2) window.workhub2.metadataDestination().then(setMetadataDestination); }, []);
  function applyMetadataUrl() {
    try { const url = new URL(metadataDraft.includes('://') ? metadataDraft : `https://${metadataDraft}`); if (!['http:', 'https:'].includes(url.protocol)) throw Error(); setMetadataUrl(url.href); setMetadataDraft(url.href); setMetadataStatus(''); if (url.href === metadataUrl) { const i = globalPanels.findIndex(p => p.section === 'metadata'); window.workhub2?.reloadView(mixedGlobalPanels && i >= 0 ? `global-${i}::metadata` : 'metadata'); } } catch { setMetadataStatus('Ingresá una dirección web válida (https://…).'); }
  }
  const [microUrl, setMicroUrl] = useState(() => localStorage.getItem('workhub2-microinfluencers-url') || DEFAULT_MICROINFLUENCERS_URL);
  const [microUrlDraft, setMicroUrlDraft] = useState(() => localStorage.getItem('workhub2-microinfluencers-url') || DEFAULT_MICROINFLUENCERS_URL);
  const [selectedMailIds, setSelectedMailIds] = useState(() => {
    try {
      const saved = JSON.parse(localStorage.getItem('workhub2-selected-mail-accounts') || 'null');
      const valid = Array.isArray(saved) ? saved.filter(id => EMAILS.some(account => account.id === id)) : [];
      return valid.length ? EMAILS.map(account => account.id).filter(id => valid.includes(id)) : EMAILS.map(account => account.id);
    } catch { return EMAILS.map(account => account.id); }
  });
  const [calendarAccount, setCalendarAccount] = useState('gmail-laacade');
  const [folder, setFolder] = useState(() => localStorage.getItem('workhub2-folder') || '');
  const [splitDocs, setSplitDocs] = useState(() => {
    let saved = [];
    try { saved = JSON.parse(localStorage.getItem('workhub2-docs-panes') || '[]'); } catch {}
    return Array.from({ length: 20 }, (_, index) => ({ expanded: Array.isArray(saved[index]?.expanded) ? saved[index].expanded : [saved[index]?.folder || localStorage.getItem('workhub2-folder') || '', ...(saved[index]?.stack || [])].filter(Boolean), name: saved[index]?.name || `Documentos ${index + 1}`, folder: saved[index]?.folder || localStorage.getItem('workhub2-folder') || '', stack: [], entries: [], filter: '', selectedPaths: [], selectionAnchor: '' }));
  });
  const [documentTabCount, setDocumentTabCount] = useState(() => {
    const saved = Number(localStorage.getItem('workhub2-doc-tab-count'));
    return saved >= 1 && saved <= 20 ? saved : Math.max(1, ...globalPanels.filter(p => p.section === 'documents').map(p => (p.slot || 0) + 1));
  });
  const [documentTabOrder, setDocumentTabOrder] = useState(() => {
    let saved = []; try { saved = JSON.parse(localStorage.getItem('workhub2-doc-tab-order') || '[]'); } catch {}
    const slots = Array.from({length: documentTabCount}, (_, i) => i);
    return [...new Set([...(Array.isArray(saved) ? saved.filter(i => slots.includes(i)) : []), ...slots])];
  });
  const draggedDocumentSlot = useRef(null);
  useEffect(() => { localStorage.setItem('workhub2-doc-tab-order', JSON.stringify(documentTabOrder)); }, [documentTabOrder]);
  const [activeDocumentSlot, setActiveDocumentSlot] = useState(() => Math.max(0, Math.min(documentTabCount - 1, Number(localStorage.getItem('workhub2-doc-active-slot') ?? globalPanels.findLast(p => p.section === 'documents')?.slot ?? 0))));
  useEffect(() => { localStorage.setItem('workhub2-doc-tab-count', documentTabCount); }, [documentTabCount]);
  useEffect(() => { localStorage.setItem('workhub2-doc-active-slot', activeDocumentSlot); }, [activeDocumentSlot]);
  const [updateFolder, setUpdateFolder] = useState('');
  const [entries, setEntries] = useState([]);
  const [folderStack, setFolderStack] = useState([]);
  const [selectedPaths, setSelectedPaths] = useState([]);
  const [selectionAnchor, setSelectionAnchor] = useState('');
  const [filter, setFilter] = useState('');
  const clipboardWrite = useRef(Promise.resolve());
  const [documentMenu, setDocumentMenu] = useState(null);
  const [documentEdits, setDocumentEdits] = useState([]);
  const refreshEditedDocuments = useRef(null);
  refreshEditedDocuments.current = refreshDocumentsAfterTransfer;
  useEffect(() => {
    if (!inDesktop) return;
    let alive = true;
    const update = result => {
      if (!alive) return;
      if (result?.sessions) setDocumentEdits(result.sessions);
      if (result?.saved) { setDocumentStatus(`Edición guardada: ${result.saved}`); refreshEditedDocuments.current?.(); }
      if (result?.error) setDocumentStatus(result.error);
      if (result?.closed) setDocumentStatus('Edición finalizada.');
    };
    window.workhub2.documentEditList().then(update);
    const unsubscribe = window.workhub2.onDocumentEditStatus(update);
    return () => { alive = false; unsubscribe(); };
  }, []);
  async function editVideoVlc(file) {
    setDocumentMenu(null);
    await runDocumentAction(async () => {
      const result = await window.workhub2.editVideoVlc(file);
      if (!result?.ok) throw Error(result?.error || 'No se pudo abrir VLC.');
      setDocumentStatus(result.warning || 'Video abierto en VLC, en el monitor central.');
    }, 'Abriendo video en VLC…');
  }
  async function editVideoClipchamp(file) {
    setDocumentMenu(null);
    await runDocumentAction(async () => {
      const result = await window.workhub2.editVideoClipchamp(file);
      if (!result?.ok) throw Error(result?.error || 'No se pudo abrir Clipchamp.');
      setDocumentStatus('Video enviado a Clipchamp. Editá y exportá el resultado desde Clipchamp.');
    }, 'Abriendo video en Clipchamp…');
  }
  async function editDocument(file, editor) {
    setDocumentMenu(null);
    await runDocumentAction(async () => {
      const result = await window.workhub2.documentEditBegin(file, editor);
      if (result?.cancelled) { setDocumentStatus('Apertura del editor cancelada.'); return; }
      if (!result?.ok) throw Error(result?.error || 'No se pudo abrir el editor.');
      setDocumentEdits(result.sessions);
      setDocumentStatus('Editá y guardá en el editor. DocsHub te preguntará si sobrescribir o crear copia. Al cerrar el editor, la edición se finaliza automáticamente.');
    }, 'Abriendo una copia de trabajo…');
  }
  async function saveDocumentEdit(id, importFile = false, finish = false) {
    await runDocumentAction(async () => {
      const result = await (finish ? window.workhub2.documentEditFinish(id) : window.workhub2.documentEditSave(id, importFile));
      if (result?.cancelled) { setDocumentStatus('Edición pendiente; el original no se modificó con esta acción.'); return; }
      if (!result?.ok) throw Error(result?.error || 'No se pudo guardar la edición.');
      if (result.sessions) setDocumentEdits(result.sessions);
      if (result.target) await refreshDocumentsAfterTransfer();
      setDocumentStatus(finish ? 'Seguimiento de edición finalizado.' : `Edición guardada: ${result.target}`);
    }, finish ? 'Finalizando edición…' : 'Guardando edición…');
  }

  const [documentThumbnailSize, setDocumentThumbnailSize] = useState(() => {
    const saved = Number(localStorage.getItem('workhub2-document-thumbnail-size'));
    return Number.isFinite(saved) && saved >= 110 && saved <= 320 ? saved : 170;
  });
  useEffect(() => { localStorage.setItem('workhub2-document-thumbnail-size', documentThumbnailSize); }, [documentThumbnailSize]);
  const [documentDragMode, setDocumentDragMode] = useState('move');
  const [documentViewMode, setDocumentViewMode] = useState(() => localStorage.getItem('workhub2-document-view') === 'list' ? 'list' : 'previews');
  useEffect(() => { localStorage.setItem('workhub2-document-view', documentViewMode); }, [documentViewMode]);
  const [documentStatus, setDocumentStatus] = useState('');
  const documentBusy = useRef(false);
  const [documentTreeRevision, setDocumentTreeRevision] = useState(0);

  useEffect(() => window.workhub2?.onMetadataDownload(result => { setMetadataStatus(result.message); if (result.ok) void refreshDocumentsAfterTransfer(); }), [folder, folderStack, splitDocs, globalPanels]);

  const [patchError, setPatchError] = useState('');
  const [patchBusy, setPatchBusy] = useState(false);
  const [patchDragActive, setPatchDragActive] = useState(false);
  const [aiClipboardStatus, setAiClipboardStatus] = useState('');
  const [aiClipboardBusy, setAiClipboardBusy] = useState(false);
  const [viewError, setViewError] = useState(null);
  const [layoutKey, setLayoutKey] = useState(0);
  const inDesktop = Boolean(window.workhub2);
  const rinaLedger = useRinaAccounts();

  useEffect(() => window.workhub2?.onGptClipboardStatus?.(result => setAiClipboardStatus(result.message || result.error || '')), []);
  useEffect(() => setAiClipboardStatus(''), [tab, activeAiTabId]);
  async function pasteGptScreenshot() {
    setAiClipboardBusy(true); setAiClipboardStatus('Preparando captura…');
    try {
      const result = await window.workhub2?.pasteGptImage(aiViewId(providerActiveAiTab));
      setAiClipboardStatus(result?.message || result?.error || 'No pude acceder al portapapeles.');
    } catch { setAiClipboardStatus('No pude adjuntar la captura. Probá de nuevo.'); }
    finally { setAiClipboardBusy(false); }
  }
  useEffect(() => window.workhub2?.onAttachmentDragStatus?.(setDocumentStatus), []);

  useEffect(() => {
    localStorage.setItem('workhub2-theme', theme);
    window.workhub2?.setTheme(theme);
  }, [theme]);

  const activeAiTab = aiTabs.find(item => item.id === activeAiTabId) || aiTabs[0] || DEFAULT_AI_WORKSPACE[0];
  useEffect(() => {
    const handler = event => {
      if (!(event.ctrlKey || event.metaKey) || event.shiftKey || event.key.toLowerCase() !== 'z' || event.defaultPrevented || folderDialog || aiChatDialog || panelReplacement) return;
      if (event.target.closest?.('.rina-accounts,input,textarea,[contenteditable="true"]')) return;
      event.preventDefault(); void undoDocumentOperation();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [folder, folderStack, splitDocs, globalPanels, folderDialog, aiChatDialog, panelReplacement]);
  const providerAiTabs = aiTabs.filter(item => item.service === tab);
  const providerActiveAiTab = providerAiTabs.find(item => item.id === activeAiTabId) || providerAiTabs[0] || activeAiTab;
  const selectedAiTabs = useMemo(() => {
    return visibleAiTabIds.map(id => aiTabs.find(item => item.id === id)).filter(Boolean).slice(0, 3);
  }, [visibleAiTabIds, aiTabs]);
  const aiViewTargets = useMemo(() => Object.fromEntries(aiTabs.map(item => [aiViewId(item), item.url || ''])), [aiTabs]);
  const viewTargets = useMemo(() => ({ ...aiViewTargets, metadata: metadataUrl, ...Object.fromEntries(globalPanels.flatMap((p,i) => p.section === 'metadata' ? [[`global-${i}::metadata`, metadataUrl]] : [])), microinfluencers: microUrl, ...Object.fromEntries(globalPanels.flatMap((panel, index) => panel.section === 'microinfluencers' ? [[`global-${index}::microinfluencers`, microUrl]] : [])) }), [aiViewTargets, microUrl, metadataUrl, globalPanels]);
  useEffect(() => { localStorage.setItem('workhub2-microinfluencers-url', microUrl); }, [microUrl]);
  useEffect(() => { localStorage.setItem('workhub2-ai-chat-tabs', JSON.stringify(aiTabs)); }, [aiTabs]);
  useEffect(() => { localStorage.setItem('workhub2-ai-active-tab', activeAiTab.id); }, [activeAiTab.id]);
  useEffect(() => { localStorage.setItem('workhub2-ai-visible-tabs', JSON.stringify(selectedAiTabs.map(item => item.id))); }, [selectedAiTabs]);
  useEffect(() => { localStorage.setItem('workhub2-ai-grid-ratios', JSON.stringify(aiGridRatios)); }, [aiGridRatios]);
  useEffect(() => { localStorage.setItem('workhub2-selected-mail-accounts', JSON.stringify(selectedMailIds)); }, [selectedMailIds]);
  useEffect(() => { localStorage.setItem('workhub2-tab-names', JSON.stringify(tabNames)); }, [tabNames]);
  useEffect(() => { localStorage.setItem('workhub2-mail-account-names', JSON.stringify(mailAccountNames)); }, [mailAccountNames]);
  useEffect(() => { localStorage.setItem('workhub2-visible-messaging-apps', JSON.stringify(visibleMessageIds)); }, [visibleMessageIds]);
  useEffect(() => { localStorage.setItem('workhub2-active-messaging-app', activeMessageId); }, [activeMessageId]);

  useEffect(() => { localStorage.setItem('workhub2-global-panels', JSON.stringify(globalPanels)); }, [globalPanels]);
  useEffect(() => {
    localStorage.setItem('workhub2-docs-panes', JSON.stringify(splitDocs.map(({ name, folder: root, stack, expanded }) => ({ name, folder: root, stack, expanded }))));
  }, [splitDocs]);

  function panelViewId(panel, index = 0) {
    if (!panel) return null;
    if (panel.section === 'messaging') return `global-${index}::${activeMessageId}`;
    if (panel.section === 'gmail') return `global-${index}::${selectedMailIds[0] || 'gmail-laacade'}`;
    if (panel.section === 'calendar') return `global-${index}::calendar-${calendarAccount.replace('gmail-', '')}`;
    if (panel.section === 'metadata') return `global-${index}::metadata`;
    if (panel.section === 'facebook' || panel.section === 'linkedin') return `global-${index}::${panel.section}`;
    if (panel.section === 'microinfluencers') return `global-${index}::microinfluencers`;
    if (panel.section === 'ai') { const item = aiTabs.find(candidate => candidate.id === panel.sub) || activeAiTab; return aiViewId(item); }
    return null;
  }
  const globalViewIds = useMemo(() => globalPanels.map((panel, index) => panel.section === 'documents' ? null : panelViewId(panel, index)), [globalPanels, activeMessageId, selectedMailIds, calendarAccount, aiTabs, activeAiTab]);
  const mixedGlobalPanels = globalPanels.length > 1 && !(globalPanels.every(panel => panel.section === 'ai'));
  const multiAiGlobal = globalPanels.length > 1 && globalPanels.every(panel => panel.section === 'ai');

  const viewIds = useMemo(() => {
    if (tab === 'messaging') return MESSAGING_APPS.map(app => app.id).filter(id => visibleMessageIds.includes(id));
    if (tab === 'gmail') return selectedMailIds;
    if (isAiProvider(tab)) return selectedAiTabs.length ? selectedAiTabs.map(aiViewId) : [aiViewId(providerActiveAiTab)];
    if (tab === 'metadata') return [tab];
    if (tab === 'facebook' || tab === 'linkedin' || tab === 'microinfluencers') return [tab];
    if (tab === 'calendar') return [calendarAccount.replace('gmail-', 'calendar-')];
    return [];
  }, [tab, visibleMessageIds, selectedMailIds, selectedAiTabs, providerActiveAiTab, calendarAccount]);

  useEffect(() => {
    if (!inDesktop) return;
    const update = () => {
      const chrome = document.querySelector('.chrome');
      const overlay = document.querySelector('.overlay-bar, .global-layout-bar');
      const caption = document.querySelector('.remote-label, .mosaic-label, .messaging-mosaic-label');
      const top = (chrome?.getBoundingClientRect().height || 0) + (overlay?.getBoundingClientRect().height || 0) + (caption?.getBoundingClientRect().height || 0);
      const modalOpen = Boolean(folderDialog || aiChatDialog || documentMenu || panelReplacement);
      if (chrome) {
        const globalIds = mixedGlobalPanels && !modalOpen ? globalViewIds : null;
        const aiIds = !modalOpen && (multiAiGlobal ? globalViewIds : isAiProvider(tab) && !mixedGlobalPanels ? viewIds : null);
        window.workhub2.layout(modalOpen ? [] : globalIds ? [] : viewIds, top, globalIds, aiGridRatios.x, aiIds, aiGridRatios, viewTargets);
      }
    };
    const frame = requestAnimationFrame(update);
    const observer = new ResizeObserver(update);
    const chrome = document.querySelector('.chrome');
    if (chrome) observer.observe(chrome);
    window.addEventListener('resize', update);
    return () => { cancelAnimationFrame(frame); observer.disconnect(); window.removeEventListener('resize', update); };
  }, [inDesktop, viewIds, layoutKey, folderDialog, aiChatDialog, documentMenu, panelReplacement, globalViewIds, mixedGlobalPanels, multiAiGlobal, tab, viewTargets]);

  useEffect(() => {
    if (!inDesktop || !window.workhub2.onSplitRatiosChanged) return;
    return window.workhub2.onSplitRatiosChanged(ratios => {
      if (!ratios || !Number.isFinite(ratios.x) || !Number.isFinite(ratios.y)) return;
      setAiGridRatios(current => current.x === ratios.x && current.y === ratios.y && current.x2 === ratios.x2 ? current : ratios);
    });
  }, [inDesktop]);

  useEffect(() => {
    if (!inDesktop) return;
    const offError = window.workhub2.onViewError(e => setViewError(e));
    const offReady = window.workhub2.onViewReady?.(({ viewId }) => {
      setViewError(current => current?.viewId === viewId ? null : current);
    });
    return () => { offError?.(); offReady?.(); };
  }, [inDesktop]);

  useEffect(() => {
    if (!inDesktop || !window.workhub2.onAiViewNavigation) return;
    return window.workhub2.onAiViewNavigation(({ viewId, url }) => {
      if (!url) return;
      setAiTabs(current => {
        const item = current.find(candidate => aiViewId(candidate) === viewId);
        if (!item || item.url === url) return current;
        // Gmail and Google authentication are connection steps, not saved Gemini chats.
        if (item.service === 'gemini-personal') {
          try { if (new URL(url).hostname !== 'gemini.google.com') return current; } catch { return current; }
        }
        return current.map(candidate => candidate.id === item.id ? { ...candidate, url } : candidate);
      });
    });
  }, [inDesktop]);

  useEffect(() => {
    const path = folderStack.at(-1) || folder;
    if (path && inDesktop) window.workhub2.listFolder(path).then(setEntries);
    else setEntries([]);
  }, [folder, folderStack, inDesktop]);

  const splitDocPaths = splitDocs.map((doc, index) => doc.stack.at(-1) || doc.folder || folder);
  useEffect(() => {
    if (!inDesktop) return;
    globalPanels.forEach((pane, index) => {
      const slot = Number.isInteger(pane.slot) ? pane.slot : index;
      if (pane.section !== 'documents' || !splitDocPaths[slot]) return;
      const target = splitDocPaths[slot];
      window.workhub2.listFolder(target).then(items => setSplitDocs(current => current.map((doc, i) => {
        const currentPath = doc.stack.at(-1) || doc.folder || folder;
        return i === slot && currentPath === target ? { ...doc, entries: items } : doc;
      })));
    });
  }, [inDesktop, mixedGlobalPanels, globalPanels, ...splitDocPaths, folder]);

  function updateSplitDoc(index, patch) {
    setSplitDocs(current => current.map((doc, i) => i === index ? { ...doc, ...patch } : doc));
  }
  function pickFolder(paneIndex = null) {
    if (!inDesktop) return;
    window.workhub2.pickFolder().then(value => {
      if (!value) return;
      if (paneIndex !== null) {
        updateSplitDoc(paneIndex, { folder: value, stack: [], expanded: [value], entries: [], filter: '', selectedPaths: [], selectionAnchor: '' });
        if (!folder) { setFolder(value); localStorage.setItem('workhub2-folder', value); }
      }
      else { setFolder(value); localStorage.setItem('workhub2-folder', value); setFolderStack([]); setSelectedPaths([]); setSelectionAnchor(''); }
    });
  }
  async function createDocumentFolder(parent, name, paneIndex = null) {
    const result = await window.workhub2.createFolder(parent, name);
    if (!result?.ok) throw new Error(result?.error || 'No se pudo crear la carpeta.');
    const updatedEntries = await window.workhub2.listFolder(parent);
    if (paneIndex === null) setEntries(updatedEntries);
    else updateSplitDoc(paneIndex, { entries: updatedEntries, selectedPaths: [], selectionAnchor: '' });
    setDocumentTreeRevision(n => n + 1);
    setDocumentStatus(`Carpeta “${name.trim()}” creada.`);
  }
  function isUpdatePath(path) { return Boolean(updateFolder) && path.replace(/[\\/]+$/,'').toLowerCase() === updateFolder.replace(/[\\/]+$/,'').toLowerCase(); }
  async function dropPatchFiles(event) {
    event.preventDefault();
    setPatchDragActive(false);
    setPatchError('');
    const files = [...(event.dataTransfer?.files || [])].map(file => window.workhub2.getPathForFile(file)).filter(Boolean);
    if (!files.length) { setPatchError('No pude leer los archivos soltados. Probá arrastrar el ZIP desde el Explorador de Windows.'); return; }
    const result = await window.workhub2.stagePatches(files);
    if (!result?.ok) { setPatchError(result?.error || 'No se pudo importar el ZIP.'); return; }
    setEntries(await window.workhub2.listFolder(currentFolder));
  }
  async function applyPatch(file) {
    if (!window.confirm('DocsHub se va a cerrar, aplicar este parche y volver a abrirse. ¿Continuar?')) return;
    setPatchError('');
    setPatchBusy(true);
    const result = await window.workhub2.applyPatch(file);
    if (!result?.ok) { setPatchError(result?.error || 'No se pudo iniciar el parche.'); setPatchBusy(false); }
  }
  async function refreshDocumentsAfterTransfer(updatePath = value => value) {
    const mainPath = updatePath(currentFolder);
    const refreshes = [];
    if (mainPath) refreshes.push(window.workhub2.listFolder(mainPath).then(setEntries));
    for (let index = 0; index < splitDocs.length; index++) {
      const docPanel = globalPanels.find((panel, panelIndex) => panel.section === 'documents' && (Number.isInteger(panel.slot) ? panel.slot : panelIndex) === index);
      const path = updatePath(splitDocPaths[index]);
      if (!path || !docPanel) continue;
      refreshes.push(window.workhub2.listFolder(path).then(items => setSplitDocs(current => current.map((doc, i) => {
        const currentPath = doc.stack.at(-1) || doc.folder || folder;
        return i === index && updatePath(currentPath) === path ? { ...doc, entries: items } : doc;
      }))));
    }
    await Promise.all(refreshes);
    setDocumentTreeRevision(n => n + 1);
  }
  async function undoDocumentOperation() {
    await runDocumentAction(async () => {
      const result = await window.workhub2.undoDocuments();
      await refreshDocumentsAfterTransfer();
      if (!result?.ok) throw Error(result?.error || 'No pude deshacer.');
      setDocumentStatus(`Operación deshecha: ${result.reverted} elemento(s).`);
    }, 'Deshaciendo…');
  }
  async function extractDocumentZip(file, elsewhere) {
    setDocumentMenu(null);
    await runDocumentAction(async () => {
      const result = await window.workhub2.extractDocumentZip(file, elsewhere);
      await refreshDocumentsAfterTransfer();
      if (result?.cancelled) { setDocumentStatus('Extracción cancelada.'); return; }
      if (!result?.ok) throw Error(result?.error || 'No pude extraer el ZIP.');
      setDocumentStatus(`ZIP extraído en ${result.destination}.`);
    }, 'Extrayendo ZIP…');
  }
  async function dropDocumentFiles(event, destinationFolder) {
    event.preventDefault();
    if (!inDesktop) return;
    const internalPayload = event.dataTransfer?.getData('application/x-workhub2-files') || event.dataTransfer?.getData('text/plain') || '';
    let items = [];
    if (internalPayload.startsWith('workhub2-files:')) {
      try { items = JSON.parse(internalPayload.slice('workhub2-files:'.length)).filter(item => item?.path); } catch { items = []; }
    }
    if (!items.length) items = [...(event.dataTransfer?.files || [])].map(file => ({ path: window.workhub2.getPathForFile(file) })).filter(item => item.path);
    if (!items.length) return;
    const operation = event.ctrlKey ? 'copy' : 'move';
    event.stopPropagation();
    await runDocumentAction(async () => {
      const result = await window.workhub2.transferFiles(items, destinationFolder, operation);
      await refreshDocumentsAfterTransfer();
      if (result?.cancelled) { setDocumentStatus('Operación cancelada.'); return; }
      if (!result?.ok) throw new Error(result?.error || 'No se pudieron transferir los elementos.');
      setDocumentStatus(`${result.transferred ?? items.length} elemento(s) transferidos.`);
    }, 'Transfiriendo archivos…');
  }
  async function runDocumentAction(action, message) {
    if (documentBusy.current) return;
    documentBusy.current = true;
    setDocumentStatus(message);
    try { await action(); }
    catch (error) { setDocumentStatus(error.message || 'No se pudo completar la operación.'); }
    finally { documentBusy.current = false; }
  }
  function copyDocumentSelection(items, operation) {
    if (!items.length) return;
    setDocumentStatus(operation === 'move' ? 'Preparando para mover…' : 'Copiando al portapapeles…');
    const pending = clipboardWrite.current.catch(() => {}).then(() => window.workhub2.writeFileClipboard(items, operation));
    clipboardWrite.current = pending;
    pending.then(result => setDocumentStatus(result?.ok ? `${items.length} elemento(s) listos para pegar.` : result?.error || 'No se pudo usar el portapapeles.'), error => setDocumentStatus(error.message));
    return pending;
  }
  async function pasteDocumentItems(destinationFolder) {
    return runDocumentAction(async () => {
      const writeResult = await clipboardWrite.current;
      if (writeResult?.ok === false) throw new Error(writeResult.error || 'No se pudo copiar la selección.');
      const clipboard = await window.workhub2.readFileClipboard();
      if (clipboard?.error) throw new Error(clipboard.error);
      if (!clipboard?.paths?.length) { setDocumentStatus('No hay archivos en el portapapeles.'); return; }
      const result = await window.workhub2.transferFiles(clipboard.paths, destinationFolder, clipboard.operation || 'copy');
      await refreshDocumentsAfterTransfer();
      if (result?.cancelled) { setDocumentStatus('Operación cancelada.'); return; }
      if (!result?.ok) throw new Error(result?.error || 'No se pudieron pegar los archivos.');
      if (clipboard.operation === 'move') await window.workhub2.clearFileClipboard();
      setDocumentStatus(`${result.transferred ?? clipboard.paths.length} elemento(s) transferidos.`);
    }, 'Pegando archivos…');
  }
  async function deleteDocumentSelection(items) {
    if (!items.length) return;
    return runDocumentAction(async () => {
      const result = await window.workhub2.trashFiles(items);
      await refreshDocumentsAfterTransfer();
      if (result?.cancelled) { setDocumentStatus('Eliminación cancelada.'); return; }
      if (!result?.ok) throw new Error(result?.error || 'No se pudieron eliminar los archivos.');
      setDocumentStatus('Elementos enviados a la Papelera.');
    }, 'Enviando a la Papelera…');
  }
  function saveNav(next) {
    setNavItems(next);
    localStorage.setItem('workhub2-tab-structure', JSON.stringify(next));
  }
  function tabName(tabId) {
    return tabNames[tabId] || TABS.find(item => item.id === tabId)?.title || tabId;
  }
  function mailAccountName(account) {
    return mailAccountNames[account.id] || account.short;
  }
  function startNavDrag(type, id, event) {
    const payload = `${type}:${id}`;
    setDraggedItem({ type, id });
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', payload);
  }
  function handleNavDrop(targetType, targetId, event) {
    event.preventDefault();
    event.stopPropagation();
    const raw = event.dataTransfer.getData('text/plain');
    const split = raw.indexOf(':');
    const sourceType = split > 0 ? raw.slice(0, split) : draggedItem?.type;
    const sourceId = split > 0 ? raw.slice(split + 1) : draggedItem?.id;
    if (!sourceType || !sourceId || (sourceType === targetType && sourceId === targetId)) return;
    let next = structuredClone(navItems);
    if (sourceType === 'tab' && targetType === 'folder') {
      next = removeTab(next, sourceId);
      const group = next.find(item => item.type === 'folder' && item.id === targetId);
      if (group && !group.children.includes(sourceId)) { group.children.push(sourceId); group.open = true; }
    } else if (sourceType === 'tab' && targetType === 'tab') {
      const targetFolder = next.find(item => item.type === 'folder' && item.children.includes(targetId));
      const sourceFolder = next.find(item => item.type === 'folder' && item.children.includes(sourceId));
      next = removeTab(next, sourceId);
      if (targetFolder && sourceFolder?.id === targetFolder.id) {
        const group = next.find(item => item.type === 'folder' && item.id === targetFolder.id);
        group.children.splice(group.children.indexOf(targetId), 0, sourceId);
      } else if (targetFolder) {
        const group = next.find(item => item.type === 'folder' && item.id === targetFolder.id);
        group.children.splice(group.children.indexOf(targetId), 0, sourceId);
        group.open = true;
      } else {
        const at = next.findIndex(item => item.type === 'tab' && item.id === targetId);
        next.splice(at < 0 ? next.length : at, 0, { type: 'tab', id: sourceId });
      }
    } else if (sourceType === 'tab' && targetType === 'end') {
      next = removeTab(next, sourceId);
      next.push({ type: 'tab', id: sourceId });
    } else if (sourceType === 'folder' && targetType === 'folder') {
      const from = next.findIndex(item => item.type === 'folder' && item.id === sourceId);
      const to = next.findIndex(item => item.type === 'folder' && item.id === targetId);
      if (from >= 0 && to >= 0) next.splice(to, 0, next.splice(from, 1)[0]);
    } else if (sourceType === 'folder' && targetType === 'tab') {
      const from = next.findIndex(item => item.type === 'folder' && item.id === sourceId);
      const to = next.findIndex(item => item.type === 'tab' && item.id === targetId);
      if (from >= 0 && to >= 0) next.splice(to, 0, next.splice(from, 1)[0]);
    } else if (sourceType === 'folder' && targetType === 'end') {
      const from = next.findIndex(item => item.type === 'folder' && item.id === sourceId);
      if (from >= 0) next.push(next.splice(from, 1)[0]);
    }
    saveNav(next);
  }
  function createFolderFromTab(tabId) {
    setFolderDialog({ mode: 'create-tab', name: 'Nueva carpeta', tabId });
  }
  function createEmptyFolder() {
    setFolderDialog({ mode: 'create-empty', name: 'Nueva carpeta' });
  }
  function beginDocumentRename(item) {
    if (!item || item.path.startsWith('zip://')) return;
    const dot = item.name.lastIndexOf('.');
    const directory = item.directory && !item.archive;
    const extension = !directory && dot > 0 ? item.name.slice(dot) : '';
    setFolderDialog({ mode: 'rename-document', name: extension ? item.name.slice(0, dot) : item.name, extension, directory, file: item.path, error: '' });
    setDocumentMenu(null);
  }
  async function submitDocumentRename() {
    const dialog = folderDialog;
    if (!dialog || dialog.busy) return;
    setFolderDialog(current => ({ ...current, busy: true, error: '' }));
    try {
      const result = await window.workhub2.renameDocument(dialog.file, dialog.name.trim() + dialog.extension);
      if (!result?.ok) throw new Error(result?.error || 'No pude cambiar el nombre.');
      const updatePath = value => renamedDocumentPath(value, dialog.file, result.path, result.directory);
      setFolder(current => { const next = updatePath(current); localStorage.setItem('workhub2-folder', next); return next; });
      setFolderStack(current => current.map(updatePath));
      setSelectedPaths(current => current.map(updatePath));
      setSelectionAnchor(updatePath);
      setSplitDocs(current => current.map(doc => ({ ...doc, folder: updatePath(doc.folder), stack: doc.stack.map(updatePath), expanded: (doc.expanded || []).map(updatePath), selectedPaths: (doc.selectedPaths || []).map(updatePath), selectionAnchor: updatePath(doc.selectionAnchor) })));
      await refreshDocumentsAfterTransfer(updatePath);
      setFolderDialog(null);
      setDocumentStatus(`Nombre cambiado a ${result.name}.`);
    } catch (error) { setFolderDialog(current => current && { ...current, busy: false, error: error.message }); }
  }
  function submitFolderDialog() {
    const name = folderDialog?.name?.trim();
    if (!name) return;
    if (folderDialog.mode === 'rename-doc-tab') { updateSplitDoc(folderDialog.slot, { name }); setFolderDialog(null); return; }
    if (folderDialog.mode === 'rename-document') { void submitDocumentRename(); return; }
    if (folderDialog.mode === 'create-document') {
      createDocumentFolder(folderDialog.parent, name, folderDialog.paneIndex).then(() => setFolderDialog(null)).catch(error => window.alert(error.message));
      return;
    }
    if (folderDialog.mode === 'rename') {
      saveNav(navItems.map(item => item.type === 'folder' && item.id === folderDialog.folderId ? { ...item, name } : item));
    } else if (folderDialog.mode === 'rename-tab') {
      setTabNames(current => ({ ...current, [folderDialog.tabId]: name }));
    } else if (folderDialog.mode === 'rename-ai-chat') {
      setAiTabs(current => current.map(item => item.id === folderDialog.chatId ? { ...item, name, customName: true } : item));
    } else if (folderDialog.mode === 'rename-mail-account') {
      setMailAccountNames(current => ({ ...current, [folderDialog.accountId]: name }));
    } else if (folderDialog.mode === 'create-tab') {
      const next = removeTab(navItems, folderDialog.tabId);
      next.push({ type: 'folder', id: `folder-${Date.now()}`, name, open: true, children: [folderDialog.tabId] });
      saveNav(next);
    } else {
      saveNav([...navItems, { type: 'folder', id: `folder-${Date.now()}`, name, open: true, children: [] }]);
    }
    setFolderDialog(null);
  }
  function handleTabContext(action, target) {
    setTabContext(null);
    if (action === 'rename') {
      if (target.type === 'tab') setFolderDialog({ mode: 'rename-tab', tabId: target.id, name: tabName(target.id) });
      else if (target.type === 'ai-chat') setFolderDialog({ mode: 'rename-ai-chat', chatId: target.id, name: aiTabs.find(item => item.id === target.id)?.name || '' });
      else if (target.type === 'mail-account') {
        const account = EMAILS.find(item => item.id === target.id);
        if (account) setFolderDialog({ mode: 'rename-mail-account', accountId: target.id, name: mailAccountName(account) });
      } else if (target.type === 'folder') setFolderDialog({ mode: 'rename', name: target.name, folderId: target.id });
      return;
    }
    if (target.type === 'folder') {
      if (action === 'delete') {
        const next = [];
        navItems.forEach(item => item.type === 'folder' && item.id === target.id ? item.children.forEach(id => next.push({ type: 'tab', id })) : next.push(item));
        saveNav(next);
      } else if (action === 'toggle') saveNav(navItems.map(item => item.type === 'folder' && item.id === target.id ? { ...item, open: !item.open } : item));
      return;
    }
    if (action === 'create' && target.type === 'tab') createFolderFromTab(target.id);
    else if (action === 'ungroup') { const next = removeTab(navItems, target.id); next.push({ type: 'tab', id: target.id }); saveNav(next); }
    else if (action.startsWith('move:')) {
      const folderId = action.slice(5); let next = removeTab(navItems, target.id);
      const group = next.find(item => item.type === 'folder' && item.id === folderId);
      if (group) { group.children.push(target.id); group.open = true; saveNav(next); }
    }
  }
  function headerPopupHeight() {
    const chrome = document.querySelector('.chrome');
    const overlay = document.querySelector('.overlay-bar, .global-layout-bar');
    const caption = document.querySelector('.remote-label, .mosaic-label, .messaging-mosaic-label');
    return (chrome?.getBoundingClientRect().height || 0) +
      (overlay?.getBoundingClientRect().height || 0) +
      (caption?.getBoundingClientRect().height || 0) || 130;
  }
  function openTabContext(event, target) {
    event.preventDefault();
    const chromeHeight = headerPopupHeight();
    const canManageTab = target.type === 'tab';
    const isInFolder = canManageTab && navItems.some(item => item.type === 'folder' && item.children.includes(target.id));
    const rows = target.type === 'folder' ? 2 : canManageTab
      ? 2 + navItems.filter(item => item.type === 'folder').length + Number(isInFolder)
      : 1;
    const maxHeight = Math.max(40, chromeHeight - 8);
    const estimatedHeight = Math.min(maxHeight, rows * 36 + 12);
    setTabContext({
      x: Math.max(4, Math.min(event.clientX, window.innerWidth - 294)),
      y: Math.max(4, Math.min(event.clientY, chromeHeight - estimatedHeight - 4)),
      maxHeight,
      target
    });
  }
  function focusMailAccount(accountId) {
    setSelectedMailIds([accountId]);
    setTab('gmail'); setViewError(null); setLayoutKey(n => n + 1);
  }
  function toggleMailAccount(accountId) {
    setSelectedMailIds(current => current.includes(accountId)
      ? (current.length > 1 ? current.filter(id => id !== accountId) : current)
      : EMAILS.map(account => account.id).filter(id => current.includes(id) || id === accountId));
    setTab('gmail'); setViewError(null); setLayoutKey(n => n + 1);
  }
  function selectTab(id) {
    if (id === 'documents') { focusDocumentsSlot(activeDocumentSlot); return; }
    if (isAiProvider(id)) {
      const target = aiTabs.find(item => item.id === activeAiTabId && item.service === id) || aiTabs.find(item => item.service === id);
      // A tab name always focuses one view. Only checkboxes compose splits.
      if (target) focusAiChat(target.id);
    } else setGlobalPanels([{ section: id }]);
    setTab(id); setViewError(null); setLayoutKey(n => n + 1);
    if (id === 'microinfluencers') setTimeout(() => window.workhub2?.reloadView('microinfluencers'), 120);
  }
  function applyMicroUrl() {
    const candidate = microUrlDraft.trim();
    if (candidate) {
      try {
        const parsed = new URL(candidate);
        if (!(parsed.protocol === 'https:' || (parsed.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(parsed.hostname)))) throw new Error();
      } catch { window.alert('Pegá un enlace válido que empiece con https://. Para una prueba local, se admite http://localhost.'); return; }
    }
    setMicroUrl(candidate);
    setLayoutKey(value => value + 1);
    if (candidate === microUrl) {
      const index = globalPanels.findIndex(panel => panel.section === 'microinfluencers');
      const viewId = globalPanels.length > 1 && index >= 0 ? `global-${index}::microinfluencers` : 'microinfluencers';
      setTimeout(() => window.workhub2?.reloadView(viewId), 160);
    }
  }
  function currentPanels() {
    return globalPanels.every(p => p.section === 'ai') && selectedAiTabs.length > globalPanels.length ? selectedAiTabs.map(t => ({ section: 'ai', sub: t.id })) : globalPanels;
  }
  function commitPanels(next, target) {
    const ordered = orderDocumentPanels(next, documentTabOrder);
    setSplitDocs(docs => docs.map((doc,slot) => ordered.some(p => p.section === 'documents' && p.slot === slot) && !globalPanels.some(p => p.section === 'documents' && p.slot === slot) ? { ...doc, stack: [], filter: '', selectedPaths: [], selectionAnchor: '' } : doc));
    setGlobalPanels(ordered);
    setVisibleAiTabIds(ordered.filter(p => p.section === 'ai').map(p => p.sub));
    if (target?.section === 'documents') setActiveDocumentSlot(target.slot);
    if (target?.section === 'ai') setActiveAiTabId(target.sub);
    const last = target || ordered.at(-1);
    setTab(last?.section === 'ai' ? (aiTabs.find(t => t.id === last.sub)?.service || 'gpt-personal') : last?.section || 'documents');
    setAiGridRatios({ x: ordered.length === 3 ? 33.33 : 50, x2: 66.67, y: 50 });
    setViewError(null); setLayoutKey(n => n + 1);
  }
  function requestPanel(target) {
    const panels = currentPanels();
    if (panels.length >= 3) { setPanelReplacement({ target, panels }); return; }
    commitPanels([...panels, target], target);
  }
  function replacePanel(index) {
    const { target, panels } = panelReplacement;
    commitPanels([...panels.filter((_,i) => i !== index), target], target);
    setPanelReplacement(null);
  }
  function panelName(panel) { return panel.section === 'documents' ? splitDocs[panel.slot].name : panel.section === 'ai' ? aiTabs.find(t => t.id === panel.sub)?.name || 'GPT' : tabName(panel.section); }
  function toggleGlobalPanel(section, sub = null) {
    const target = { section, ...(section === 'ai' ? { sub: sub || activeAiTab.id } : {}) };
    const panels = currentPanels();
    const exists = panels.some(p => p.section === section && (section !== 'ai' || p.sub === target.sub));
    if (exists) commitPanels(panels.filter(p => !(p.section === section && (section !== 'ai' || p.sub === target.sub))));
    else requestPanel(target);
  }
  function toggleNavPanel(section) {
    if (section === 'documents') { toggleDocumentsSlot(activeDocumentSlot); return; }
    if (isAiProvider(section)) {
      const target = aiTabs.find(item => item.service === section && item.id === activeAiTabId) || aiTabs.find(item => item.service === section);
      if (target) toggleAiChatVisible(target.id);
      return;
    }
    if (section !== 'ai') { toggleGlobalPanel(section); return; }
    const currentAi = globalPanels.filter(panel => panel.section === 'ai');
    if (currentAi.length) {
      const remaining = globalPanels.filter(panel => panel.section !== 'ai');
      setGlobalPanels(remaining);
      setVisibleAiTabIds([activeAiTab.id]);
      const last = remaining.at(-1); setTab(last?.section === 'ai' ? (aiTabs.find(item => item.id === last.sub)?.service || 'gpt-personal') : (last?.section || 'gpt-personal'));
    } else { toggleGlobalPanel('ai', activeAiTab.id); setVisibleAiTabIds([activeAiTab.id]); }
    setViewError(null); setLayoutKey(n => n + 1);
  }
  function focusDocumentsSlot(slot) { commitPanels([{section:'documents',slot}], {section:'documents',slot}); }
  function toggleDocumentsSlot(slot) {
    const exists = globalPanels.some(p => p.section === 'documents' && p.slot === slot);
    if (!exists) { requestPanel({section:'documents',slot}); return; }
    const next = globalPanels.filter(p => !(p.section === 'documents' && p.slot === slot));
    if (next.length) commitPanels(next);
  }
  function addDocumentsPanel() {
    if (documentTabCount >= 20) { window.alert('Documentos admite hasta veinte subpestañas.'); return; }
    const slot = documentTabCount;
    const source = splitDocs[activeDocumentSlot];
    setSplitDocs(current => current.map((doc,i) => i === slot && !doc.folder ? { ...doc, folder: source.folder || folder, stack: [...source.stack], expanded: [...(source.expanded || [])], entries: [], selectedPaths: [], selectionAnchor: '' } : doc));
    setDocumentTabCount(slot + 1);
    setDocumentTabOrder(current => [...current, slot]);
    toggleDocumentsSlot(slot);
  }
  function closeDocumentsPanel(slot) { toggleDocumentsSlot(slot); }
  function moveDocumentTab(source, target, after) {
    if (source === target) return;
    const order = documentTabOrder.filter(slot => slot !== source);
    const index = order.indexOf(target);
    if (index < 0) return;
    order.splice(index + (after ? 1 : 0), 0, source);
    setDocumentTabOrder(order);
    setGlobalPanels(current => orderDocumentPanels(current, order));
    setLayoutKey(n => n + 1);
  }
  function renameDocumentsSlot(slot) {
    setFolderDialog({ mode: 'rename-doc-tab', slot, name: splitDocs[slot].name });
  }
  function focusAiChat(id) {
    const item = aiTabs.find(chat => chat.id === id);
    setActiveAiTabId(id);
    setVisibleAiTabIds([id]);
    setAiDialogError('');
    setGlobalPanels([{ section: 'ai', sub: id }]);
    setTab(item?.service || 'gpt-personal');
    setViewError(null);
  }
  function focusMessageApp(id) {
    setActiveMessageId(id);
    setVisibleMessageIds([id]);
    setGlobalPanels([{ section: 'messaging' }]);
    setTab('messaging');
    setViewError(null);
    setLayoutKey(n => n + 1);
  }
  function toggleMessageVisible(id) {
    const selected = visibleMessageIds;
    let next = selected;
    if (selected.includes(id)) {
      if (selected.length > 1) next = selected.filter(item => item !== id);
    } else if (selected.length < 3) next = [...selected, id];
    setVisibleMessageIds(next);
    setActiveMessageId(selected.includes(id) ? (next.includes(activeMessageId) ? activeMessageId : next[0]) : id);
    setGlobalPanels([{ section: 'messaging' }]);
    setTab('messaging');
    setViewError(null);
    setLayoutKey(n => n + 1);
  }
  function toggleAiChatVisible(id) {
    const panels = currentPanels();
    const exists = panels.some(p => p.section === 'ai' && p.sub === id);
    if (exists) commitPanels(panels.filter(p => !(p.section === 'ai' && p.sub === id)));
    else requestPanel({section:'ai',sub:id});
  }
  function openAiChatDialog() {
    const app = AI_APPS.find(item => item.id === tab) || AI_APPS[0];
    setAiDialogError('');
    setAiChatDialog({ service: app.id, name: `${app.short} ${aiTabs.filter(item => item.service === app.id).length + 1}`, url: '' });
  }
  function createAiChat(event) {
    event?.preventDefault();
    if (!aiChatDialog) return;
    const app = AI_APPS.find(item => item.id === aiChatDialog.service) || AI_APPS[0];
    if (aiTabs.filter(item => item.service === app.id).length >= 4) { setAiDialogError('Esta IA ya tiene cuatro subpestañas abiertas. Cerrá una para agregar otra.'); return; }
    const inputUrl = aiChatDialog.url.trim();
    const url = inputUrl || (app.id === 'ia-nico' ? 'https://portal-colegas.vercel.app/login' : app.id === 'gemini-personal' ? 'https://gemini.google.com/app?hl=es-419' : 'https://chatgpt.com/');
    try {
      const parsed = new URL(url);
      const allowedHost = app.id === 'ia-nico' ? parsed.hostname === 'portal-colegas.vercel.app' : app.id === 'gemini-personal' ? parsed.hostname === 'gemini.google.com' : parsed.hostname === 'chatgpt.com';
      if (parsed.protocol !== 'https:' || !allowedHost) throw new Error();
    } catch { setAiDialogError(app.id === 'ia-nico' ? 'Usá un enlace HTTPS de portal-colegas.vercel.app.' : app.id === 'gemini-personal' ? 'Usá un enlace HTTPS de gemini.google.com.' : 'Usá un enlace HTTPS de chatgpt.com.'); return; }
    const id = `chat-${Date.now()}-${Math.random().toString(36).slice(2,7)}`;
    const name = aiChatDialog.name.trim() || `${app.short} ${aiTabs.filter(item => item.service === app.id).length + 1}`;
    const item = { id, service: app.id, name, url, customName: true };
    setAiTabs(current => [...current, item]);
    setAiChatDialog(null);
    focusAiChat(id);
    setTab(app.id);
  }
  function renameAiChat(item) {
    const name = window.prompt('Nombre de esta subpestaña', item.name);
    if (name?.trim()) setAiTabs(current => current.map(candidate => candidate.id === item.id ? { ...candidate, name: name.trim(), customName: true } : candidate));
  }
  function reorderAiChatTabs(sourceId, targetId, insertAfter) {
    if (!sourceId || !targetId || sourceId === targetId) return;
    setAiTabs(current => {
      const sourceIndex = current.findIndex(item => item.id === sourceId);
      const targetIndex = current.findIndex(item => item.id === targetId);
      if (sourceIndex < 0 || targetIndex < 0) return current;
      if (current[sourceIndex].service !== current[targetIndex].service) return current;
      const reordered = [...current];
      const [moved] = reordered.splice(sourceIndex, 1);
      let destination = reordered.findIndex(item => item.id === targetId);
      if (destination < 0) return current;
      if (insertAfter) destination++;
      reordered.splice(destination, 0, moved);
      return reordered;
    });
  }
  function closeAiChat(item) {
    const providerTabs = aiTabs.filter(candidate => candidate.service === item.service);
    if (providerTabs.length === 1) {
      const replacement = { ...(DEFAULT_AI_WORKSPACE.find(candidate => candidate.service === item.service) || DEFAULT_AI_WORKSPACE[0]), id: `chat-${Date.now()}-${item.service}` };
      window.workhub2?.closeAiView(aiViewId(item));
      setActiveAiTabId(replacement.id); setVisibleAiTabIds([replacement.id]);
      setAiTabs(current => [...current.filter(candidate => candidate.id !== item.id), replacement]);
      setGlobalPanels(current => current.map(pane => pane.section === 'ai' && pane.sub === item.id ? { ...pane, sub: replacement.id } : pane));
      return;
    }
    const next = aiTabs.filter(candidate => candidate.id !== item.id);
    const fallback = next.find(candidate => candidate.service === item.service) || next[0];
    window.workhub2?.closeAiView(aiViewId(item));
    setAiTabs(next);
    setActiveAiTabId(current => current === item.id ? fallback.id : current);
    setVisibleAiTabIds(current => {
      const remaining = current.filter(id => id !== item.id && next.some(candidate => candidate.id === id));
      return remaining;
    });
    setGlobalPanels(current => current.map(pane => pane.section === 'ai' && pane.sub === item.id ? { ...pane, sub: fallback.id } : pane));
  }
  async function connectGoogle(destination) {
    const viewId = aiViewId(providerActiveAiTab);
    setViewError(null);
    const result = await window.workhub2?.googleConnection(viewId, destination);
    if (result?.ok === false) setViewError({ id: 'Gemini Personal', viewId, code: 'GOOGLE_LOGIN', desc: result.error });
  }
  async function reloadPanel(viewId, login = false) {
    setViewError(null);
    const result = await window.workhub2?.reloadView(viewId, login);
    if (result && !result.ok) window.alert('No se pudo cargar el panel: ' + result.error);
  }
  function refreshVisible() {
    setViewError(null);
    (mixedGlobalPanels ? globalViewIds.filter(Boolean) : viewIds).forEach(id => reloadPanel(id));
    setLayoutKey(n => n + 1);
  }
  function formatSize(size) {
    if (size == null) return '';
    if (size < 1024) return `${size} B`;
    if (size < 1024 * 1024) return `${(size/1024).toFixed(0)} KB`;
    return `${(size/1024/1024).toFixed(1)} MB`;
  }
  function iconFor(item) {
    if (item.directory) return Folder;
    const ext = item.name.split('.').pop().toLowerCase();
    if (['png','jpg','jpeg','gif','webp','svg'].includes(ext)) return Image;
    if (['doc','docx','txt','pdf','md'].includes(ext)) return FileText;
    if (['xls','xlsx','csv'].includes(ext)) return Table2;
    if (['mp4','mov','mkv'].includes(ext)) return Film;
    return FileIcon;
  }
  const currentFolder = folderStack.at(-1) || folder;
  const currentTab = TABS.find(t => t.id === tab);
  const CurrentIcon = currentTab?.icon || PanelsTopLeft;
  function renderDocumentsPane(paneIndex = null) {
    const doc = paneIndex === null ? null : splitDocs[paneIndex];
    const activeFolder = doc ? (doc.stack.at(-1) || doc.folder || folder) : currentFolder;
    const activeStack = doc ? doc.stack : folderStack;
    const activeEntries = doc ? doc.entries : entries;
    const activeFilter = doc ? doc.filter : filter;
    const selected = doc ? (doc.selectedPaths || []) : selectedPaths;
    const anchor = doc ? (doc.selectionAnchor || '') : selectionAnchor;
    const visibleEntries = activeEntries.filter(item => item.name.toLowerCase().includes(activeFilter.toLowerCase()));
    const setActiveStack = updater => {
      if (paneIndex === null) { setFolderStack(updater); setSelectedPaths([]); setSelectionAnchor(''); }
      else setSplitDocs(current => current.map((item, i) => i === paneIndex ? { ...item, stack: typeof updater === 'function' ? updater(item.stack) : updater, selectedPaths: [], selectionAnchor: '' } : item));
    };
    const setActiveEntries = updater => paneIndex === null ? setEntries(updater) : setSplitDocs(current => current.map((item, i) => i === paneIndex ? { ...item, entries: typeof updater === 'function' ? updater(item.entries) : updater } : item));
    const setActiveFilter = value => { paneIndex === null ? (setFilter(value), setSelectedPaths([]), setSelectionAnchor('')) : updateSplitDoc(paneIndex, { filter: value, selectedPaths: [], selectionAnchor: '' }); };
    const setSelection = (paths, nextAnchor = anchor) => paneIndex === null ? (setSelectedPaths(paths), setSelectionAnchor(nextAnchor)) : updateSplitDoc(paneIndex, { selectedPaths: paths, selectionAnchor: nextAnchor });
    const folderPicker = () => pickFolder(paneIndex);
    const refreshFolder = () => window.workhub2.listFolder(activeFolder).then(items => { setActiveEntries(items); setDocumentTreeRevision(n => n + 1); });
    const changeFolder = path => { setActiveStack(stack => [...stack, path]); };
    const goBack = () => setActiveStack(stack => stack.slice(0, -1));
    const goToProjects = () => {
      setActiveStack([]);
      setActiveFilter('');
      setSelection([],'');
    };
    const selectedItems = () => visibleEntries.filter(item => selected.includes(item.path));
    const displayFolder = (() => {
      if (!activeFolder.startsWith('zip://')) return activeFolder;
      const marker = activeFolder.indexOf('!/');
      if (marker < 0) return activeFolder;
      try {
        const archivePath = decodeURIComponent(activeFolder.slice(6, marker));
        const inner = activeFolder.slice(marker + 2).split('/').filter(Boolean).map(part => decodeURIComponent(part)).join('\\');
        return inner ? `${archivePath}  ›  ${inner}` : `${archivePath}  ›  (ZIP)`;
      } catch { return activeFolder; }
    })();
    const handleSelect = (event, item) => {
      const current = selected;
      if (event.shiftKey && anchor) {
        const from = visibleEntries.findIndex(entry => entry.path === anchor);
        const to = visibleEntries.findIndex(entry => entry.path === item.path);
        if (from >= 0 && to >= 0) {
          const range = visibleEntries.slice(Math.min(from, to), Math.max(from, to) + 1).map(entry => entry.path);
          setSelection(event.ctrlKey || event.metaKey ? [...new Set([...current, ...range])] : range, anchor);
        } else setSelection([item.path], item.path);
      } else if (event.ctrlKey || event.metaKey) {
        const next = current.includes(item.path) ? current.filter(value => value !== item.path) : [...current, item.path];
        setSelection(next, item.path);
      } else setSelection([item.path], item.path);
      event.currentTarget.focus();
    };
    const openDocument = async item => {
      if (item.directory) { changeFolder(item.path); return; }
      if (imageFile(item)) {
        const result = await window.workhub2.openImageComparison(item.path);
        if (!result?.ok) setDocumentStatus(result?.error || 'No pude abrir la imagen.');
      } else window.workhub2.openFile(item.path);
    };
    const handleDocumentKeys = event => {
      if (event.key === 'F5') {
        event.preventDefault(); event.stopPropagation();
        if (!event.repeat && activeFolder) {
          event.currentTarget.focus({preventScroll:true});
          refreshFolder().catch(error => setDocumentStatus(error.message || 'No se pudo actualizar la carpeta.'));
        }
        return;
      }
      if (event.target.closest?.('.file-sidebar')) return;
      if ((event.target instanceof HTMLInputElement) || (event.target instanceof HTMLTextAreaElement)) return;
      const modifier = event.ctrlKey || event.metaKey;
      if (modifier && event.shiftKey && event.key.toLowerCase() === 'n') {
        event.preventDefault(); setFolderDialog({ mode: 'create-document', name: 'Nueva carpeta', parent: activeFolder, paneIndex });
      } else if (modifier && event.key.toLowerCase() === 'a') {
        event.preventDefault(); setSelection(visibleEntries.map(item => item.path), visibleEntries[0]?.path || '');
      } else if (modifier && ['c','x'].includes(event.key.toLowerCase())) {
        event.preventDefault(); copyDocumentSelection(selectedItems(), event.key.toLowerCase() === 'x' ? 'move' : 'copy');
      } else if (modifier && event.key.toLowerCase() === 'v') {
        event.preventDefault(); pasteDocumentItems(activeFolder);
      } else if (event.key === 'F2' && selected.length === 1) {
        event.preventDefault(); beginDocumentRename(visibleEntries.find(item => item.path === selected[0]));
      } else if (event.key === 'Delete') {
        event.preventDefault(); deleteDocumentSelection(selectedItems());
      } else if (event.key === 'Enter' && selected.length > 0) {
        event.preventDefault(); event.stopPropagation();
        if (event.repeat) return;
        const items = selectedItems();
        const toOpen = items.length === 1 ? items : items.filter(imageFile);
        void (async () => { for (const item of toOpen) await openDocument(item); })();
      }
    };
    const onDropOver = event => {
      const types = [...(event.dataTransfer?.types || [])];
      if (event.dataTransfer?.files?.length || types.includes('Files') || types.includes('application/x-workhub2-files')) {
        event.preventDefault();
        event.dataTransfer.dropEffect = event.ctrlKey ? 'copy' : 'move';
      }
    };
    const externalDragStart = (event, item) => {
      event.preventDefault(); event.stopPropagation();
      const items = selected.includes(item.path) ? selectedItems() : [item];
      if (!selected.includes(item.path)) setSelection([item.path], item.path);
      if (items.some(entry => (entry.directory && !entry.archive) || entry.path.startsWith('zip://'))) {
        setDocumentStatus('Para adjuntar afuera, seleccioná archivos normales. Extraé primero los archivos de un ZIP.');
        return;
      }
      window.workhub2.startExternalFileDrag(items.map(entry => entry.path));
    };
    const documentDragStart = (event, item) => {
      const items = selected.includes(item.path) ? selectedItems() : [item];
      if (items.some(entry => entry.directory && !entry.archive)) rowDragStart(event, item);
      else if (documentDragMode === 'external' || event.altKey) externalDragStart(event, item);
      else rowDragStart(event, item);
    };
    const rowDragStart = (event, item) => {
      const items = selected.includes(item.path) ? selectedItems() : [item];
      if (!selected.includes(item.path)) setSelection([item.path], item.path);
      const payload = JSON.stringify(items.map(({ path, directory }) => ({ path, directory: Boolean(directory) })));
      event.dataTransfer.effectAllowed = 'copyMove';
      event.dataTransfer.setData('application/x-workhub2-files', `workhub2-files:${payload}`);
      event.dataTransfer.setData('text/plain', `workhub2-files:${payload}`);
      const hasAiDropTarget = globalPanels.some(panel => panel.section === 'ai' || panel.section === 'metadata');
      const canAttach = items.every(entry => !(entry.directory && !entry.archive) && !entry.path.startsWith('zip://'));
      if (hasAiDropTarget && canAttach) {
        try {
          const result = window.workhub2.beginAttachmentDrag(items.map(({ path }) => path));
          if (!result?.token) throw new Error(result?.error || 'No se pudo preparar el adjunto.');
          event.dataTransfer.setData('application/x-workhub2-attachment', result.token);
          setDocumentStatus('Soltá sobre otro panel de Documentos para mover, o sobre la página para adjuntar.');
        } catch (error) { setDocumentStatus(`El arrastre entre Documentos está disponible. ${error.message}`); }
      }
    };
    const showDocumentMenu = (event, item = null) => {
      event.preventDefault(); event.stopPropagation();
      const items = item ? (selected.includes(item.path) ? selectedItems() : [item]) : selectedItems();
      if (item && !selected.includes(item.path)) setSelection([item.path], item.path);
      setDocumentMenu({ x: Math.min(event.clientX, window.innerWidth - 230), y: Math.max(8, Math.min(event.clientY, window.innerHeight - 470)), items, folder: activeFolder, paneIndex });
    };
    return <div className="documents-page" tabIndex={0} onKeyDownCapture={handleDocumentKeys} onMouseDown={event => { if (!event.target.closest('input,button,[role="button"]')) event.currentTarget.focus({ preventScroll: true }); }} onContextMenu={showDocumentMenu}>
      <aside className="file-sidebar"><div className="side-overline">ESPACIO DE TRABAJO</div>{(doc?.folder || folder) ? <div className="document-folder-tree" role="tree" aria-label={`Carpetas de ${documentFolderName(doc?.folder || folder)}`}><DocumentFolderNode key={doc?.folder || folder} node={{path: doc?.folder || folder, name: documentFolderName(doc?.folder || folder)}} root ancestors={[]} active={activeFolder} expanded={doc?.expanded || [folder]} revision={documentTreeRevision} onToggle={path => updateSplitDoc(paneIndex, { expanded: (doc?.expanded || []).includes(path) ? doc.expanded.filter(p => p !== path) : [...(doc?.expanded || []), path] })} onNavigate={(path, chain) => { setActiveStack(chain.slice(1)); setActiveFilter(''); }}/></div> : <button className="side-selected" onClick={folderPicker}><FolderOpen size={17}/>Elegí una carpeta</button>}<div className="side-note"><HardDrive size={16}/><span>Carpeta principal de esta subpestaña</span></div></aside>
      <DocumentSelectionArea className="file-content" selected={selected} onSelectionChange={setSelection} selectionKey={`${paneIndex}:${activeFolder}:${activeFilter}:${documentViewMode}`} onDragOver={onDropOver} onDrop={event=>dropDocumentFiles(event,activeFolder)}>
        <div className="file-heading"><div><div className="breadcrumb">MI ESPACIO <span>/</span> DOCUMENTOS{isUpdatePath(activeFolder) && <><span>/</span> ACTUALIZACION</>}</div><h1>{isUpdatePath(activeFolder) ? 'Actualizaciones de DocsHub' : documentFolderName(activeFolder || doc?.folder || folder)}</h1><p>{isUpdatePath(activeFolder) ? 'Soltá aquí el ZIP del parche o guardalo en esta carpeta. Después elegí Aplicar y reiniciar.' : 'Explorá, seleccioná y organizá tus archivos.'}</p></div><button className="primary-button" onClick={folderPicker}><FolderOpen size={16}/>{(doc?.folder || folder) ? 'Cambiar carpeta' : 'Elegir carpeta'}</button></div>
        {!(doc?.folder || folder) ? <div className="empty-folder"><div className="empty-icon"><FolderOpen size={28}/></div><h2>Elegí tu carpeta de proyectos</h2><p>Cuando la crees, seleccionála acá. DocsHub recordará esta ubicación para la próxima vez.</p><button className="primary-button" onClick={folderPicker}>Seleccionar carpeta</button></div> : <>
          <div className="path-row"><button className="back-button" onClick={goBack} disabled={!activeStack.length}><ArrowLeft size={16}/></button><div className="path-text"><FolderOpen size={15}/><span title={displayFolder}>{displayFolder}</span></div><div className="searchbox"><Search size={15}/><input placeholder="Buscar en esta carpeta" value={activeFilter} onChange={e=>setActiveFilter(e.target.value)}/></div><span className="file-selection-count">{selected.length ? `${selected.length} seleccionados` : ''}</span><button className="icon-button" disabled={!selected.length} onClick={()=>copyDocumentSelection(selectedItems(),'copy')} title="Copiar (Ctrl+C)"><Copy size={15}/></button><button className="icon-button" disabled={!selected.length} onClick={()=>copyDocumentSelection(selectedItems(),'move')} title="Cortar (Ctrl+X)"><Scissors size={15}/></button><button className="icon-button" onClick={()=>pasteDocumentItems(activeFolder)} title="Pegar (Ctrl+V)"><ClipboardPaste size={15}/></button><button className="icon-button" onClick={refreshFolder} title="Actualizar (F5)"><RefreshCw size={15}/></button></div>
          {patchError && <div className="patch-error" role="alert">{patchError}</div>}
          <div className="document-view-tools"><span>Vista</span><button className={`text-button ${documentViewMode === 'previews' ? 'chosen' : ''}`} aria-pressed={documentViewMode === 'previews'} onClick={() => setDocumentViewMode('previews')}><Image size={14}/>Miniaturas</button><button className={`text-button ${documentViewMode === 'list' ? 'chosen' : ''}`} aria-pressed={documentViewMode === 'list'} onClick={() => setDocumentViewMode('list')}><FileText size={14}/>Lista</button>{documentViewMode === 'previews' && <label className="document-size-control">Tamaño<button type="button" aria-label="Achicar miniaturas" onClick={() => setDocumentThumbnailSize(size => Math.max(110, size - 20))}>−</button><input type="range" min="110" max="320" step="10" value={documentThumbnailSize} aria-label="Tamaño de las miniaturas" onChange={event => setDocumentThumbnailSize(Number(event.target.value))}/><button type="button" aria-label="Agrandar miniaturas" onClick={() => setDocumentThumbnailSize(size => Math.min(320, size + 20))}>+</button></label>}</div>
          <div className="document-drag-tools" role="group" aria-label="Destino del arrastre"><span>Arrastre</span><button className={`text-button ${documentDragMode === 'move' ? 'chosen' : ''}`} aria-pressed={documentDragMode === 'move'} onClick={() => setDocumentDragMode('move')}><FolderOpen size={14}/>Mover entre paneles</button><button className={`text-button ${documentDragMode === 'external' ? 'chosen' : ''}`} aria-pressed={documentDragMode === 'external'} onClick={() => setDocumentDragMode('external')}><ExternalLink size={14}/>Adjuntar afuera</button><button className="text-button" title="Cerrar todas las ventanas de fotos del comparador" onClick={() => window.workhub2.closeImageComparisons()}>× Cerrar fotos</button></div>
          <div className={`file-table ${documentViewMode === 'previews' ? 'document-preview-grid' : ''} ${isUpdatePath(activeFolder) ? 'is-update-folder' : ''}`} style={{'--doc-card-size': `${documentThumbnailSize}px`, '--doc-preview-height': `${Math.round(documentThumbnailSize * .74)}px`}} tabIndex={0} onClick={event=>{if(event.target===event.currentTarget)event.currentTarget.focus();}}>
            <div className="file-table-head"><span>Nombre</span><span>Tipo</span><span>{isUpdatePath(activeFolder)?'Acción':'Tamaño'}</span></div>
            {visibleEntries.map(item=>{const Icon=iconFor(item);const patchFile=isUpdatePath(activeFolder)&&!item.directory&&item.name.toLowerCase().endsWith('.zip');return <div className={`file-row ${selected.includes(item.path)?'selected':''}`} data-document-path={item.path} role="button" aria-selected={selected.includes(item.path)} tabIndex={0} draggable onDragStart={event=>documentDragStart(event,item)} onContextMenu={event=>showDocumentMenu(event,item)} onDragOver={onDropOver} onDrop={event=>{event.stopPropagation();dropDocumentFiles(event,item.directory && !item.archive ? item.path : activeFolder);}} key={item.path} onDoubleClick={()=>openDocument(item)} onClick={event=>handleSelect(event,item)} onKeyDown={event=>{if(event.key===' '){event.preventDefault();handleSelect({...event,ctrlKey:true,currentTarget:event.currentTarget},item);}}}><span className="file-name"><DocumentThumbnail item={item} externalMode={documentDragMode === 'external'} onDragStart={event => { event.stopPropagation(); documentDragStart(event,item); }} onExternalDrag={event => externalDragStart(event,item)}/><span className="document-file-label" title={item.name}>{item.name}</span></span><span>{item.directory?'Carpeta':item.name.split('.').pop().toUpperCase()}</span><span>{patchFile?<button className="patch-apply-button" disabled={patchBusy} onClick={event=>{event.stopPropagation();applyPatch(item.path);}}>Aplicar y reiniciar</button>:item.directory?'—':formatSize(item.size)}</span></div>;})}
            {visibleEntries.length===0&&<div className="no-files">{isUpdatePath(activeFolder)?'Soltá aquí el ZIP de actualización.':'Esta carpeta está vacía.'}</div>}
          </div>
          <div className="document-status" role="status">{documentStatus}</div><div className="file-footnote">Elegí el destino del arrastre arriba: Mover entre paneles o Adjuntar afuera. Alt + arrastrar permite adjuntar afuera sin cambiar el modo. Ctrl permite copiar entre Documentos. Doble clic en una imagen abre el comparador. Arrastrá desde un espacio vacío para seleccionar varios archivos. Ctrl o Shift también selecciona varios; Ctrl+C, Ctrl+X y Ctrl+V siguen disponibles.</div>
        </>}
      </DocumentSelectionArea>
    </div>;
  }

  return <div className="app-shell" data-theme={theme}>
    <header className="chrome">
      <div className="titlebar">
        <div className="brand"><img className="docshub-brand-icon" src="./assets/docshub.svg" alt=""/><span>Docs<span className="brand-light">Hub</span></span><span className="private-chip"><ShieldCheck size={12}/> PRIVADO</span></div>
        <div className="titlebar-actions">
          {inDesktop && <button className="desktop-update-button" onClick={installDesktopPatch} disabled={updating} title="Instalar un parche ZIP de DocsHub"><RefreshCw size={13}/><span>{updating ? 'Abriendo…' : 'Actualizar programa'}</span></button>}
          <button className="theme-toggle" onClick={() => setTheme(value => value === 'dark' ? 'light' : 'dark')} aria-label={`Cambiar a modo ${theme === 'dark' ? 'claro' : 'oscuro'}`} title={`Cambiar a modo ${theme === 'dark' ? 'claro' : 'oscuro'}`}>{theme === 'dark' ? <Moon size={13}/> : <Sun size={13}/>}<span>{theme === 'dark' ? 'Dark' : 'Light'}</span></button>
          <div className="window-controls"><button aria-label="Minimizar" onClick={() => window.workhub2?.windowControl('minimize')}>−</button><button aria-label="Maximizar" onClick={() => window.workhub2?.windowControl('maximize')}>□</button><button className="close-window" aria-label="Cerrar" onClick={() => window.workhub2?.windowControl('close')}>×</button></div>
        </div>
      </div>
      <nav className="tabs" aria-label="Secciones" onDragOver={event => event.preventDefault()} onDrop={event => handleNavDrop('end', '', event)} onContextMenu={event => { if (event.target === event.currentTarget) { event.preventDefault(); createEmptyFolder(); } }}>
        {navItems.flatMap(item => item.type === 'tab' ? [{ type: 'tab', id: item.id }] : [{ type: 'folder', id: item.id, name: item.name, open: item.open, children: item.children }, ...(item.open ? item.children.map(id => ({ type: 'tab', id, parent: item.id })) : [])]).map(node => {
          if (node.type === 'folder') return <button key={node.id} type="button" draggable className={`tab folder-tab ${node.open ? 'folder-open' : ''} ${node.children?.some(id => id === tab) ? 'contains-active' : ''}`} onClick={() => handleTabContext('toggle', navItems.find(item => item.type === 'folder' && item.id === node.id))} onContextMenu={event => openTabContext(event, { type: 'folder', ...node })} onDragStart={event => startNavDrag('folder', node.id, event)} onDragOver={event => event.preventDefault()} onDrop={event => handleNavDrop('folder', node.id, event)} onDragEnd={() => setDraggedItem(null)} title={`${node.name} · clic para abrir/cerrar · clic derecho para opciones`}><Folder size={16}/><span>{node.name}</span><ChevronDown size={12} className="folder-chevron"/></button>;
          const item = TABS.find(entry => entry.id === node.id); if (!item) return null; const Icon = item.icon; const shownName = tabName(item.id);
          const checked = isAiProvider(item.id)
            ? (globalPanels.some(panel => panel.section !== 'ai')
              ? globalPanels.some(panel => panel.section === 'ai' && aiTabs.find(chat => chat.id === panel.sub)?.service === item.id)
              : selectedAiTabs.some(chat => chat.service === item.id))
            : globalPanels.some(panel => panel.section === item.id);
          return <div key={item.id} className={`tab-entry ${node.parent ? 'nested-entry' : ''}`}>
            <button type="button" draggable className={`tab ${tab === item.id ? 'active' : ''} ${node.parent ? 'nested-tab' : ''}`} onClick={() => selectTab(item.id)} onContextMenu={event => openTabContext(event, { type: 'tab', id: item.id })} onDragStart={event => startNavDrag('tab', item.id, event)} onDragOver={event => event.preventDefault()} onDrop={event => handleNavDrop('tab', item.id, event)} onDragEnd={() => setDraggedItem(null)} title={`${shownName}${node.parent ? ' · en carpeta' : ''} · clic para abrir · clic derecho para cambiar el nombre`}><Icon size={16} strokeWidth={2}/><span>{shownName}</span>{tab === item.id && <i/>}</button>
            <button type="button" className={`tab-check ${checked ? 'checked' : ''}`} aria-label={`${checked ? 'Quitar' : 'Agregar'} ${shownName} ${checked ? 'de' : 'a'} la vista`} aria-pressed={checked} title={`${checked ? 'Quitar' : 'Agregar'} ${shownName} ${checked ? 'de' : 'a'} la vista dividida`} onClick={() => toggleNavPanel(item.id)}>{checked ? '✓' : ''}</button>
            {item.id === 'documents' && checked && <button type="button" className="tab-check tab-add-view" aria-label="Agregar otra vista de Documentos" title="Agregar otra vista de Documentos" onClick={addDocumentsPanel}><Plus size={11}/></button>}
          </div>;
        })}
        <button className="add-tab" title="Crear carpeta" onClick={createEmptyFolder}><FolderPlus size={16}/></button>
        <div className="tabbar-utilities">
          {inDesktop && <span className="session-status"><span/> Sesiones guardadas en este equipo</span>}
          <button className="icon-button" title="Recargar páginas visibles" onClick={refreshVisible}><RefreshCw size={15}/></button>
        </div>
      </nav>
      {tabContext && <div className="tab-context-backdrop" onClick={() => setTabContext(null)} onContextMenu={event => { event.preventDefault(); setTabContext(null); }}><div className="tab-context-menu" style={{ left: tabContext.x, top: tabContext.y, maxHeight: tabContext.maxHeight }} onClick={event => event.stopPropagation()}>
        <button onClick={() => handleTabContext('rename', tabContext.target)}><Pencil size={14}/>Cambiar nombre</button>
        {tabContext.target.type === 'folder' ? <button onClick={() => handleTabContext('delete', tabContext.target)}><Trash2 size={14}/>Eliminar carpeta y dejar pestañas afuera</button> : tabContext.target.type === 'tab' ? <><button onClick={() => handleTabContext('create', tabContext.target)}><FolderPlus size={14}/>Crear carpeta con esta pestaña</button>{navItems.filter(item => item.type === 'folder').map(group => <button key={group.id} onClick={() => handleTabContext(`move:${group.id}`, tabContext.target)}><Folder size={14}/>Mover a {group.name}</button>)}{navItems.some(item => item.type === 'folder' && item.children.includes(tabContext.target.id)) && <button onClick={() => handleTabContext('ungroup', tabContext.target)}><ExternalLink size={14}/>Sacar de la carpeta</button>}</> : null}
      </div></div>}
      {(tab === 'documents' || globalPanels.some(p => p.section === 'documents')) && <div className="document-subtabs ai-chat-tabs" role="group" aria-label="Subpestañas de Documentos">{documentTabOrder.map(slot => { const doc = splitDocs[slot]; const checked = globalPanels.some(p => p.section === 'documents' && p.slot === slot); return <div className={`ai-chat-tab ${slot === activeDocumentSlot ? 'active' : ''}`} key={slot} draggable onDragStart={e => { draggedDocumentSlot.current = slot; e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('application/x-docshub-doc-tab', String(slot)); }} onDragEnd={() => { draggedDocumentSlot.current = null; }} onDragOver={e => { if (draggedDocumentSlot.current !== null) { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; } }} onDrop={e => { if (draggedDocumentSlot.current === null) return; e.preventDefault(); e.stopPropagation(); const box = e.currentTarget.getBoundingClientRect(); moveDocumentTab(draggedDocumentSlot.current, slot, e.clientX > box.left + box.width / 2); draggedDocumentSlot.current = null; }} onContextMenu={e => { e.preventDefault(); renameDocumentsSlot(slot); }}><button className={`tab-check ${checked ? 'checked' : ''}`} aria-label={`${checked ? 'Ocultar' : 'Mostrar'} ${doc.name}`} aria-pressed={checked} onClick={() => toggleDocumentsSlot(slot)}>{checked ? '✓' : ''}</button><button className="ai-chat-title" onClick={() => focusDocumentsSlot(slot)} onDoubleClick={() => renameDocumentsSlot(slot)} title={`${doc.name} · Clic para enfocar; arrastrá para ordenar`}>{doc.name}</button><button className="icon-button" aria-label={`Renombrar ${doc.name}`} title="Cambiar nombre de la subpestaña" onClick={() => renameDocumentsSlot(slot)}><Pencil size={12}/></button></div>; })}<button className="ai-add-chat" disabled={documentTabCount >= 20} onClick={addDocumentsPanel} aria-label="Crear subpestaña de Documentos"><Plus size={12}/>Agregar</button><span>{documentTabCount}/20 · {globalPanels.length}/3 visibles</span></div>}
      {(tab === 'metadata' || globalPanels.some(p => p.section === 'metadata')) && <div className="metadata-toolbar"><label>Página<input aria-label="Página de Metadatos" value={metadataDraft} onChange={e => setMetadataDraft(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') applyMetadataUrl(); }}/></label><button className="text-button" onClick={applyMetadataUrl}>Cargar</button><label className="metadata-destination" title={metadataDestination}>Guardar en<span>{metadataDestination || 'Descargas'}</span></label><button className="text-button" onClick={async () => { const folder = await window.workhub2.pickMetadataDestination(); if (folder) { setMetadataDestination(folder); setMetadataStatus(''); } }}>Elegir carpeta</button><button className="text-button" onClick={async () => { setMetadataDestination(await window.workhub2.metadataUseDownloads()); setMetadataStatus(''); }}>Descargas</button>{metadataStatus && <span className="metadata-status" role="status" title={metadataStatus}>{metadataStatus}</span>}</div>}
      {viewError && <div className="error-banner" role="alert"><span>No se pudo cargar {aiTabs.find(item => aiViewId(item) === viewError.viewId)?.name || viewError.id || 'la página'} ({viewError.code}). {viewError.desc || ''}</span>{viewError.viewId && <button onClick={() => window.workhub2.reloadView(viewError.viewId)}>Reintentar</button>}<button aria-label="Cerrar aviso de error" onClick={() => setViewError(null)}>×</button></div>}
    </header>

    {panelReplacement && createPortal(<div className="folder-dialog-backdrop" onMouseDown={e => { if(e.target===e.currentTarget)setPanelReplacement(null); }}><div className="folder-dialog panel-replacement-dialog" role="dialog" aria-modal="true" aria-label="Reemplazar un panel" onKeyDown={e => { if(e.key==='Escape')setPanelReplacement(null); }}><strong>Ya tenés tres paneles abiertos</strong><p>¿Cuál querés cerrar para abrir {panelName(panelReplacement.target)}?</p>{panelReplacement.panels.map((panel,index) => <button autoFocus={index===0} className="text-button" key={index} onClick={() => replacePanel(index)}>{index+1} · {panelName(panel)}</button>)}<button className="text-button" onClick={() => setPanelReplacement(null)}>Cancelar</button></div></div>, document.body)}
    {folderDialog && createPortal(<div className={`folder-dialog-backdrop ${folderDialog.mode === 'rename-document' ? '' : 'header-dialog-backdrop'}`} style={folderDialog.mode === 'rename-document' ? undefined : {height:headerPopupHeight()}} onMouseDown={event => { if (event.target === event.currentTarget && !folderDialog.busy) setFolderDialog(null); }}><form className={`folder-dialog ${folderDialog.mode === 'rename-document' ? 'document-rename-dialog' : 'header-folder-dialog'}`} role="dialog" aria-modal="true" onSubmit={event => { event.preventDefault(); submitFolderDialog(); }}><label htmlFor="folder-name">{folderDialog.mode.startsWith('rename') ? 'Cambiar nombre' : 'Crear carpeta'}</label><input id="folder-name" autoFocus maxLength={folderDialog.mode === 'rename-document' ? 240 : 40} disabled={folderDialog.busy} value={folderDialog.name} onFocus={event => { if (folderDialog.mode === 'rename-document') event.target.select(); }} onChange={event => setFolderDialog({ ...folderDialog, name: event.target.value })} onKeyDown={event => { event.stopPropagation(); if (event.key === 'Escape' && !folderDialog.busy) setFolderDialog(null); }} />{folderDialog.mode === 'rename-document' && <span className="rename-extension">{folderDialog.directory ? 'Se cambia el nombre de la carpeta, conservando su contenido.' : `La extensión se conserva: ${folderDialog.extension || '(sin extensión)'}`}</span>}{folderDialog.error && <span className="rename-error" role="alert">{folderDialog.error}</span>}<div><button type="button" disabled={folderDialog.busy} onClick={() => setFolderDialog(null)}>Cancelar</button><button type="submit" disabled={!folderDialog.name.trim() || folderDialog.busy}>{folderDialog.mode.startsWith('rename') ? 'Guardar' : 'Crear'}</button></div></form></div>, document.body)}

    {aiChatDialog && createPortal(<div className="folder-dialog-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) setAiChatDialog(null); }}><form className="folder-dialog ai-chat-dialog" onSubmit={createAiChat}>
      <label>Agregar subpestaña de IA</label>
      <span className="ai-dialog-caption">Se agregará dentro de {AI_APPS.find(app => app.id === aiChatDialog.service)?.short}. Cada subpestaña conserva su propio chat y navegación. Máximo cuatro por IA.</span>
      <input autoFocus maxLength={50} value={aiChatDialog.name} onChange={event => setAiChatDialog(current => ({ ...current, name: event.target.value }))} placeholder="Nombre, por ejemplo: Proyecto" aria-label="Nombre de la subpestaña" />
      <input value={aiChatDialog.url} onChange={event => setAiChatDialog(current => ({ ...current, url: event.target.value }))} placeholder="Enlace de un chat/proyecto existente (opcional)" aria-label="Enlace de chat existente" />
      <span className="ai-dialog-caption">Sin enlace abre una vista nueva. Para un proyecto, podés abrirlo desde la barra lateral de la IA y DocsHub conservará la última dirección usada.</span>
      {aiDialogError && <span className="ai-dialog-error" role="alert">{aiDialogError}</span>}
      <div><button type="button" onClick={() => setAiChatDialog(null)}>Cancelar</button><button type="submit">Abrir subpestaña</button></div>
    </form></div>, document.body)}

    {documentMenu && createPortal(<div className="document-menu-backdrop" onMouseDown={() => setDocumentMenu(null)} onContextMenu={event => { event.preventDefault(); setDocumentMenu(null); }}><div className="document-menu" role="menu" style={{left:documentMenu.x,top:documentMenu.y}} onMouseDown={event=>event.stopPropagation()}>
      <button role="menuitem" disabled={documentMenu.folder.startsWith('zip://')} onClick={()=>{setFolderDialog({mode:'create-document',name:'Nueva carpeta',parent:documentMenu.folder,paneIndex:documentMenu.paneIndex});setDocumentMenu(null);}}>Nueva carpeta <span>Ctrl+Mayús+N</span></button>
      <div className="document-menu-separator"/>
      <button role="menuitem" disabled={documentMenu.items.length !== 1 || documentMenu.items[0]?.path.startsWith('zip://')} onClick={() => beginDocumentRename(documentMenu.items[0])}>Cambiar nombre <span>F2</span></button>
      <button role="menuitem" onClick={() => { setDocumentMenu(null); void undoDocumentOperation(); }}>Deshacer <span>Ctrl+Z</span></button>
      {documentMenu.items.length === 1 && documentMenu.items[0].archive && !documentMenu.items[0].path.startsWith('zip://') && <><button role="menuitem" onClick={() => extractDocumentZip(documentMenu.items[0].path, false)}>Extraer aquí</button><button role="menuitem" onClick={() => extractDocumentZip(documentMenu.items[0].path, true)}>Extraer en otra carpeta…</button></>}
      {documentMenu.items.length === 1 && !documentMenu.items[0].directory && !documentMenu.items[0].path.startsWith('zip://') && /\.(mp4|mov|m4v|webm|avi|mkv|wmv|mpg|mpeg|mts|m2ts|3gp|ogv)$/i.test(documentMenu.items[0].name) && <div className="document-edit-menu"><span>Editar / abrir video con</span><button role="menuitem" onClick={() => editVideoVlc(documentMenu.items[0].path)}>VLC media player</button><button role="menuitem" onClick={() => editVideoClipchamp(documentMenu.items[0].path)}>Clipchamp</button></div>}
      {documentMenu.items.length === 1 && !documentMenu.items[0].directory && !documentMenu.items[0].path.startsWith('zip://') && /\.(png|jpe?g|webp|gif|bmp|avif|tiff?)$/i.test(documentMenu.items[0].name) && <div className="document-edit-menu"><span>Editar con</span><button role="menuitem" onClick={() => editDocument(documentMenu.items[0].path,'paint')}>Paint</button><button role="menuitem" onClick={() => editDocument(documentMenu.items[0].path,'fireworks')}>Fireworks 8</button><button role="menuitem" onClick={() => editDocument(documentMenu.items[0].path,'photos')}>Fotos / Editor de Windows</button></div>}
      {documentMenu.items.length === 1 && documentEdits.some(edit => edit.original === documentMenu.items[0].path) && <button role="menuitem" onClick={() => { const edit = documentEdits.find(edit => edit.original === documentMenu.items[0].path); setDocumentMenu(null); saveDocumentEdit(edit.id,true); }}>Importar imagen de «Guardar como»…</button>}
      <button role="menuitem" disabled={!documentMenu.items.length} onClick={()=>{copyDocumentSelection(documentMenu.items,'copy');setDocumentMenu(null);}}>Copiar <span>Ctrl+C</span></button>
      <button role="menuitem" disabled={!documentMenu.items.length} onClick={()=>{copyDocumentSelection(documentMenu.items,'move');setDocumentMenu(null);}}>Cortar <span>Ctrl+X</span></button>
      <button role="menuitem" onClick={()=>{pasteDocumentItems(documentMenu.folder);setDocumentMenu(null);}}>Pegar <span>Ctrl+V</span></button>
      <button role="menuitem" disabled={!documentMenu.items.length || documentMenu.items.some(item=>item.path.startsWith('zip://'))} onClick={()=>{deleteDocumentSelection(documentMenu.items);setDocumentMenu(null);}}>Eliminar <span>Supr · Papelera</span></button>
    </div></div>,document.body)}
    {mixedGlobalPanels ? <>
      <section className="global-layout-bar"><span>{globalPanels.length} paneles seleccionados</span>{globalPanels.map((panel, panelIndex) => panel.section === 'ai' && <label key={`ai-choice-${panelIndex}`}>Chat IA {globalPanels.filter(item => item.section === 'ai').length > 1 ? globalPanels.filter(item => item.section === 'ai').findIndex(item => item === panel) + 1 : ''}<select value={panel.sub || activeAiTab.id} onChange={event => { const id = event.target.value; const chat = aiTabs.find(item => item.id === id); setGlobalPanels(current => current.map((item, index) => index === panelIndex ? { ...item, sub: id } : item)); setActiveAiTabId(id); if (chat) setTab(chat.service); }} aria-label={`Chat de IA en el panel ${panelIndex + 1}`}>{aiTabs.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>)}{globalPanels.some(panel => panel.section === 'ai') && <label className="add-ai-panel">Agregar chat IA<select value={activeAiTab.id} onChange={event => { setActiveAiTabId(event.target.value); const chat = aiTabs.find(item => item.id === event.target.value); if (chat) setTab(chat.service); }} aria-label="Elegir chat de IA para agregar">{aiTabs.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select><button type="button" disabled={globalPanels.some(panel => panel.section === 'ai' && panel.sub === activeAiTab.id)} onClick={() => toggleAiChatVisible(activeAiTab.id)} aria-label="Agregar chat de IA seleccionado" title="Agregar este chat como otro panel"><Plus size={14}/></button></label>}{globalPanels.some(panel => panel.section === 'microinfluencers') && <div className="micro-url-controls"><input aria-label="Enlace de vista previa de Microinfluencers" value={microUrlDraft} onChange={event => setMicroUrlDraft(event.target.value)} onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); applyMicroUrl(); } }} placeholder="Pegá el enlace de vista previa"/><button type="button" onClick={applyMicroUrl} title="Guardar enlace y recargar la vista"><RefreshCw size={13}/></button><small>390 × 844</small></div>}<span>Marcá o desmarcá pestañas para cambiar la vista · arrastrá los divisores para ajustar</span></section>
      <main className={`split-stage split-stage-${globalPanels.length}`} style={{ gridTemplateColumns: globalPanels.length === 3 ? `minmax(0, ${aiGridRatios.x}fr) minmax(0, ${aiGridRatios.x2-aiGridRatios.x}fr) minmax(0, ${100-aiGridRatios.x2}fr)` : globalPanels.length >= 2 ? `minmax(0, ${aiGridRatios.x}fr) minmax(0, ${100-aiGridRatios.x}fr)` : 'minmax(0,1fr)', gridTemplateRows: globalPanels.length === 4 ? `minmax(0, ${aiGridRatios.y}fr) minmax(0, ${100-aiGridRatios.y}fr)` : 'minmax(0,1fr)' }}>
        {globalPanels.map((pane, index) => {
          const title = pane.section === 'ai' ? (aiTabs.find(item => item.id === pane.sub)?.name || tabName('ai')) : pane.section === 'documents' ? splitDocs[Number.isInteger(pane.slot) ? pane.slot : index].name : tabName(pane.section);
          const docSlot = Number.isInteger(pane.slot) ? pane.slot : index;
          return <section className={`split-pane ${pane.section === 'documents' ? 'split-documents' : ''}`} key={`${pane.section}-${pane.sub || pane.slot || ''}-${index}`} aria-label={title}>
            <div className="global-panel-name"><span>{title}</span>{pane.section === 'documents' && globalPanels.length > 1 && <button type="button" className="global-panel-close" onClick={() => closeDocumentsPanel(docSlot)} aria-label={`Cerrar ${title}`} title={`Cerrar ${title}`}>×</button>}</div>
            {pane.section === 'documents' ? renderDocumentsPane(docSlot) : pane.section === 'rina-accounts' ? <RinaAccounts ledger={rinaLedger}/> : !inDesktop ? <div className="preview-notice"><div className="notice-icon"><Columns2 size={20}/></div><div><strong>Vista disponible en DocsHub de escritorio</strong><p>Iniciá la app para mostrar este servicio.</p></div></div> : null}
          </section>;
        })}
      </main>
    </> : <>
    {tab === 'messaging' && <section className="overlay-bar ai-bar ai-chat-bar messaging-chat-bar">
      <div className="ai-chat-tabs" role="group" aria-label="Servicios de mensajería visibles">
        {MESSAGING_APPS.map(app => {
          const Icon = app.icon;
          const checked = visibleMessageIds.includes(app.id);
          return <div className={`ai-chat-tab ${activeMessageId === app.id ? 'active' : ''} ${checked ? 'checked' : ''}`} key={app.id}>
            <button type="button" className="ai-chat-check" aria-label={`${checked ? 'Quitar' : 'Agregar'} ${app.name} ${checked ? 'de' : 'a'} la vista`} aria-pressed={checked} title={checked ? 'Visible en la cuadrícula' : 'Marcar para mostrar en la cuadrícula'} onClick={() => toggleMessageVisible(app.id)}>{checked ? '✓' : ''}</button>
            <button type="button" className="ai-chat-open" onClick={() => focusMessageApp(app.id)} title={`Mostrar solo ${app.name}`}><Icon size={13}/><span>{app.name}</span></button>
          </div>;
        })}
      </div>
      <div className="ai-layout-tools"><span className="ai-visible-count">{visibleMessageIds.length} / 3</span></div>
    </section>}

    {tab === 'gmail' && <section className="overlay-bar mail-bar">
      <div className="mail-identities" role="group" aria-label="Cuentas de correo visibles">{EMAILS.map(account => {
        const checked = selectedMailIds.includes(account.id);
        return <div key={account.id} className={`mail-account-entry ${checked ? 'selected' : ''}`} onContextMenu={event => openTabContext(event, { type: 'mail-account', id: account.id })}>
          <button type="button" className={`mail-chip ${selectedMailIds.length === 1 && checked ? 'chosen' : ''}`} onClick={() => focusMailAccount(account.id)} title={`Mostrar solo ${account.email} · clic derecho para cambiar el nombre`}><span className="mail-avatar" style={{background:account.color}}>{mailAccountName(account).slice(0,1)}</span><span>{mailAccountName(account)}</span></button>
          <button type="button" className={`mail-account-check ${checked ? 'checked' : ''}`} aria-label={`${checked ? 'Quitar' : 'Agregar'} ${account.email} de la vista`} aria-pressed={checked} title={`${checked ? 'Quitar' : 'Agregar'} ${account.email} ${checked ? 'de' : 'a'} la vista`} onClick={() => toggleMailAccount(account.id)}>{checked ? '✓' : ''}</button>
        </div>;
      })}</div>
      <span className="bar-hint mail-hint">{selectedMailIds.length} de 6 cuentas visibles · tocá el nombre para ver solo esa cuenta</span>
      <button className="text-button" onClick={() => setSelectedMailIds(EMAILS.map(account => account.id))} disabled={selectedMailIds.length === EMAILS.length}><LayoutGrid size={15}/> Todas</button>
    </section>}

    {isAiProvider(tab) && <section className="overlay-bar ai-bar ai-chat-bar">
      <div className="ai-chat-tabs" role="group" aria-label={`Subpestañas de ${AI_APPS.find(app => app.id === tab)?.short || 'IA'}`}>
        {providerAiTabs.map(item => {
          const app = AI_APPS.find(candidate => candidate.id === item.service) || AI_APPS[0];
          const Icon = app.icon;
          const checked = selectedAiTabs.some(selected => selected.id === item.id);
          const dropBefore = aiDropTarget?.id === item.id && !aiDropTarget.after;
          const dropAfter = aiDropTarget?.id === item.id && aiDropTarget.after;
          return <div className={`ai-chat-tab ${activeAiTab.id === item.id ? 'active' : ''} ${checked ? 'checked' : ''} ${draggedAiTabId === item.id ? 'dragging' : ''} ${dropBefore ? 'drop-before' : ''} ${dropAfter ? 'drop-after' : ''}`} key={item.id} draggable onContextMenu={event => openTabContext(event, { type: 'ai-chat', id: item.id })} onDragStart={event => {
            if (event.target.closest('.ai-chat-check,.ai-chat-close')) { event.preventDefault(); return; }
            event.dataTransfer.effectAllowed = 'move'; event.dataTransfer.setData('text/plain', item.id);
            setDraggedAiTabId(item.id); setAiDropTarget(null);
          }} onDragOver={event => {
            if (!draggedAiTabId || draggedAiTabId === item.id) return;
            event.preventDefault(); event.dataTransfer.dropEffect = 'move';
            const bounds = event.currentTarget.getBoundingClientRect();
            const nextTarget = { id: item.id, after: event.clientX >= bounds.left + bounds.width / 2 };
            setAiDropTarget(current => current?.id === nextTarget.id && current?.after === nextTarget.after ? current : nextTarget);
          }} onDrop={event => {
            event.preventDefault();
            const sourceId = draggedAiTabId || event.dataTransfer.getData('text/plain');
            const bounds = event.currentTarget.getBoundingClientRect();
            reorderAiChatTabs(sourceId, item.id, event.clientX >= bounds.left + bounds.width / 2);
            setDraggedAiTabId(null); setAiDropTarget(null);
          }} onDragEnd={() => { setDraggedAiTabId(null); setAiDropTarget(null); }} title="Arrastrá para cambiar el orden">
            <button className="ai-chat-check" aria-label={`${checked ? 'Quitar de la vista múltiple' : 'Agregar a la vista múltiple'}: ${item.name}`} aria-pressed={checked} title={checked ? 'Visible en la cuadrícula' : 'Marcar para mostrar en la cuadrícula'} onClick={() => toggleAiChatVisible(item.id)}>{checked ? '✓' : ''}</button>
            <button className="ai-chat-open" onClick={() => focusAiChat(item.id)} onDoubleClick={event => { event.stopPropagation(); renameAiChat(item); }} title="Clic para abrir · clic derecho o doble clic para cambiar el nombre"><Icon size={13}/><span>{item.name}</span></button>
            <button className="ai-chat-close" aria-label={`Cerrar ${item.name}`} title="Cerrar subpestaña" onClick={() => closeAiChat(item)}>×</button>
          </div>;
        })}
        <button className="ai-add-chat" title="Crear chat nuevo o abrir uno existente" onClick={openAiChatDialog}><Plus size={15}/><span>Agregar chat</span></button>
      </div>
      <div className="ai-layout-tools">
        {['gpt-personal','gpt-alterframe'].includes(tab) && <button className="google-connect-button" disabled={aiClipboardBusy} onClick={pasteGptScreenshot} title="Adjuntar la imagen del portapapeles a este chat"><ClipboardPaste size={14}/>Pegar captura</button>}
        {tab === 'gemini-personal' ? <><button className="google-connect-button" onClick={() => connectGoogle('gmail')} title="Iniciá sesión en tu cuenta de Google desde Gmail"><Mail size={14}/>Conectar Google desde Gmail</button><button className="google-connect-button" onClick={() => connectGoogle('gemini')} title="Abrir Gemini con la sesión de Google conectada"><Sparkles size={14}/>Volver a Gemini</button></> : <button className="icon-button" title="Iniciar sesión en esta IA" aria-label="Iniciar sesión en esta IA" onClick={() => reloadPanel(aiViewId(providerActiveAiTab), true)}><ShieldCheck size={15}/></button>}
        <span className="ai-visible-count">{selectedAiTabs.length} / 3</span>
      </div>
    </section>}

    {tab === 'calendar' && <section className="overlay-bar calendar-bar">
      <label className="ai-select"><span className="slot-label">CUENTA</span><span className="select-wrap"><select value={calendarAccount} onChange={event => { setCalendarAccount(event.target.value); setViewError(null); }} aria-label="Cuenta de Calendario">{EMAILS.map(account => <option key={account.id} value={account.id}>{account.short} · {account.email}</option>)}</select><ChevronDown size={14}/></span></label>
      <span className="bar-hint">Para ver reuniones juntas, activá los calendarios vinculados en el menú de Google Calendar.</span>
    </section>}

    {tab === 'microinfluencers' && <section className="overlay-bar micro-preview-bar"><Smartphone size={15}/><span>Vista móvil</span><div className="micro-url-controls"><input aria-label="Enlace de vista previa de Microinfluencers" value={microUrlDraft} onChange={event => setMicroUrlDraft(event.target.value)} onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); applyMicroUrl(); } }} placeholder="Pegá el enlace de vista previa"/><button type="button" onClick={applyMicroUrl} title="Guardar enlace y recargar"><RefreshCw size={14}/></button><small>390 × 844</small></div></section>}
    {tab === 'documents' ? renderDocumentsPane(globalPanels.length === 1 && globalPanels[0].section === 'documents' ? globalPanels[0].slot : activeDocumentSlot) : tab === 'rina-accounts' ? <RinaAccounts ledger={rinaLedger}/> : <main className={`remote-stage stage-${tab} ${tab === 'microinfluencers' ? 'micro-preview-stage' : ''}`}>
      {!inDesktop && <div className="preview-notice"><div className="notice-icon"><CurrentIcon size={20}/></div><div><strong>La vista de servicios aparece en la app de escritorio</strong><p>Esta pantalla es una previsualización. Iniciá la app para conectar GPT Personal y Gemini Personal.</p></div><span className="preview-pill">VISTA PREVIA</span></div>}
      {tab === 'gmail' && <div className="mosaic-label">VISTA CONJUNTA <span>· {selectedMailIds.length} {selectedMailIds.length === 1 ? 'cuenta' : 'cuentas'}</span></div>}
      {tab === 'messaging' && <div className="messaging-mosaic-label">{viewIds.map(id=>{const app=MESSAGING_APPS.find(a=>a.id===id);const Icon=app.icon;return <div className="ai-panel-label" key={id}><Icon size={14}/><span>{app.short}</span></div>})}</div>}
      {inDesktop && tab !== 'documents' && <div className="remote-background"/>}
    </main>}
    </>}
    <footer className="statusbar"><span><span className="green-dot"/> DocsHub funciona localmente en este equipo</span><span className="ai-clipboard-status" role="status" title={aiClipboardStatus}>{aiClipboardStatus || `v${programVersion} · Escritorio privado`}</span></footer>
  </div>;
}

createRoot(document.getElementById('root')).render(<App/>);
