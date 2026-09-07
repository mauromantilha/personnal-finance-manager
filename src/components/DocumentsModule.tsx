import { useState, useEffect, useCallback, useRef } from 'react';
import { FileText, Eye, Download, Trash2, RefreshCw, Image, File, X, UploadCloud, AlertCircle } from 'lucide-react';
import AIDocumentConsentModal, { hasSavedConsent } from './AIDocumentConsentModal';

interface DocItem {
  key: string;
  name: string;
  size: number;
  uploadedAt: string;
}

function fmtSize(bytes: number): string {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

function fmtDateTime(iso: string): string {
  return new Date(iso).toLocaleString('pt-BR', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

function fmtDay(iso: string): string {
  return new Date(iso.slice(0, 10) + 'T12:00:00').toLocaleDateString('pt-BR', {
    day: '2-digit', month: 'long', year: 'numeric',
  });
}

function isImage(key: string) { return /\.(jpg|jpeg|png|webp|gif)$/i.test(key); }
function isPdf(key: string)   { return /\.pdf$/i.test(key); }

function groupByDate(docs: DocItem[]): [string, DocItem[]][] {
  const map: Record<string, DocItem[]> = {};
  for (const d of docs) {
    const day = d.uploadedAt.slice(0, 10);
    (map[day] ??= []).push(d);
  }
  return Object.entries(map).sort(([a], [b]) => b.localeCompare(a));
}

export default function DocumentsModule() {
  const [docs, setDocs]                 = useState<DocItem[]>([]);
  const [loading, setLoading]           = useState(true);
  const [deleting, setDeleting]         = useState<string | null>(null);
  const [preview, setPreview]           = useState<{ url: string; key: string } | null>(null);
  const [uploading, setUploading]       = useState(false);
  const [uploadError, setUploadError]   = useState<string | null>(null);
  const [showConsentModal, setShowConsentModal] = useState(false);
  const [pendingFile, setPendingFile]   = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/documents');
      const text = await res.text();
      let data: any = {};
      try {
        data = text ? JSON.parse(text) : {};
      } catch {
        setDocs([]);
        return;
      }
      if (res.ok) {
        setDocs(data.documents ?? []);
      }
    } catch (e) {
      console.error('[DocumentsModule] Erro ao carregar:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const uploadFile = async (file: File) => {
    setUploading(true);
    setUploadError(null);
    try {
      const reader = new FileReader();
      const base64Promise = new Promise<string>((resolve, reject) => {
        reader.onload = () => {
          const result = reader.result as string;
          const commaIndex = result.indexOf(',');
          resolve(commaIndex >= 0 ? result.slice(commaIndex + 1) : result);
        };
        reader.onerror = reject;
      });
      reader.readAsDataURL(file);
      const base64 = await base64Promise;

      const res = await fetch('/api/documents/upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          base64,
          mimeType: file.type || 'application/octet-stream',
          name: file.name,
        }),
      });

      const raw = await res.text();
      let data: any = {};
      try {
        data = raw ? JSON.parse(raw) : {};
      } catch {
        throw new Error(`Erro do servidor (${res.status})`);
      }

      if (!res.ok) {
        if (data.code === 'QUOTA_EXCEEDED') {
          throw new Error(`Limite de armazenamento excedido (${data.usedFormatted} de ${data.limitFormatted}).`);
        }
        throw new Error(data.error || 'Falha ao salvar documento no storage.');
      }

      await load();
    } catch (err: any) {
      setUploadError(err.message || 'Erro ao enviar documento.');
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!hasSavedConsent()) {
      setPendingFile(file);
      setShowConsentModal(true);
    } else {
      uploadFile(file);
    }
  };

  const handleDelete = async (key: string) => {
    if (!confirm('Excluir este documento?')) return;
    setDeleting(key);
    try {
      await fetch(`/api/documents/${key}`, { method: 'DELETE' });
      setDocs(prev => prev.filter(d => d.key !== key));
    } finally {
      setDeleting(null);
    }
  };

  const handleDownload = (doc: DocItem) => {
    const a = document.createElement('a');
    a.href = `/api/documents/${doc.key}`;
    a.download = doc.name;
    a.target = '_blank';
    a.click();
  };

  const groups = groupByDate(docs);

  return (
    <div className="space-y-6">
      {/* Hidden file input */}
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileSelect}
        accept="image/jpeg,image/png,image/webp,application/pdf"
        className="hidden"
      />

      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-xl font-bold text-slate-800">Documentos</h2>
          <p className="text-sm text-slate-500 mt-0.5">Faturas, extratos e comprovantes enviados ao sistema</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={load}
            disabled={loading}
            className="flex items-center gap-2 px-3 py-2 text-sm font-semibold text-slate-600 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            <span className="hidden sm:inline">Atualizar</span>
          </button>
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className="flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl shadow-sm shadow-indigo-100 transition-colors disabled:opacity-50"
          >
            <UploadCloud className="w-4 h-4" />
            <span>{uploading ? 'Enviando…' : 'Adicionar Documento'}</span>
          </button>
        </div>
      </div>

      {/* Upload error banner */}
      {uploadError && (
        <div className="p-4 bg-rose-50 border border-rose-200 rounded-2xl flex items-start justify-between gap-3 text-rose-800">
          <div className="flex items-center gap-2 text-sm">
            <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
            <span>{uploadError}</span>
          </div>
          <button onClick={() => setUploadError(null)} className="text-rose-500 hover:text-rose-700">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Content */}
      {loading ? (
        <div className="flex items-center justify-center py-24">
          <div className="flex flex-col items-center gap-3 text-slate-400">
            <div className="w-8 h-8 border-2 border-slate-200 border-t-indigo-500 rounded-full animate-spin" />
            <span className="text-sm">Carregando documentos…</span>
          </div>
        </div>
      ) : docs.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center">
          <FileText className="w-12 h-12 text-slate-300 mx-auto mb-3" />
          <p className="font-semibold text-slate-700">Nenhum documento encontrado</p>
          <p className="text-sm text-slate-400 mt-1 max-w-md mx-auto">
            Você ainda não possui comprovantes ou faturas salvos no seu cofre de documentos.
          </p>
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className="mt-5 inline-flex items-center gap-2 px-4 py-2.5 text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl transition-colors shadow-sm shadow-indigo-100 disabled:opacity-50"
          >
            <UploadCloud className="w-4 h-4" />
            <span>{uploading ? 'Enviando…' : 'Enviar Primeiro Documento'}</span>
          </button>
        </div>
      ) : (
        <div className="space-y-8">
          {groups.map(([day, items]) => (
            <div key={day}>
              {/* Day separator */}
              <div className="flex items-center gap-3 mb-3">
                <span className="text-xs font-bold text-slate-400 uppercase tracking-widest whitespace-nowrap">
                  {fmtDay(day)}
                </span>
                <div className="flex-1 h-px bg-slate-100" />
                <span className="text-xs text-slate-400 whitespace-nowrap">
                  {items.length} doc{items.length !== 1 ? 's' : ''}
                </span>
              </div>

              {/* Document cards */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {items.map(doc => (
                  <div
                    key={doc.key}
                    className="bg-white rounded-2xl border border-slate-200 p-4 flex flex-col gap-3 hover:border-indigo-200 transition-colors"
                  >
                    {/* File info */}
                    <div className="flex items-start gap-3">
                      <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                        isImage(doc.key) ? 'bg-emerald-50 text-emerald-500' :
                        isPdf(doc.key)   ? 'bg-rose-50 text-rose-500' :
                                           'bg-slate-100 text-slate-500'
                      }`}>
                        {isImage(doc.key) ? <Image className="w-5 h-5" /> :
                         isPdf(doc.key)   ? <FileText className="w-5 h-5" /> :
                                            <File className="w-5 h-5" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-slate-700 truncate">{doc.name}</p>
                        <p className="text-xs text-slate-400 mt-0.5">
                          {fmtSize(doc.size)} · {fmtDateTime(doc.uploadedAt)}
                        </p>
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => setPreview({ url: `/api/documents/${doc.key}`, key: doc.key })}
                        className="flex-1 flex items-center justify-center gap-1.5 px-2 py-1.5 text-xs font-semibold text-indigo-600 bg-indigo-50 rounded-lg hover:bg-indigo-100 transition-colors"
                      >
                        <Eye className="w-3.5 h-3.5" /> Visualizar
                      </button>
                      <button
                        onClick={() => handleDownload(doc)}
                        className="flex-1 flex items-center justify-center gap-1.5 px-2 py-1.5 text-xs font-semibold text-slate-600 bg-slate-50 rounded-lg hover:bg-slate-100 transition-colors"
                      >
                        <Download className="w-3.5 h-3.5" /> Download
                      </button>
                      <button
                        onClick={() => handleDelete(doc.key)}
                        disabled={deleting === doc.key}
                        className="p-1.5 text-slate-400 hover:text-rose-500 hover:bg-rose-50 rounded-lg transition-colors disabled:opacity-40"
                        title="Excluir"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Preview Modal */}
      {preview && (
        <div
          className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4"
          onClick={() => setPreview(null)}
        >
          <div
            className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[92vh] flex flex-col"
            onClick={e => e.stopPropagation()}
          >
            {/* Modal header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 shrink-0">
              <p className="font-semibold text-slate-700 text-sm truncate flex-1 mr-3">
                {preview.key.split('/').pop()}
              </p>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  onClick={() => {
                    const a = document.createElement('a');
                    a.href = preview.url;
                    a.download = preview.key.split('/').pop() ?? 'documento';
                    a.click();
                  }}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-600 bg-slate-100 rounded-lg hover:bg-slate-200 transition-colors"
                >
                  <Download className="w-3.5 h-3.5" /> Download
                </button>
                <button
                  onClick={() => setPreview(null)}
                  className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Preview content */}
            <div className="flex-1 overflow-hidden p-4 min-h-0">
              {isImage(preview.key) ? (
                <img
                  src={preview.url}
                  alt="Documento"
                  className="w-full h-full object-contain max-h-[72vh] rounded-xl"
                />
              ) : (
                <iframe
                  src={preview.url}
                  className="w-full rounded-xl border border-slate-200"
                  style={{ height: '72vh' }}
                  title="Documento"
                />
              )}
            </div>
          </div>
        </div>
      )}

      {/* Consent Modal */}
      <AIDocumentConsentModal
        isOpen={showConsentModal}
        documentType="GENERAL"
        onConsent={() => {
          setShowConsentModal(false);
          if (pendingFile) {
            uploadFile(pendingFile);
            setPendingFile(null);
          }
        }}
        onCancel={() => {
          setShowConsentModal(false);
          setPendingFile(null);
          if (fileInputRef.current) fileInputRef.current.value = '';
        }}
      />
    </div>
  );
}
