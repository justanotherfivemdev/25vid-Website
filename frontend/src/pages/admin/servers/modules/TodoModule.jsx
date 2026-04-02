import React, { useState, useCallback } from 'react';
import { useOutletContext } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  CheckSquare,
  Plus,
  Trash2,
  Square,
  CheckCircle,
  Clock,
  User,
} from 'lucide-react';

const STORAGE_KEY_PREFIX = 'server_todos_';

function TodoModule() {
  const { serverId } = useOutletContext();
  const storageKey = `${STORAGE_KEY_PREFIX}${serverId}`;

  const [todos, setTodos] = useState(() => {
    try { return JSON.parse(localStorage.getItem(storageKey) || '[]'); }
    catch { return []; }
  });
  const [newTodo, setNewTodo] = useState('');
  const [newAssignee, setNewAssignee] = useState('');

  const save = useCallback((updated) => {
    setTodos(updated);
    localStorage.setItem(storageKey, JSON.stringify(updated));
  }, [storageKey]);

  const addTodo = useCallback(() => {
    if (!newTodo.trim()) return;
    save([...todos, {
      id: Date.now(),
      text: newTodo.trim(),
      assignee: newAssignee.trim() || null,
      done: false,
      created: new Date().toISOString(),
    }]);
    setNewTodo('');
    setNewAssignee('');
  }, [newTodo, newAssignee, todos, save]);

  const toggleTodo = useCallback((id) => {
    save(todos.map(t => t.id === id ? { ...t, done: !t.done } : t));
  }, [todos, save]);

  const removeTodo = useCallback((id) => {
    save(todos.filter(t => t.id !== id));
  }, [todos, save]);

  const pending = todos.filter(t => !t.done).length;
  const completed = todos.filter(t => t.done).length;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold tracking-wider text-gray-300" style={{ fontFamily: 'Rajdhani, sans-serif' }}>
          TODO LIST
        </h2>
        <div className="flex gap-2">
          <Badge variant="outline" className="border-amber-600/30 text-amber-400 text-[10px]">{pending} pending</Badge>
          <Badge variant="outline" className="border-green-600/30 text-green-400 text-[10px]">{completed} done</Badge>
        </div>
      </div>

      {/* Add todo */}
      <Card className="border-zinc-800 bg-black/60">
        <CardContent className="p-4">
          <div className="flex gap-2">
            <Input value={newTodo} onChange={(e) => setNewTodo(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && addTodo()}
              placeholder="Add a task…"
              className="h-8 flex-1 border-zinc-800 bg-black/60 text-xs text-white placeholder:text-gray-600" />
            <Input value={newAssignee} onChange={(e) => setNewAssignee(e.target.value)}
              placeholder="Assignee"
              className="h-8 w-32 border-zinc-800 bg-black/60 text-xs text-white placeholder:text-gray-600" />
            <Button size="sm" onClick={addTodo} disabled={!newTodo.trim()}
              className="h-8 bg-tropic-gold text-black hover:bg-tropic-gold-light text-xs">
              <Plus className="h-3 w-3" />
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Todo list */}
      {todos.length === 0 ? (
        <Card className="border-zinc-800 bg-black/60">
          <CardContent className="flex flex-col items-center justify-center py-12">
            <CheckSquare className="mb-2 h-8 w-8 text-gray-700" />
            <p className="text-sm text-gray-500">No tasks yet</p>
            <p className="mt-1 text-xs text-gray-600">Add operator checklist items for this server</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-1.5">
          {/* Pending first, then done */}
          {[...todos.filter(t => !t.done), ...todos.filter(t => t.done)].map((todo) => (
            <Card key={todo.id} className={`border-zinc-800 bg-black/60 ${todo.done ? 'opacity-50' : ''}`}>
              <CardContent className="flex items-center gap-3 p-3">
                <button onClick={() => toggleTodo(todo.id)} className="shrink-0">
                  {todo.done ? (
                    <CheckCircle className="h-5 w-5 text-green-400" />
                  ) : (
                    <Square className="h-5 w-5 text-gray-600 hover:text-tropic-gold" />
                  )}
                </button>
                <div className="flex-1">
                  <span className={`text-xs ${todo.done ? 'text-gray-500 line-through' : 'text-gray-200'}`}>
                    {todo.text}
                  </span>
                  <div className="flex items-center gap-2 mt-0.5 text-[10px] text-gray-600">
                    {todo.assignee && (
                      <span className="flex items-center gap-1"><User className="h-2.5 w-2.5" /> {todo.assignee}</span>
                    )}
                    <span className="flex items-center gap-1"><Clock className="h-2.5 w-2.5" /> {new Date(todo.created).toLocaleDateString()}</span>
                  </div>
                </div>
                <button onClick={() => removeTodo(todo.id)} className="text-gray-600 hover:text-red-400">
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

export default TodoModule;
