import React, { useState, useEffect, useRef, useCallback } from 'react';
import { getApiBaseSync } from '../api/backendUrl';
import {
  ArrowLeft, FolderPlus, Trash2, Upload, Folder, File,
  ChevronRight, ChevronDown, MoreVertical, FolderOpen,
} from 'lucide-react';

interface FileEntry {
  id: number;
  name: string;
  path: string;
  isDirectory: boolean;
  size: number;
  modified: string;
  access_count?: number;
  last_accessed?: string | null;
  children?: FileEntry[];
}

const formatSize = (bytes: number): string => {
  if (bytes === 0) return '-';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
};

const getFileIcon = (name: string, isDirectory: boolean) => {
  if (isDirectory) return <Folder size={16} />;
  const ext = name.split('.').pop()?.toLowerCase() || '';
  if (['pdf'].includes(ext)) return <File size={16} className="text-red-500" />;
  if (['doc', 'docx', 'txt', 'rtf', 'odt', 'md'].includes(ext)) return <File size={16} className="text-blue-500" />;
  if (['xls', 'xlsx', 'csv', 'ods'].includes(ext)) return <File size={16} className="text-green-500" />;
  if (['py', 'js', 'ts', 'jsx', 'tsx', 'rs', 'go', 'java', 'cpp', 'c'].includes(ext)) return <File size={16} className="text-yellow-500" />;
  if (['json', 'xml', 'yaml', 'yml', 'toml'].includes(ext)) return <File size={16} className="text-purple-500" />;
  return <File size={16} />;
};

