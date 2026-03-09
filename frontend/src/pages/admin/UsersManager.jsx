import React, { useEffect, useState } from 'react';
import axios from 'axios';
import AdminLayout from '@/components/admin/AdminLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Shield, Trash2, UserCheck, Search } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

const UsersManager = () => {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [editUser, setEditUser] = useState(null);
  const [editForm, setEditForm] = useState({ role: '', rank: '', specialization: '' });

  useEffect(() => { fetchUsers(); }, []);

  const fetchUsers = async () => {
    try {
      const token = localStorage.getItem('token');
      const config = { headers: { Authorization: `Bearer ${token}` } };
      const response = await axios.get(`${API}/admin/users`, config);
      setUsers(response.data);
    } catch (error) {
      console.error('Error fetching users:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateUser = async () => {
    try {
      const token = localStorage.getItem('token');
      const config = { headers: { Authorization: `Bearer ${token}` } };
      const payload = {};
      if (editForm.role) payload.role = editForm.role;
      if (editForm.rank) payload.rank = editForm.rank;
      if (editForm.specialization) payload.specialization = editForm.specialization;

      await axios.put(`${API}/admin/users/${editUser.id}`, payload, config);
      await fetchUsers();
      setEditUser(null);
    } catch (error) {
      alert(error.response?.data?.detail || 'Error updating user');
    }
  };

  const handleDeleteUser = async (id) => {
    if (!window.confirm('Are you sure you want to delete this user? This cannot be undone.')) return;
    try {
      const token = localStorage.getItem('token');
      const config = { headers: { Authorization: `Bearer ${token}` } };
      await axios.delete(`${API}/admin/users/${id}`, config);
      await fetchUsers();
    } catch (error) {
      alert(error.response?.data?.detail || 'Error deleting user');
    }
  };

  const filtered = users.filter(u =>
    u.username.toLowerCase().includes(search.toLowerCase()) ||
    u.email.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-4xl font-bold" style={{ fontFamily: 'Rajdhani, sans-serif' }} data-testid="users-manager-title">
            MEMBER MANAGEMENT
          </h1>
          <p className="text-gray-400 mt-2">Manage unit members, roles, and ranks</p>
        </div>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search members by name or email..."
            className="bg-gray-900 border-gray-700 pl-10"
            data-testid="user-search-input"
          />
        </div>

        {loading ? (
          <div className="text-center py-12">Loading members...</div>
        ) : filtered.length === 0 ? (
          <Card className="bg-gray-900 border-gray-800">
            <CardContent className="py-12 text-center text-gray-400">No members found.</CardContent>
          </Card>
        ) : (
          <div className="grid gap-3">
            {filtered.map((user) => (
              <Card key={user.id} className="bg-gray-900 border-gray-800" data-testid={`user-card-${user.id}`}>
                <CardContent className="py-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-4">
                      <div className="w-10 h-10 rounded-full bg-gray-800 flex items-center justify-center text-lg font-bold" style={{ fontFamily: 'Rajdhani, sans-serif' }}>
                        {user.username[0]?.toUpperCase()}
                      </div>
                      <div>
                        <div className="font-bold text-lg" style={{ fontFamily: 'Rajdhani, sans-serif' }}>
                          {user.username}
                        </div>
                        <div className="text-sm text-gray-400">{user.email}</div>
                      </div>
                    </div>

                    <div className="flex items-center space-x-3">
                      <Badge className={user.role === 'admin' ? 'bg-red-700 text-white' : 'bg-gray-700 text-gray-300'}>
                        {user.role.toUpperCase()}
                      </Badge>
                      {user.rank && <span className="text-sm text-gray-400">{user.rank}</span>}
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setEditUser(user);
                          setEditForm({ role: user.role, rank: user.rank || '', specialization: user.specialization || '' });
                        }}
                        className="border-gray-700"
                        data-testid={`edit-user-${user.id}`}
                      >
                        <UserCheck className="w-4 h-4" />
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleDeleteUser(user.id)}
                        className="border-red-700 text-red-500 hover:bg-red-700/10"
                        data-testid={`delete-user-${user.id}`}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        <Dialog open={!!editUser} onOpenChange={(open) => { if (!open) setEditUser(null); }}>
          <DialogContent className="bg-gray-900 text-white border-gray-800">
            <DialogHeader>
              <DialogTitle style={{ fontFamily: 'Rajdhani, sans-serif' }}>Edit Member: {editUser?.username}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label>Role</Label>
                <Select value={editForm.role} onValueChange={(v) => setEditForm({ ...editForm, role: v })}>
                  <SelectTrigger className="bg-black border-gray-700"><SelectValue /></SelectTrigger>
                  <SelectContent className="bg-gray-900 border-gray-700">
                    <SelectItem value="member">Member</SelectItem>
                    <SelectItem value="admin">Admin</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Rank</Label>
                <Input value={editForm.rank} onChange={(e) => setEditForm({ ...editForm, rank: e.target.value })} className="bg-black border-gray-700" placeholder="e.g., Sergeant, Commander" />
              </div>
              <div>
                <Label>Specialization</Label>
                <Input value={editForm.specialization} onChange={(e) => setEditForm({ ...editForm, specialization: e.target.value })} className="bg-black border-gray-700" placeholder="e.g., Assault, Recon" />
              </div>
              <div className="flex justify-end space-x-3 pt-4">
                <Button variant="outline" onClick={() => setEditUser(null)} className="border-gray-700">Cancel</Button>
                <Button onClick={handleUpdateUser} className="bg-red-700 hover:bg-red-800" data-testid="save-user-btn">Save Changes</Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </AdminLayout>
  );
};

export default UsersManager;
