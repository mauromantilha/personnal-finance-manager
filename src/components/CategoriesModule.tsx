import { useState, useMemo } from 'react';
import { Tag, Plus, Pencil, Trash2, CheckCircle, AlertCircle, X, Check } from 'lucide-react';
import { Category } from '../types';

interface CategoriesModuleProps {
  categories: Category[];
  onAddCategory: (data: { name: string; icon: string; color: string; type: string; parentId?: string }) => Promise<boolean>;
  onEditCategory: (id: string, data: { name: string; icon: string; color: string }) => Promise<boolean>;
  onDeleteCategory: (id: string) => Promise<boolean>;
}

const CAT_COLORS = ['#EA580C', '#0284C7', '#7C3AED', '#DC2626', '#0891B2', '#16A34A', '#DB2777', '#EAB308', '#059669', '#6B7280'];
const CAT_ICONS = ['📦', '🍽️', '🚗', '🏠', '❤️', '📚', '🎮', '👕', '📈', '💰', '🛒', '✈️', '💊', '🎬', '🏋️', '💡', '📱', '🎁', '🖥️', '☕'];
const TYPE_LABELS: Record<string, string> = { income: 'Receita', expense: 'Despesa', both: 'Ambos' };

export default function CategoriesModule({ categories, onAddCategory, onEditCategory, onDeleteCategory }: CategoriesModuleProps) {
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [statusMsg, setStatusMsg] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  // New category form fields
  const [newName, setNewName] = useState('');
  const [newIcon, setNewIcon] = useState('📦');
  const [newColor, setNewColor] = useState(CAT_COLORS[0]);
  const [newType, setNewType] = useState<'income' | 'expense' | 'both'>('expense');
  const [newParentId, setNewParentId] = useState('');

  // Inline edit fields
  const [editName, setEditName] = useState('');
  const [editIcon, setEditIcon] = useState('📦');
  const [editColor, setEditColor] = useState('#6B7280');

  const notify = (text: string, type: 'success' | 'error') => {
    setStatusMsg({ text, type });
    setTimeout(() => setStatusMsg(null), 4000);
  };

  const parentCats = useMemo(() => categories.filter(c => !c.parentId), [categories]);

  const grouped = useMemo(() => {
    return parentCats.map(parent => ({
      parent,
      children: categories.filter(c => c.parentId === parent.id),
    }));
  }, [categories, parentCats]);

  const startEdit = (cat: Category) => {
    setEditingId(cat.id);
    setEditName(cat.name);
    setEditIcon(cat.icon);
    setEditColor(cat.color);
  };

  const handleAdd = async (e: { preventDefault(): void }) => {
    e.preventDefault();
    if (!newName.trim()) { notify('Informe o nome da categoria.', 'error'); return; }
    const ok = await onAddCategory({ name: newName.trim(), icon: newIcon, color: newColor, type: newType, parentId: newParentId || undefined });
    if (ok) {
      notify(`Categoria "${newName}" criada!`, 'success');
      setNewName(''); setNewIcon('📦'); setNewColor(CAT_COLORS[0]); setNewType('expense'); setNewParentId('');
      setShowForm(false);
    } else notify('Erro ao criar categoria.', 'error');
  };

  const handleSaveEdit = async (id: string) => {
    if (!editName.trim()) { notify('Nome não pode ser vazio.', 'error'); return; }
    const ok = await onEditCategory(id, { name: editName.trim(), icon: editIcon, color: editColor });
    if (ok) { notify('Categoria atualizada!', 'success'); setEditingId(null); }
    else notify('Erro ao atualizar.', 'error');
  };

  const handleDelete = async (id: string, name: string) => {
    const ok = await onDeleteCategory(id);
    if (ok) { notify(`"${name}" removida.`, 'success'); setDeleteConfirmId(null); }
    else notify('Não é possível excluir — categoria possui subcategorias ou transações.', 'error');
  };

  const CategoryRow = ({ cat, isChild = false }: { cat: Category; isChild?: boolean }) => {
    const isEditing = editingId === cat.id;
    return (
      <div className={`flex items-center gap-3 px-4 py-2.5 hover:bg-slate-50 transition-colors group border-b border-slate-50 ${isChild ? 'pl-10 bg-slate-50/50' : ''}`}>
        {isEditing ? (
          <>
            <input type="text" value={editIcon} onChange={e => setEditIcon(e.target.value)} className="w-10 text-center text-lg border border-slate-200 rounded-lg focus:outline-none bg-white" />
            <input type="text" value={editName} onChange={e => setEditName(e.target.value)} className="flex-1 text-xs font-semibold border border-slate-200 rounded-lg px-2 py-1 focus:outline-none focus:border-indigo-400 bg-white" />
            <div className="flex gap-1">
              {CAT_COLORS.map(c => (
                <button key={c} type="button" onClick={() => setEditColor(c)} style={{ backgroundColor: c }} className={`w-4 h-4 rounded-full border-2 transition-transform ${editColor === c ? 'scale-125 border-slate-800' : 'border-transparent'}`} />
              ))}
            </div>
            <button onClick={() => handleSaveEdit(cat.id)} className="p-1 text-emerald-600 hover:bg-emerald-50 rounded-lg"><Check className="w-3.5 h-3.5" /></button>
            <button onClick={() => setEditingId(null)} className="p-1 text-slate-400 hover:bg-slate-100 rounded-lg"><X className="w-3.5 h-3.5" /></button>
          </>
        ) : (
          <>
            <span className="text-base w-7 text-center shrink-0">{cat.icon}</span>
            <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: cat.color }} />
            <span className="flex-1 text-xs font-semibold text-slate-700">{cat.name}</span>
            <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full ${cat.type === 'income' ? 'bg-emerald-50 text-emerald-700' : cat.type === 'expense' ? 'bg-rose-50 text-rose-700' : 'bg-slate-100 text-slate-500'}`}>
              {TYPE_LABELS[cat.type]}
            </span>
            <div className="flex gap-0.5 opacity-0 group-hover:opacity-100 transition-all">
              <button onClick={() => startEdit(cat)} className="p-1 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg"><Pencil className="w-3 h-3" /></button>
              {deleteConfirmId === cat.id ? (
                <>
                  <button onClick={() => handleDelete(cat.id, cat.name)} className="text-[8px] bg-rose-600 text-white rounded px-1.5 py-0.5 font-bold">Sim</button>
                  <button onClick={() => setDeleteConfirmId(null)} className="text-[8px] bg-slate-200 text-slate-600 rounded px-1.5 py-0.5 font-bold">Não</button>
                </>
              ) : (
                <button onClick={() => setDeleteConfirmId(cat.id)} className="p-1 text-slate-400 hover:text-rose-500 hover:bg-rose-50 rounded-lg"><Trash2 className="w-3 h-3" /></button>
              )}
            </div>
          </>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-xl font-bold text-slate-800 tracking-tight flex items-center gap-2">
            <Tag className="w-5 h-5 text-orange-500" />
            Gerenciamento de Categorias
          </h2>
          <p className="text-sm text-slate-500 mt-1">
            Crie, edite e organize as categorias para classificar seus lançamentos.
          </p>
        </div>
        <button
          onClick={() => setShowForm(!showForm)}
          className="flex items-center gap-1.5 px-3 py-2 bg-orange-500 hover:bg-orange-600 text-white rounded-xl text-xs font-bold transition-all shadow-sm"
        >
          <Plus className="w-3.5 h-3.5" /> Nova Categoria
        </button>
      </div>

      {statusMsg && (
        <div className={`p-3 rounded-lg flex items-center gap-2 border text-xs font-medium animate-fadeIn ${statusMsg.type === 'success' ? 'bg-green-50 border-green-200 text-green-800' : 'bg-red-50 border-red-200 text-red-800'}`}>
          {statusMsg.type === 'success' ? <CheckCircle className="w-4 h-4 text-green-600" /> : <AlertCircle className="w-4 h-4 text-red-600" />}
          {statusMsg.text}
        </div>
      )}

      {/* Add form */}
      {showForm && (
        <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm animate-fadeIn">
          <h3 className="font-semibold text-slate-800 text-sm mb-4">Nova Categoria</h3>
          <form onSubmit={handleAdd} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Nome</label>
                <input type="text" value={newName} onChange={e => setNewName(e.target.value)} placeholder="Ex: Pets, Academia, Assinaturas…"
                  className="w-full text-xs border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:border-orange-400" autoFocus />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Tipo</label>
                <div className="grid grid-cols-3 gap-2">
                  {(['expense', 'income', 'both'] as const).map(t => (
                    <button key={t} type="button" onClick={() => setNewType(t)}
                      className={`py-1.5 text-[10px] font-bold rounded-lg border-2 transition-all ${newType === t ? 'border-orange-500 bg-orange-50 text-orange-700' : 'border-slate-100 text-slate-500 hover:bg-slate-50'}`}>
                      {TYPE_LABELS[t]}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Subcategoria de</label>
                <select value={newParentId} onChange={e => setNewParentId(e.target.value)}
                  className="w-full text-xs border border-slate-200 rounded-lg px-3 py-2 focus:outline-none font-semibold">
                  <option value="">— Categoria principal —</option>
                  {parentCats.map(c => <option key={c.id} value={c.id}>{c.icon} {c.name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Ícone</label>
                <div className="flex flex-wrap gap-1.5">
                  {CAT_ICONS.map(ico => (
                    <button key={ico} type="button" onClick={() => setNewIcon(ico)}
                      className={`w-7 h-7 text-base rounded-lg flex items-center justify-center border-2 transition-all ${newIcon === ico ? 'border-orange-500 bg-orange-50 scale-110' : 'border-transparent hover:bg-slate-100'}`}>
                      {ico}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <div>
              <label className="block text-[10px] font-bold text-slate-500 uppercase mb-2">Cor</label>
              <div className="flex gap-2 flex-wrap">
                {CAT_COLORS.map(c => (
                  <button key={c} type="button" onClick={() => setNewColor(c)} style={{ backgroundColor: c }}
                    className={`w-7 h-7 rounded-full border-2 transition-transform ${newColor === c ? 'scale-125 border-slate-900' : 'border-transparent'}`} />
                ))}
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setShowForm(false)} className="text-xs text-slate-500 font-bold px-3 py-1.5 hover:bg-slate-100 rounded-lg">Cancelar</button>
              <button type="submit" className="text-xs bg-orange-500 hover:bg-orange-600 text-white font-bold px-4 py-1.5 rounded-lg">Criar Categoria</button>
            </div>
          </form>
        </div>
      )}

      {/* Category list */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
          <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">
            {categories.length} categorias · {parentCats.length} principais
          </span>
        </div>

        {grouped.map(({ parent, children }) => (
          <div key={parent.id}>
            <CategoryRow cat={parent} />
            {children.map(child => <CategoryRow key={child.id} cat={child} isChild />)}
          </div>
        ))}

        {categories.length === 0 && (
          <div className="py-12 text-center text-slate-400 text-xs">
            <Tag className="w-8 h-8 mx-auto mb-2 opacity-30" />
            <p>Nenhuma categoria cadastrada.</p>
          </div>
        )}
      </div>
    </div>
  );
}