const AllFilesTab: React.FC = () => {
  const [files, setFiles] = useState<FileEntry[]>([]);
  const [expandedDirs, setExpandedDirs] = useState<Set<number>>(new Set());
  const [selectedFile, setSelectedFile] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [showNewFolder, setShowNewFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [newFolderParentId, setNewFolderParentId] = useState<number | null>(null);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; entry: FileEntry } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);
  const [uploadParentId, setUploadParentId] = useState<number | null>(null);
  const [isFolderUpload, setIsFolderUpload] = useState(false);

  const fetchFiles = useCallback(async () => {
    try {
      setIsLoading(true);
      const apiBase = getApiBaseSync();
      console.log('[LocalFiles] Fetching from:', `${apiBase}/all-files`);
      const response = await fetch(`${apiBase}/all-files`);
      console.log('[LocalFiles] Response status:', response.status);
      if (response.ok) {
        const data = await response.json();
        console.log('[LocalFiles] Got data:', data);
        setFiles(Array.isArray(data) ? data : []);
      } else {
        console.error('[LocalFiles] Error response:', response.status, response.statusText);
        setFiles([]);
      }
    } catch (err) {
      console.error('[LocalFiles] Fetch error:', err);
      setFiles([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => { fetchFiles(); }, [fetchFiles]);

  useEffect(() => {
    const handleClick = () => setContextMenu(null);
    if (contextMenu) {
      document.addEventListener('click', handleClick);
      return () => document.removeEventListener('click', handleClick);
    }
  }, [contextMenu]);

  const handleCreateFolder = async () => {
    if (!newFolderName.trim()) return;
    try {
      await fetch(`${getApiBaseSync()}/all-files/folder`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newFolderName.trim(), parent_id: newFolderParentId }),
      });
      setNewFolderName('');
      setShowNewFolder(false);
      setNewFolderParentId(null);
      fetchFiles();
    } catch (e) { console.error('Failed to create folder:', e); }
  };

  const handleDelete = async (id: number) => {
    if (!window.confirm('Delete this item and all its contents?')) return;
    try {
      await fetch(`${getApiBaseSync()}/all-files/${id}`, { method: 'DELETE' });
      fetchFiles();
    } catch (e) { console.error('Failed to delete:', e); }
  };

  const [uploadStatus, setUploadStatus] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const fileList = e.target.files;
    if (!fileList || fileList.length === 0) return;
    
    const fileArray = Array.from(fileList);
    console.log(`[LocalFiles] Uploading ${fileArray.length} items (files/folders)`);
    
    // Debug: check if webkitRelativePath is available (for folder uploads)
    for (let i = 0; i < Math.min(fileArray.length, 3); i++) {
      const f = fileArray[i];
      console.log(`[LocalFiles] File ${i}: name="${f.name}", webkitRelativePath="${(f as any).webkitRelativePath || 'NOT SET'}", size=${f.size}, type="${f.type}"`);
    }
    
    const formData = new FormData();
    fileArray.forEach(f => formData.append('files', f));
    
    try {
      const baseUrl = getApiBaseSync();
      const url = uploadParentId
        ? `${baseUrl}/all-files/upload?parent_id=${uploadParentId}`
        : `${baseUrl}/all-files/upload`;
      
      console.log(`[LocalFiles] Upload URL: ${url}`);
      console.log(`[LocalFiles] Files to upload:`, fileArray.map(f => ({ name: f.name, size: f.size, type: f.type, webkitRelativePath: (f as any).webkitRelativePath })));
      
      const response = await fetch(url, { 
        method: 'POST', 
        body: formData,
      });
      
      const responseText = await response.text();
      console.log(`[LocalFiles] Upload response status: ${response.status}, body:`, responseText);
      
      if (!response.ok) {
        console.error(`[LocalFiles] Upload failed with status ${response.status}:`, responseText);
        setUploadStatus({ type: 'error', message: `Upload failed: ${response.status} - ${responseText}` });
        setTimeout(() => setUploadStatus(null), 5000);
      } else {
        try {
          const result = JSON.parse(responseText);
          console.log('[LocalFiles] Upload successful:', result);
          setUploadStatus({ type: 'success', message: result.message || `Uploaded ${fileArray.length} item(s) successfully` });
          setTimeout(() => setUploadStatus(null), 3000);
          fetchFiles();
        } catch {
          console.log('[LocalFiles] Upload successful (non-JSON response)');
          setUploadStatus({ type: 'success', message: `Uploaded ${fileArray.length} item(s) successfully` });
          setTimeout(() => setUploadStatus(null), 3000);
          fetchFiles();
        }
      }
    } catch (err) {
      console.error('[LocalFiles] Upload error:', err);
      const errorMessage = err instanceof Error ? err.message : String(err);
      if (errorMessage.includes('Failed to fetch') || errorMessage.includes('NetworkError')) {
        setUploadStatus({ type: 'error', message: 'Upload failed: Cannot connect to backend. Make sure the app is running.' });
      } else {
        setUploadStatus({ type: 'error', message: `Upload failed: ${errorMessage}` });
      }
      setTimeout(() => setUploadStatus(null), 5000);
    }
    // Clear the appropriate input after upload
    if (isFolderUpload) {
      if (folderInputRef.current) folderInputRef.current.value = '';
    } else {
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
    setUploadParentId(null);
    setIsFolderUpload(false);
  };

  const triggerUpload = (parentId: number | null = null, isFolder: boolean = false) => {
    setUploadParentId(parentId);
    setIsFolderUpload(isFolder);
    if (isFolder) {
      folderInputRef.current?.click();
    } else {
      fileInputRef.current?.click();
    }
  };

  const toggleDir = (id: number) => {
    setExpandedDirs(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const handleContextMenu = (e: React.MouseEvent, entry: FileEntry) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({ x: e.clientX, y: e.clientY, entry });
  };

  const renderEntry = (entry: FileEntry, depth = 0): React.ReactNode => {
    const isExpanded = expandedDirs.has(entry.id);
    const isSelected = selectedFile === entry.id;
    return (
      <div key={entry.id}>
        <div
          className={`local-file-item ${isSelected ? 'selected' : ''}`}
          style={{ paddingLeft: `${12 + depth * 20}px` }}
          onClick={() => {
            setSelectedFile(entry.id);
            if (entry.isDirectory) toggleDir(entry.id);
          }}
          onContextMenu={e => handleContextMenu(e, entry)}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: 1, minWidth: 0 }}>
            {entry.isDirectory ? (
              <span onClick={e => { e.stopPropagation(); toggleDir(entry.id); }} style={{ cursor: 'pointer', display: 'flex', alignItems: 'center' }}>
                {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
              </span>
            ) : <span style={{ width: 14 }} />}
            {entry.isDirectory
              ? (isExpanded ? <FolderOpen size={16} style={{ color: 'var(--accent)' }} /> : <Folder size={16} style={{ color: 'var(--accent)' }} />)
              : getFileIcon(entry.name, false)
            }
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{entry.name}</span>
            {!entry.isDirectory && (entry.access_count ?? 0) > 0 && (
              <span style={{ fontSize: '10px', padding: '1px 5px', borderRadius: '8px', backgroundColor: 'var(--accent)', color: '#fff', flexShrink: 0, marginLeft: '4px' }}>
                ×{entry.access_count}
              </span>
            )}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
            <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{formatSize(entry.size)}</span>
            <button
              className="local-file-action-btn"
              onClick={e => { e.stopPropagation(); handleContextMenu(e, entry); }}
              title="Actions"
            >
              <MoreVertical size={14} />
            </button>
          </div>
        </div>
        {entry.isDirectory && isExpanded && entry.children?.map(child => renderEntry(child, depth + 1))}
      </div>
    );
  };

  const countFiles = (entries: FileEntry[]): number =>
    entries.reduce((n, e) => n + (e.isDirectory ? countFiles(e.children ?? []) : 1), 0);
  const totalFiles = countFiles(files);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>
      {/* Input for individual files (no webkitdirectory) */}
      <input
        type="file"
        ref={fileInputRef}
        multiple
        onChange={(e) => { setIsFolderUpload(false); handleUpload(e); }}
        style={{ display: 'none' }}
      />
      {/* Input for folder uploads (with webkitdirectory) */}
      <input
        type="file"
        ref={folderInputRef}
        multiple
        {...({ webkitdirectory: '', directory: '' } as React.InputHTMLAttributes<HTMLInputElement>)}
        onChange={(e) => { setIsFolderUpload(true); handleUpload(e); }}
        style={{ display: 'none' }}
      />

      {uploadStatus && (
        <div style={{ 
          padding: '10px 20px', 
          backgroundColor: uploadStatus.type === 'success' ? 'rgba(34, 197, 94, 0.15)' : 'rgba(239, 68, 68, 0.15)',
          borderBottom: `1px solid ${uploadStatus.type === 'success' ? 'rgb(34, 197, 94)' : 'rgb(239, 68, 68)'}`,
          color: uploadStatus.type === 'success' ? 'rgb(34, 197, 94)' : 'rgb(239, 68, 68)',
          fontSize: '13px',
          fontWeight: 500,
          flexShrink: 0,
        }}>
          {uploadStatus.type === 'success' ? '✓' : '✗'} {uploadStatus.message}
        </div>
      )}

      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 20px', borderBottom: '1px solid var(--border-primary)', flexShrink: 0 }}>
        <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
          {totalFiles} file{totalFiles !== 1 ? 's' : ''} • Stored in AppData/Aud.io/all_files/
        </span>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: '8px' }}>
          <button
            className="header-button"
            title="Upload individual files"
            onClick={() => triggerUpload(null, false)}
            style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}
          >
            <Upload size={15} />
            <span style={{ fontSize: '13px' }}>Upload Files</span>
          </button>
          <button
            className="header-button"
            title="Upload folder with all contents"
            onClick={() => triggerUpload(null, true)}
            style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}
          >
            <Upload size={15} />
            <span style={{ fontSize: '13px' }}>Upload Folder</span>
          </button>
        </div>
      </div>

      <div style={{ padding: '8px 20px', backgroundColor: 'var(--bg-secondary)', borderBottom: '1px solid var(--border-primary)', flexShrink: 0, display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
        <p style={{ fontSize: '13px', color: 'var(--text-secondary)', margin: 0 }}>
          Unlimited storage. Reference them in any chat by typing <code style={{ backgroundColor: 'var(--bg-tertiary)', padding: '2px 6px', borderRadius: '4px', fontWeight: 600 }}>@filename</code>
        </p>
      </div>

      {showNewFolder && (
        <div style={{ padding: '10px 20px', borderBottom: '1px solid var(--border-primary)', display: 'flex', gap: '8px', backgroundColor: 'var(--bg-secondary)', flexShrink: 0 }}>
          <div style={{ flex: 1 }}>
            {newFolderParentId && (
              <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '6px' }}>Creating inside selected directory</div>
            )}
            <input
              type="text"
              value={newFolderName}
              onChange={e => setNewFolderName(e.target.value)}
              placeholder="Folder name..."
              onKeyDown={e => e.key === 'Enter' && handleCreateFolder()}
              style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', border: '1px solid var(--border-primary)', backgroundColor: 'var(--bg-input)', color: 'var(--text-primary)', fontSize: '14px', outline: 'none' }}
              autoFocus
            />
          </div>
          <button onClick={handleCreateFolder} style={{ padding: '8px 16px', borderRadius: '8px', border: 'none', backgroundColor: 'var(--accent)', color: '#fff', fontSize: '13px', cursor: 'pointer', alignSelf: 'flex-end' }}>Create</button>
          <button onClick={() => { setShowNewFolder(false); setNewFolderName(''); setNewFolderParentId(null); }} style={{ padding: '8px 16px', borderRadius: '8px', border: '1px solid var(--border-primary)', backgroundColor: 'transparent', color: 'var(--text-primary)', fontSize: '13px', cursor: 'pointer', alignSelf: 'flex-end' }}>Cancel</button>
        </div>
      )}

      <div style={{ flex: 1, overflowY: 'auto', padding: '12px 16px' }}>
        {isLoading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: '60px 0' }}>
            <div style={{ width: '32px', height: '32px', border: '3px solid var(--border-primary)', borderTop: '3px solid var(--accent)', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
          </div>
        ) : files.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '60px 20px', color: 'var(--text-muted)' }}>
            <Folder size={40} style={{ margin: '0 auto 12px', opacity: 0.4 }} />
            <p style={{ fontWeight: 600, marginBottom: '8px' }}>No files yet</p>
            <p style={{ fontSize: '13px' }}>Upload files or create folders to build your library.</p>
          </div>
        ) : (
          <div style={{ maxWidth: '800px', margin: '0 auto' }}>
            {files.map(entry => renderEntry(entry))}
          </div>
        )}
      </div>

      {contextMenu && (
        <div
          className="context-menu"
          style={{ position: 'fixed', top: contextMenu.y, left: contextMenu.x, backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-primary)', borderRadius: '8px', padding: '4px 0', boxShadow: '0 4px 12px rgba(0,0,0,0.15)', zIndex: 1000, minWidth: '170px' }}
        >
          {contextMenu.entry.isDirectory && (
            <>
              <button className="context-menu-item" onClick={() => { setNewFolderParentId(contextMenu.entry.id); setShowNewFolder(true); setContextMenu(null); }}
                style={{ display: 'flex', alignItems: 'center', gap: '8px', width: '100%', padding: '8px 12px', border: 'none', backgroundColor: 'transparent', color: 'var(--text-primary)', fontSize: '13px', cursor: 'pointer', textAlign: 'left' }}>
                <FolderPlus size={14} /> New folder inside
              </button>
              <button className="context-menu-item" onClick={() => { triggerUpload(contextMenu.entry.id, false); setContextMenu(null); }}
                style={{ display: 'flex', alignItems: 'center', gap: '8px', width: '100%', padding: '8px 12px', border: 'none', backgroundColor: 'transparent', color: 'var(--text-primary)', fontSize: '13px', cursor: 'pointer', textAlign: 'left' }}>
                <Upload size={14} /> Upload files here
              </button>
              <button className="context-menu-item" onClick={() => { triggerUpload(contextMenu.entry.id, true); setContextMenu(null); }}
                style={{ display: 'flex', alignItems: 'center', gap: '8px', width: '100%', padding: '8px 12px', border: 'none', backgroundColor: 'transparent', color: 'var(--text-primary)', fontSize: '13px', cursor: 'pointer', textAlign: 'left' }}>
                <Upload size={14} /> Upload folder here
              </button>
              <div style={{ height: '1px', backgroundColor: 'var(--border-primary)', margin: '4px 0' }} />
            </>
          )}
          <button className="context-menu-item" onClick={() => { handleDelete(contextMenu.entry.id); setContextMenu(null); }}
            style={{ display: 'flex', alignItems: 'center', gap: '8px', width: '100%', padding: '8px 12px', border: 'none', backgroundColor: 'transparent', color: '#ef4444', fontSize: '13px', cursor: 'pointer', textAlign: 'left' }}>
            <Trash2 size={14} /> Delete
          </button>
        </div>
      )}
    </div>
  );
};

const LocalFilesPanel: React.FC<{ isOpen: boolean; onClose: () => void }> = ({ isOpen, onClose }) => {
  if (!isOpen) return null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', width: '100%', backgroundColor: 'var(--bg-primary)' }}>
      <div style={{ padding: '20px 30px 0', flexShrink: 0 }}>
        <div className="chat-header">
          <div className="chat-header-bar centered">
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <button className="header-icon-button" onClick={onClose} title="Back">
                <ArrowLeft size={18} />
              </button>
              <h1 className="chat-title" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Folder size={20} />
                Local Storage
              </h1>
            </div>
          </div>
        </div>
      </div>

      <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        <AllFilesTab />
      </div>

      <style>{`
        .local-file-item {
          display: flex;
          align-items: center;
          padding: 7px 12px;
          border-radius: 6px;
          cursor: pointer;
          transition: background 0.1s;
          user-select: none;
        }
        .local-file-item:hover { background: var(--bg-secondary); }
        .local-file-item.selected { background: var(--bg-tertiary); }
        .local-file-item:hover .local-file-action-btn { opacity: 1; }
        .local-file-action-btn {
          opacity: 0;
          transition: opacity 0.15s;
          background: none;
          border: none;
          cursor: pointer;
          padding: 4px;
          border-radius: 4px;
          color: var(--text-secondary);
        }
        .local-file-action-btn:hover { background: var(--bg-tertiary); color: var(--text-primary); }
        .context-menu-item:hover { background: var(--bg-tertiary) !important; }
        .header-button {
          display: flex;
          align-items: center;
          gap: 4px;
          padding: 6px 12px;
          border-radius: 8px;
          border: 1px solid var(--border-primary);
          background: transparent;
          color: var(--text-primary);
          font-size: 13px;
          cursor: pointer;
          transition: background 0.1s;
        }
        .header-button:hover { background: var(--bg-secondary); }
      `}</style>
    </div>
  );
};

export default LocalFilesPanel;
